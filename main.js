const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');

let win;

// ── 데이터 파일 경로: %APPDATA%\StockBook\stockbook-data.json ──────────────
function getDataFile() {
  return path.join(app.getPath('userData'), 'stockbook-data.json');
}

// ── 내부 HTTPS 헬퍼 (CORS 제한 없음) ────────────────────────────────────────
function httpsGet(url, timeoutMs = 8000, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept':     'application/json, text/plain, */*',
        ...extraHeaders,
      }
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end',  () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function httpsPost(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const json    = JSON.stringify(body);
    const urlObj  = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port:     parseInt(urlObj.port) || 443,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(json),
        ...extraHeaders,
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(json);
    req.end();
  });
}

// ── KIS API 시세 조회 ─────────────────────────────────────────────────────────
// 메모리 내 토큰 캐시 (앱 재시작 시 초기화)
let _kisToken      = null;
let _kisTokenExpiry = 0;

async function getKisToken() {
  // 유효한 캐시 토큰 재사용
  if (_kisToken && Date.now() < _kisTokenExpiry) return _kisToken;
  // 저장된 API 키 로드
  const credFile = getCredFile('kis');
  if (!fs.existsSync(credFile)) return null;
  let creds;
  try {
    creds = JSON.parse(safeStorage.decryptString(fs.readFileSync(credFile)));
  } catch (_) { return null; }
  if (!creds?.appKey || !creds?.appSecret) return null;
  // 토큰 발급
  try {
    const res = JSON.parse(await httpsPost(
      'https://openapi.koreainvestment.com:9443/oauth2/tokenP',
      { grant_type: 'client_credentials', appkey: creds.appKey, appsecret: creds.appSecret }
    ));
    if (!res.access_token) return null;
    _kisToken       = { token: res.access_token, appKey: creds.appKey, appSecret: creds.appSecret };
    // 만료 30분 전에 갱신 (expires_in은 초 단위, 기본 86400)
    _kisTokenExpiry = Date.now() + ((res.expires_in || 86400) - 1800) * 1000;
    console.log('[StockBook] KIS 토큰 발급 완료 — 만료:', new Date(_kisTokenExpiry).toLocaleTimeString());
    return _kisToken;
  } catch (e) {
    console.error('[StockBook] KIS 토큰 발급 실패:', e.message);
    return null;
  }
}

async function fetchKisPrice(code) {
  const auth = await getKisToken();
  if (!auth) return null;
  try {
    const body = await httpsGet(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`,
      10000,
      {
        authorization: `Bearer ${auth.token}`,
        appkey:        auth.appKey,
        appsecret:     auth.appSecret,
        tr_id:         'FHKST01010100',
      }
    );
    const d = JSON.parse(body);
    const o = d?.output;
    if (!o?.stck_prpr) return null;
    const price     = parseFloat(o.stck_prpr);   // 현재가
    const prevClose = parseFloat(o.stck_sdpr);   // 전일 종가
    const openPrice = parseFloat(o.stck_oprc);   // 시가
    if (!price) return null;
    return {
      symbol:    code,
      price,
      prevClose: prevClose || null,
      openPrice: openPrice || null,
      currency:  'KRW',
      source:    'KIS',
    };
  } catch (e) {
    console.error('[StockBook] KIS 시세 조회 실패:', e.message);
    return null;
  }
}

// ── IPC: 시세 조회 (main 프로세스에서 직접 요청 → CORS 없음) ────────────────
ipcMain.handle('fetch-quote', async (_event, rawTicker) => {
  if (!rawTicker) return null;
  rawTicker = rawTicker.trim();
  const isKrNum = /^\d{6}$/.test(rawTicker);

  // 야후 v7 quote API 파서 (실시간 시세, 가장 정확)
  const parseYFv7 = (body, symbol) => {
    try {
      const d      = JSON.parse(body);
      const result = d?.quoteResponse?.result?.[0];
      if (!result?.regularMarketPrice) return null;
      return {
        symbol,
        price:     result.regularMarketPrice,
        prevClose: result.regularMarketPreviousClose ?? null,
        openPrice: result.regularMarketOpen          ?? null,
        currency:  result.currency                   ?? 'USD',
      };
    } catch (_) { return null; }
  };

  // 야후 v7 quote 조회 (query1 → query2 순)
  const fetchYFv7 = async (sym) => {
    for (const host of ['query1', 'query2']) {
      try {
        const body = await httpsGet(
          `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}`
        );
        const result = parseYFv7(body, sym);
        if (result) return result;
      } catch (_) {}
    }
    return null;
  };

  if (isKrNum) {
    // 1) KIS REST API (API 키 등록 시 — 실시간 공식 데이터)
    const kisResult = await fetchKisPrice(rawTicker);
    if (kisResult) return kisResult;

    // 2) 네이버 금융 (KIS 미등록 또는 실패 시 폴백)
    try {
      const body = await httpsGet(`https://m.stock.naver.com/api/stock/${rawTicker}/basic`);
      const d    = JSON.parse(body);
      const price  = parseFloat((d.closePrice                 || '0').replace(/,/g, ''));
      const change = parseFloat((d.compareToPreviousClosePrice || '0').replace(/,/g, ''));
      const openP  = parseFloat((d.openPrice                  || '0').replace(/,/g, ''));
      if (price) return {
        symbol:    rawTicker,
        price,
        prevClose: Math.round((price - change) * 100) / 100,
        openPrice: openP || null,
        currency:  'KRW',
      };
    } catch (_) { /* 네이버 실패 시 야후 폴백 */ }

    // 3) 야후 파이낸스 v7 quote .KS / .KQ
    for (const suffix of ['.KS', '.KQ']) {
      const result = await fetchYFv7(rawTicker + suffix);
      if (result) return { ...result, currency: result.currency || 'KRW' };
    }
    return null;
  }

  // 해외 종목 — 야후 v7 quote
  const sym = rawTicker.toUpperCase();
  const result = await fetchYFv7(sym);
  if (result) return result;
  // v7 실패 시 v8 chart 폴백
  try {
    const body = await httpsGet(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d&includePrePost=false`
    );
    const d    = JSON.parse(body);
    const meta = d?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice) return {
      symbol:    sym,
      price:     meta.regularMarketPrice,
      prevClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
      openPrice: meta.regularMarketOpen ?? null,
      currency:  meta.currency ?? 'USD',
    };
  } catch (_) {}
  try {
    const body = await httpsGet(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d&includePrePost=false`
    );
    const d    = JSON.parse(body);
    const meta = d?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice) return {
      symbol:    sym,
      price:     meta.regularMarketPrice,
      prevClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
      openPrice: meta.regularMarketOpen ?? null,
      currency:  meta.currency ?? 'USD',
    };
  } catch (_) {}
  return null;
});

