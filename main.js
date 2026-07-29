const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');

// ── userData 경로 통일: 개발 모드(stockbook)와 설치 모드(Stock Book) 동일하게 ──
// 반드시 app.whenReady() 이전에 설정해야 한다.
app.name = 'StockBook';

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

// ── URL-encoded Form POST 헬퍼 (KRX API용) ──────────────────────────────────
function httpsFormPost(url, formBody, extraHeaders = {}, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const bodyBuf = Buffer.from(formBody, 'utf-8');
    const options = {
      hostname: urlObj.hostname,
      port:     parseInt(urlObj.port) || 443,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length':   bodyBuf.length,
        'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Referer':          'https://data.krx.co.kr/',
        'Origin':           'https://data.krx.co.kr',
        'Accept':           'application/json, text/plain, */*',
        'Accept-Language':  'ko-KR,ko;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
        ...extraHeaders,
      },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(bodyBuf);
    req.end();
  });
}

// ── KRX CSV 파서 (OTP 다운로드 응답용) ──────────────────────────────────────
function parseCsvLine(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur.replace(/,/g, '')); cur = ''; }
    else { cur += c; }
  }
  cols.push(cur.replace(/,/g, ''));
  return cols;
}

function parseKrxCsv(raw, market) {
  const cleaned = raw.replace(/^﻿/, '').replace(/\r/g, '');
  const lines   = cleaned.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // 헤더로 컬럼 인덱스 동적 탐색 (KRX가 컬럼 순서 바꿔도 안전)
  const headers = parseCsvLine(lines[0]);
  const ci = name => headers.findIndex(h => h.includes(name));
  const iCode = ci('종목코드'), iName = ci('종목명'),
        iClose = ci('종가'),   iChg  = ci('대비'),
        iRate  = ci('등락률'), iVol  = ci('거래량'), iCap = ci('시가총액');

  return lines.slice(1).map(line => {
    const c = parseCsvLine(line);
    const get = (i, fb) => (i >= 0 && c[i]) ? c[i].trim() : (fb >= 0 && c[fb] ? c[fb].trim() : '0');
    return {
      ISU_SRT_CD:    (iCode  >= 0 ? c[iCode]  : c[0] || '').trim(),
      ISU_ABBRV:     (iName  >= 0 ? c[iName]  : c[1] || '').trim(),
      TDD_CLSPRC:    get(iClose,  4),
      CMPPREVDD_PRC: get(iChg,    5),
      FLUC_RT:       get(iRate,   6),
      ACC_TRDVOL:    get(iVol,   10),
      MKTCAP:        get(iCap,   12),
      _market:       market,
    };
  }).filter(r => r.ISU_SRT_CD && /^\d{6}$/.test(r.ISU_SRT_CD));
}

// ── httpsFormPost — 응답을 Buffer로 반환하는 변형 (CSV 인코딩 감지용) ──────────
function httpsFormPostBuf(url, formBody, extraHeaders = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const bodyBuf = Buffer.from(formBody, 'utf-8');
    const options = {
      hostname: urlObj.hostname,
      port:     parseInt(urlObj.port) || 443,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length':   bodyBuf.length,
        'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Referer':          'https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd',
        'Origin':           'https://data.krx.co.kr',
        'Accept':           'text/csv, application/octet-stream, */*',
        'Accept-Language':  'ko-KR,ko;q=0.9',
        ...extraHeaders,
      },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(Buffer.concat(chunks));
        else reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf-8').slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(bodyBuf);
    req.end();
  });
}

// ── KRX 전종목 데이터 캐시 ───────────────────────────────────────────────────
let _krxCache     = null;
let _krxCacheTime = 0;
const KRX_CACHE_TTL = 60 * 60 * 1000; // 1시간

ipcMain.handle('fetch-krx-stocks', async () => {
  // 메모리 캐시 유효 시 즉시 반환
  if (_krxCache && (Date.now() - _krxCacheTime) < KRX_CACHE_TTL) {
    return { ok: true, data: _krxCache, fromCache: true, cachedAt: _krxCacheTime };
  }

  // 파일 캐시 확인 (앱 재시작 간 유지)
  const cacheFile = path.join(app.getPath('userData'), 'krx-stocks.json');
  if (!_krxCache && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (cached.ts && (Date.now() - cached.ts) < KRX_CACHE_TTL) {
        _krxCache     = cached.data;
        _krxCacheTime = cached.ts;
        console.log('[StockBook] KRX 파일 캐시 로드:', _krxCache.length, '종목');
        return { ok: true, data: _krxCache, fromCache: true, cachedAt: cached.ts };
      }
    } catch (_) {}
  }

  // KRX API 실시간 조회 — OTP(GET) → CSV(POST Buffer) 2단계 (세션 불필요, pykrx 방식)
  try {
    // OTP 쿼리 — URL 인코딩 없이 그대로 (KRX 서버가 / 포함 그대로 받음)
    const KRX_OTP_QUERY = mktId =>
      `bld=dbms/MDC/STAT/standard/MDCSTAT01901&locale=ko_KR&mktId=${mktId}&share=1&money=1&csvxls_isNo=false`;

    const fetchMarket = async (mktId, label) => {
      // Step 1: OTP 발급 — GET 방식 (pykrx와 동일, POST 하면 다른 응답 반환)
      const otp = (await httpsGet(
        `https://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd?${KRX_OTP_QUERY(mktId)}`,
        15000,
        {
          'Referer': 'https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd',
          'Accept':  'text/plain, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        }
      )).trim();
      if (!otp || otp.length < 10) throw new Error(`KRX OTP 발급 실패 (${label}): "${otp.slice(0, 100)}"`);
      console.log(`[StockBook] KRX ${label} OTP: ${otp.slice(0, 20)}...`);

      // Step 2: OTP로 CSV 다운로드 (POST) — Buffer 반환으로 인코딩 감지
      const buf = await httpsFormPostBuf(
        'https://data.krx.co.kr/comm/fileDn/download_csv.cmd',
        `code=${otp}`,
        { 'Accept': 'text/csv, application/octet-stream, */*' },
        30000
      );

      // 인코딩 감지: UTF-8 BOM → UTF-8, 그 외 → EUC-KR 시도
      let csv;
      if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        csv = buf.toString('utf-8'); // BOM 포함 UTF-8
      } else {
        try {
          const { TextDecoder } = require('util');
          csv = new TextDecoder('euc-kr').decode(buf);
        } catch {
          csv = buf.toString('utf-8');
        }
      }

      // CSV 유효성 확인 — 한글 헤더 없으면 오류 페이지 응답
      const firstLine = csv.slice(0, 400);
      if (!firstLine.includes('종목') && !firstLine.includes('ISU')) {
        throw new Error(`KRX ${label} CSV 형식 오류 (HTML/JSON 응답 추정). 앞부분: "${firstLine.replace(/\n/g, ' ').slice(0, 150)}"`);
      }

      const rows = parseKrxCsv(csv, label);
      if (rows.length === 0) {
        throw new Error(`KRX ${label} CSV 파싱 결과 0종목. 앞부분: "${firstLine.replace(/\n/g, ' ').slice(0, 150)}"`);
      }
      console.log(`[StockBook] KRX ${label}: ${rows.length}종목 로드 완료`);
      return rows;
    };

    const toNum = s => parseFloat((s || '0').replace(/,/g, '')) || 0;

    // KOSPI·KOSDAQ 순차 실행 (KRX 서버 부하 고려)
    const kospi  = await fetchMarket('STK', 'KOSPI');
    const kosdaq = await fetchMarket('KSQ', 'KOSDAQ');

    const parse = (rows, mkt) => rows.map(r => ({
      code:      r.ISU_SRT_CD  || '',
      name:      r.ISU_ABBRV   || '',
      market:    mkt,
      price:     toNum(r.TDD_CLSPRC),
      change:    toNum(r.CMPPREVDD_PRC),
      changePct: toNum(r.FLUC_RT),
      volume:    toNum(r.ACC_TRDVOL),
      marketCap: toNum(r.MKTCAP),
    }));

    const combined    = [...parse(kospi, 'KOSPI'), ...parse(kosdaq, 'KOSDAQ')];
    _krxCache         = combined;
    _krxCacheTime     = Date.now();

    try {
      fs.writeFileSync(cacheFile, JSON.stringify({ ts: _krxCacheTime, data: combined }), 'utf-8');
    } catch (_) {}

    console.log('[StockBook] KRX 전종목 조회 완료:', combined.length, '종목');
    return { ok: true, data: combined, fromCache: false, cachedAt: _krxCacheTime };
  } catch (e) {
    console.error('[StockBook] KRX 조회 실패:', e.message);
    // 실패 시 파일 캐시라도 반환 (만료됐어도)
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (cached.data?.length > 0) {
          console.log('[StockBook] KRX 만료 캐시 폴백:', cached.data.length, '종목');
          return { ok: true, data: cached.data, fromCache: true, cachedAt: cached.ts, stale: true };
        }
      } catch (_) {}
    }
    return { ok: false, error: e.message };
  }
});