// ── IPC: 네이버 금융 재무 데이터 (annual + summary) ─────────────────────────
ipcMain.handle('fetch-naver-finance', async (_event, code) => {
  if (!code || !/^\d{6}$/.test(code.trim())) return null;
  const base = `https://m.stock.naver.com/api/stock/${code.trim()}`;
  try {
    const [annualBody, summaryBody] = await Promise.all([
      httpsGet(`${base}/finance/annual`),
      httpsGet(`${base}/finance/summary`),
    ]);
    return {
      annual:  JSON.parse(annualBody),
      summary: JSON.parse(summaryBody),
    };
  } catch (e) {
    console.error('[StockBook] fetch-naver-finance 오류:', e.message);
    return null;
  }
});

// ── IPC: API 키 암호화 저장 (safeStorage) ───────────────────────────────────
function getCredFile(broker) {
  return path.join(app.getPath('userData'), `${broker}-cred.enc`);
}

ipcMain.handle('save-api-key', async (_event, { broker, fields }) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'safeStorage 불가' };
    const encrypted = safeStorage.encryptString(JSON.stringify(fields));
    fs.writeFileSync(getCredFile(broker), encrypted);
    return { ok: true };
  } catch (e) {
    console.error('[StockBook] save-api-key 오류:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('load-api-key', async (_event, broker) => {
  try {
    const f = getCredFile(broker);
    if (!fs.existsSync(f)) return null;
    const buf = fs.readFileSync(f);
    return JSON.parse(safeStorage.decryptString(buf));
  } catch (e) {
    console.error('[StockBook] load-api-key 오류:', e.message);
    return null;
  }
});