// ── KIS API 시세 조회 ─────────────────────────────────────────────────────────
// 토큰 캐시: 메모리 + 파일 영구 저장 (앱 재시작 후에도 유효한 토큰 재사용)
let _kisToken      = null;
let _kisTokenExpiry = 0;

function getKisTokenCacheFile() {
  return path.join(app.getPath('userData'), 'kis-token-cache.json');
}

function loadKisTokenCache() {
  try {
    const cacheFile = getKisTokenCacheFile();
    if (!fs.existsSync(cacheFile)) return;
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    if (cache?.token && cache?.expiry && Date.now() < cache.expiry) {
      _kisToken       = { token: cache.token, appKey: cache.appKey, appSecret: cache.appSecret };
      _kisTokenExpiry = cache.expiry;
      console.log('[StockBook] KIS 토큰 캐시 로드 — 만료:', new Date(_kisTokenExpiry).toLocaleTimeString());
    }
  } catch (_) {}
}

function saveKisTokenCache(token, appKey, appSecret, expiry) {
  try {
    fs.writeFileSync(getKisTokenCacheFile(), JSON.stringify({ token, appKey, appSecret, expiry }), 'utf-8');
  } catch (_) {}
}

// 앱 시작 시 캐시 파일에서 토큰 로드
loadKisTokenCache();

async function getKisToken() {
  // 메모리 캐시 유효하면 바로 반환
  if (_kisToken && Date.now() < _kisTokenExpiry) return _kisToken;
  // 저장된 API 키 로드
  const credFile = getCredFile('kis');
  if (!fs.existsSync(credFile)) return null;
  let creds;
  try {
    creds = JSON.parse(safeStorage.decryptString(fs.readFileSync(credFile)));
  } catch (_) { return null; }
  if (!creds?.appKey || !creds?.appSecret) return null;
  // 토큰 발급 (하루 1회 제한 — 캐시 미스 시에만 호출됨)
  try {
    const res = JSON.parse(await httpsPost(
      'https://openapi.koreainvestment.com:9443/oauth2/tokenP',
      { grant_type: 'client_credentials', appkey: creds.appKey, appsecret: creds.appSecret }
    ));
    if (!res.access_token) return null;
    // 만료 30분 전에 갱신 (expires_in은 초 단위, 기본 86400)
    const expiry    = Date.now() + ((res.expires_in || 86400) - 1800) * 1000;
    _kisToken       = { token: res.access_token, appKey: creds.appKey, appSecret: creds.appSecret };
    _kisTokenExpiry = expiry;
    // 파일에도 저장 → 앱 재시작 후에도 재발급 없이 재사용
    saveKisTokenCache(res.access_token, creds.appKey, creds.appSecret, expiry);
    console.log('[StockBook] KIS 토큰 신규 발급 — 만료:', new Date(expiry).toLocaleTimeString());
    return _kisToken;
  } catch (e) {
    console.error('[StockBook] KIS 토큰 발급 실패:', e.message);
    return null;
  }
}

// ── KIS WebSocket 실시간 시세 ──────────────────────────────────────────────
const WebSocket = require('ws');

let _kisWs                  = null;
let _kisWsReconnectTimer    = null;
let _kisWsSubscribedTickers = [];
let _kisApprovalKey         = null;
let _kisApprovalKeyExpiry   = 0;
const KIS_WS_URL            = 'ws://ops.koreainvestment.com:21000';

// WebSocket용 Approval Key (access_token과 별도 발급)
async function getKisApprovalKey() {
  if (_kisApprovalKey && Date.now() < _kisApprovalKeyExpiry) return _kisApprovalKey;
  const credFile = getCredFile('kis');
  if (!fs.existsSync(credFile)) return null;
  let creds;
  try {
    creds = JSON.parse(safeStorage.decryptString(fs.readFileSync(credFile)));
  } catch (_) { return null; }
  if (!creds?.appKey || !creds?.appSecret) return null;
  try {
    const res = JSON.parse(await httpsPost(
      'https://openapi.koreainvestment.com:9443/oauth2/Approval',
      { grant_type: 'client_credentials', appkey: creds.appKey, secretkey: creds.appSecret }
    ));
    if (!res.approval_key) { console.error('[StockBook] KIS approval_key 없음:', JSON.stringify(res).slice(0,200)); return null; }
    _kisApprovalKey       = res.approval_key;
    _kisApprovalKeyExpiry = Date.now() + 23 * 3600 * 1000; // 23시간
    console.log('[StockBook] KIS WebSocket approval_key 발급 완료');
    return _kisApprovalKey;
  } catch (e) {
    console.error('[StockBook] KIS approval_key 발급 실패:', e.message);
    return null;
  }
}

function stopKisWebSocket() {
  if (_kisWsReconnectTimer) { clearTimeout(_kisWsReconnectTimer); _kisWsReconnectTimer = null; }
  if (_kisWs) {
    _kisWs.removeAllListeners();
    try { _kisWs.terminate(); } catch (_) {}
    _kisWs = null;
  }
  _kisWsSubscribedTickers = [];
  if (win && !win.isDestroyed()) win.webContents.send('kis-ws-status', 'disconnected');
  console.log('[StockBook] KIS WebSocket 연결 종료');
}

async function startKisWebSocket(tickers) {
  stopKisWebSocket();
  if (!tickers || tickers.length === 0) return;

  const approvalKey = await getKisApprovalKey();
  if (!approvalKey) {
    console.log('[StockBook] KIS WebSocket: approval_key 없음 → 실시간 시세 비활성화');
    if (win && !win.isDestroyed()) win.webContents.send('kis-ws-status', 'no-key');
    return;
  }

  _kisWsSubscribedTickers = [...tickers];
  console.log(`[StockBook] KIS WebSocket 연결 시도 (${tickers.length}종목: ${tickers.join(',')})`);
  if (win && !win.isDestroyed()) win.webContents.send('kis-ws-status', 'connecting');

  const ws = new WebSocket(KIS_WS_URL);
  _kisWs = ws;

  ws.on('open', () => {
    console.log('[StockBook] KIS WebSocket 연결됨 → 종목 구독 시작');
    if (win && !win.isDestroyed()) win.webContents.send('kis-ws-status', 'connected');
    for (const ticker of tickers) {
      ws.send(JSON.stringify({
        header: { approval_key: approvalKey, custtype: 'P', tr_type: '1', 'content-type': 'utf-8' },
        body:   { input: { tr_id: 'H0STCNT0', tr_key: ticker } }
      }));
    }
  });

  ws.on('message', (raw) => {
    const msg = raw.toString('utf-8');

    // PINGPONG 하트비트
    if (msg === 'PINGPONG') { ws.send('PINGPONG'); return; }

    // JSON 응답 (구독 확인/에러)
    if (msg.startsWith('{')) {
      try {
        const j = JSON.parse(msg);
        const b = j?.body;
        if (b?.rt_cd === '0') console.log('[StockBook] KIS 구독 확인:', b.msg1);
        else if (b?.rt_cd)    console.warn('[StockBook] KIS 구독 응답:', b.msg1, b.msg_cd);
      } catch (_) {}
      return;
    }

    // 실시간 시세: "0|H0STCNT0|001|005930^153000^..."
    const parts = msg.split('|');
    if (parts.length < 4 || parts[0] === '1') return; // 암호화 데이터 무시
    if (parts[1] !== 'H0STCNT0') return;

    const fields     = parts[3].split('^');
    const ticker     = fields[0];
    const price      = parseInt(fields[2], 10);
    const changeSign = fields[3]; // 2:상승 5:하락 3:보합
    const change     = parseInt(fields[4], 10);
    const changePct  = parseFloat(fields[5]);
    if (!ticker || isNaN(price) || price <= 0) return;

    const signed = (changeSign === '5' || changeSign === '4') ? -1 : 1;
    if (win && !win.isDestroyed()) {
      win.webContents.send('kis-price-update', {
        ticker,
        price,
        change:    signed * Math.abs(change),
        changePct: signed * Math.abs(changePct),
      });
    }
  });

  ws.on('error', (err) => {
    console.error('[StockBook] KIS WebSocket 오류:', err.message);
    if (win && !win.isDestroyed()) win.webContents.send('kis-ws-status', 'error');
  });

  ws.on('close', (code) => {
    console.log(`[StockBook] KIS WebSocket 종료 (code: ${code})`);
    _kisWs = null;
    if (win && !win.isDestroyed()) win.webContents.send('kis-ws-status', 'disconnected');
    // 자동 재연결 (5초 후) — 의도적 종료가 아닐 때
    if (_kisWsSubscribedTickers.length > 0) {
      _kisWsReconnectTimer = setTimeout(() => startKisWebSocket(_kisWsSubscribedTickers), 5000);
    }
  });
}