ipcMain.handle('delete-api-key', async (_event, broker) => {
  try {
    const f = getCredFile(broker);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('check-api-key', async (_event, broker) => {
  return fs.existsSync(getCredFile(broker));
});

// ── IPC 핸들러 ──────────────────────────────────────────────────────────────
ipcMain.handle('load-state', async () => {
  try {
    const f = getDataFile();
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8');
  } catch (e) {}
  return null;
});

ipcMain.handle('save-state', async (_event, data) => {
  try {
    const f = getDataFile();
    const tmp = f + '.tmp';
    // 임시 파일에 먼저 쓰고 원자적으로 교체 (저장 중 크래시 시 데이터 보호)
    fs.writeFileSync(tmp, data, 'utf-8');
    fs.renameSync(tmp, f);
    // 하루 1회 .bak 백업 (날짜가 바뀐 경우에만)
    const bak = f + '.bak';
    const today = new Date().toDateString();
    let bakDate = null;
    try { bakDate = fs.statSync(bak).mtime.toDateString(); } catch {}
    if (bakDate !== today) fs.copyFileSync(f, bak);
    return true;
  } catch (e) {
    console.error('[StockBook] save-state 오류:', e);
    return false;
  }
});

ipcMain.handle('show-confirm', async (_event, message) => {
  const result = await dialog.showMessageBox(win, {
    type:      'question',
    buttons:   ['취소', '확인'],
    defaultId: 1,
    cancelId:  0,
    message:   message
  });
  return result.response === 1;
});

// ── 창 생성 ──────────────────────────────────────────────────────────────────
function createWindow() {
  // ── 스플래시 스크린 ───────────────────────────────────────────────────────
  const splash = new BrowserWindow({
    width:           400,
    height:          260,
    frame:           false,
    transparent:     true,
    alwaysOnTop:     true,
    resizable:       false,
    skipTaskbar:     true,
    icon:            path.join(__dirname, 'icon-512.png'),
    backgroundColor: '#00000000',
    webPreferences:  { nodeIntegration: false, contextIsolation: true }
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.center();

  // HTML 파일을 임시 ASCII 경로에 복사 후 로드 (Electron 파일 로드 안정성)
  const srcHtml = path.join(__dirname, 'index.html');
  const tmpHtml = path.join(app.getPath('temp'), 'stockbook-app.html');
  try { fs.copyFileSync(srcHtml, tmpHtml); } catch (e) {
    console.error('[StockBook] HTML 복사 실패:', e);
  }

  win = new BrowserWindow({
    width:     1440,
    height:    920,
    minWidth:  900,
    minHeight: 600,
    title: 'Stock Book — 주식 포트폴리오',
    icon: path.join(__dirname, 'icon-512.png'),
    backgroundColor: '#0d1421', // 로딩 중 흰 화면 번쩍임 방지
    show: false,                // 완전히 렌더링된 후 표시
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile(tmpHtml);
  win.setMenuBarVisibility(false);
  // 스플래시 최소 1.4초 표시 후 메인 창 표시, 스플래시 닫기
  win.once('ready-to-show', () => {
    setTimeout(() => {
      win.show();
      if (!splash.isDestroyed()) splash.close();
    }, 1400);
  });

  // ── 외부 URL은 모두 시스템 기본 브라우저로 열기 ──────────────────────────
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // ── 페이지 완전 로드 후 파일에서 직접 push (가장 확실한 로드 방법) ──────
  win.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      const f = getDataFile();
      console.log('[StockBook] push-state 시도:', f);
      if (fs.existsSync(f)) {
        try {
          const data = fs.readFileSync(f, 'utf-8');
          win.webContents.send('push-state', data);
          console.log('[StockBook] push-state 전송 완료:', data.length, 'bytes');
        } catch (e) {
          console.error('[StockBook] push-state 오류:', e);
        }
      } else {
        console.log('[StockBook] 데이터 파일 없음 — push 스킵');
      }
    }, 300);
  });
}

app.whenReady().then(() => {
  console.log('[StockBook] userData 경로:', app.getPath('userData'));
  console.log('[StockBook] 데이터 파일:', getDataFile());
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