ipcMain.handle('start-kis-realtime', async (_e, tickers) => {
  await startKisWebSocket(tickers);
  return { ok: true };
});

ipcMain.handle('stop-kis-realtime', async () => {
  _kisWsSubscribedTickers = []; // 재연결 방지
  stopKisWebSocket();
  return { ok: true };
});

ipcMain.handle('get-kis-ws-status', () => {
  if (!_kisWs) return 'disconnected';
  const s = _kisWs.readyState;
  if (s === WebSocket.CONNECTING) return 'connecting';
  if (s === WebSocket.OPEN)       return 'connected';
  return 'disconnected';
});

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

// ── IPC: 시장 지수 티커 일괄 조회 (CORS 우회 — main 프로세스에서 실행) ────────
ipcMain.handle('fetch-market-tickers', async () => {
  const symbols = {
    kospi:  '^KS11',
    kosdaq: '^KQ11',
    nasdaq: '^IXIC',
    sp500:  '^GSPC',
    dow:    '^DJI',
    sox:    '^SOX',
    usdkrw: 'KRW=X',
    jpy:    'JPY=X',
    nikkei: '^N225',
    wti:    'CL=F',
  };

  const fetchSym = async (sym) => {
    for (const host of ['query1', 'query2']) {
      try {
        const body = await httpsGet(
          `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
          15000
        );
        const meta = JSON.parse(body)?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) return meta;
      } catch (_) {}
    }
    return null;
  };

  const results = {};
  await Promise.all(
    Object.entries(symbols).map(async ([key, sym]) => {
      results[key] = await fetchSym(sym);
    })
  );
  console.log('[StockBook] 지수 티커:', Object.entries(results).filter(([,v])=>v).map(([k])=>k).join(', '));
  return results;
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
// 앱 버전 조회 (인트로 동적 반영용)
ipcMain.handle('get-version', () => app.getVersion());

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
  // 스플래시 버전 텍스트를 package.json 버전으로 동적 반영
  splash.webContents.on('did-finish-load', () => {
    splash.webContents.executeJavaScript(
      `var el = document.querySelector('.version'); if(el) el.textContent = 'v${app.getVersion()}';`
    ).catch(() => {});
  });

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

  // ── F12 DevTools 토글 (설치 버전에서도 디버깅 가능) ─────────────────────────
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
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
