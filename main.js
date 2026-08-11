const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, net } = require('electron');
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
      const chunks = [];
      res.on('data', chunk => { chunks.push(chunk); });
      res.on('end',  () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const buf = Buffer.concat(chunks);
          // Content-Type에 EUC-KR이 명시된 경우 TextDecoder로 올바르게 디코딩
          const ct = (res.headers['content-type'] || '').toLowerCase();
          if (/charset=(euc-kr|euc_kr|x-windows-949|cp949|ks_c_5601)/.test(ct)) {
            // Electron 소형-ICU 빌드는 글로벌 TextDecoder가 EUC-KR 미지원 →
            // Node.js require('util').TextDecoder는 항상 EUC-KR 지원 (KRX 코드와 동일 패턴)
            try {
              const { TextDecoder: NodeTD } = require('util');
              resolve(new NodeTD('euc-kr').decode(buf));
              return;
            } catch (_) {}
          }
          resolve(buf.toString('utf8'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
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

// ── 네이버 증권 전종목 데이터 (KOSPI / KOSDAQ / ETF) ─────────────────────────
const _naverStockCache = {};
const NAVER_STOCK_TTL  = 60 * 60 * 1000; // 1시간

const NAVER_MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const NAVER_HEADERS   = {
  'User-Agent':      NAVER_MOBILE_UA,
  'Accept':          'application/json, */*',
  'Referer':         'https://m.stock.naver.com/',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

async function fetchNaverStockList(market) {
  const MIN_CAP = 100_000_000_000; // 시총 1,000억 (원)
  const PAGE_SZ = 60;              // Naver API 최대 반환 단위 (초과하면 첫 페이지만 로드됨)
  const isEtf   = market === 'ETF';
  const results = [];

  // ── ETF: KRX API (Naver ETF API는 EUC-KR 인코딩 문제로 제거)
  //         KRX MDCSTAT04301 — OTP → CSV 2단계, 동일 parseKrxCsv 활용
  if (isEtf) {
    try {
      const KRX_ETF_OTP_QUERY = 'bld=dbms/MDC/STAT/standard/MDCSTAT04301&locale=ko_KR&share=1&money=1&csvxls_isNo=false';
      const otp = (await httpsGet(
        `https://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd?${KRX_ETF_OTP_QUERY}`,
        15000,
        { 'Referer': 'https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd',
          'Accept': 'text/plain, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }
      )).trim();
      if (!otp || otp.length < 10) throw new Error(`KRX ETF OTP 실패: "${otp.slice(0,80)}"`);
      console.log(`[StockBook] KRX ETF OTP: ${otp.slice(0,20)}...`);

      const buf = await httpsFormPostBuf(
        'https://data.krx.co.kr/comm/fileDn/download_csv.cmd',
        `code=${otp}`,
        { 'Accept': 'text/csv, application/octet-stream, */*' },
        30000
      );

      let csv;
      if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        csv = buf.toString('utf-8');
      } else {
        const { TextDecoder } = require('util');
        csv = new TextDecoder('euc-kr').decode(buf);
      }

      const toNum = s => parseFloat((s || '0').replace(/,/g, '')) || 0;
      const rows = parseKrxCsv(csv, 'ETF');
      for (const r of rows) {
        results.push({
          code:      r.ISU_SRT_CD,
          name:      r.ISU_ABBRV,
          industry:  '',
          market:    'ETF',
          price:     toNum(r.TDD_CLSPRC),
          change:    toNum(r.CMPPREVDD_PRC),
          changePct: toNum(r.FLUC_RT),
          volume:    toNum(r.ACC_TRDVOL),
          marketCap: toNum(r.MKTCAP),
          nav:       0,
        });
      }
      console.log(`[StockBook] KRX ETF 로드 완료: ${results.length}종목`);
    } catch(e) {
      console.error('[StockBook] KRX ETF 실패:', e.message);
    }
    return results;
  }

  // ── KOSPI / KOSDAQ: m.stock.naver.com 페이지 순차 조회
  for (let page = 1; page <= 30; page++) {
    const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${PAGE_SZ}`;

    let body;
    try {
      body = await httpsGet(url, 20000, NAVER_HEADERS);
    } catch(e) {
      console.error(`[StockBook] 네이버 ${market} p${page} 요청 실패:`, e.message);
      break;
    }

    let parsed;
    try { parsed = JSON.parse(body); }
    catch(pe) {
      console.error(`[StockBook] 네이버 ${market} p${page} JSON 파싱 실패, 응답 첫200자:`, body?.slice(0,200));
      break;
    }

    // KOSPI/KOSDAQ: 가능한 배열 키 모두 시도
    const items = parsed.stocks || parsed.etfs || parsed.etfItems || parsed.items
               || parsed.list   || parsed.data  || [];
    if (!items.length) {
      console.warn(`[StockBook] 네이버 ${market} p${page} 종목 없음, 응답 키:`, Object.keys(parsed));
      break;
    }

    let reachedMin = false;
    for (const s of items) {
      // 시총: Raw 필드 우선 (원 단위), 없으면 문자열 쉼표 제거 후 억→원 환산
      const cap = parseInt(s.marketValueRaw || '0', 10)
        || (parseInt((s.marketValue || s.marketCap || s.marketCapitalization ||
            s.totalMarketCap || s.marketAmount || '0').replace(/,/g, ''), 10) * 100_000_000);
      if (cap > 0 && cap < MIN_CAP) { reachedMin = true; break; }
      results.push({
        code:      s.stockCode || s.itemCode || s.etfCode || s.code || s.reutersCode?.split('.')[0] || '',
        name:      s.stockName || s.itemName || s.etfName || s.name || '',
        industry:  s.industryGroupName || s.industryName || (s.industry?.name) || s.sector || '',
        market,
        price:     parseInt(s.closePriceRaw || (s.closePrice || s.currentPrice || s.price || '0').replace(/,/g,''), 10),
        change:    parseInt(s.compareToPreviousClosePriceRaw || (s.compareToPreviousClosePrice || s.priceChange || s.change || '0').replace(/,/g,''), 10),
        changePct: parseFloat(s.fluctuationsRatio || s.changeRate || s.rateOfChange || '0'),
        volume:    parseInt(s.accumulatedTradingVolumeRaw || (s.accumulatedTradingVolume || s.volume || s.tradingVolume || '0').replace(/,/g,''), 10),
        marketCap: cap,
      });
    }
    if (reachedMin) break;

    const total = parsed.totalCount || parsed.total || parsed.stockListSize || 0;
    if (total > 0 && results.length >= total) break;
    if (items.length < PAGE_SZ) break; // 마지막 페이지
  }

  return results;
}

ipcMain.handle('fetch-naver-stocks', async (event, market) => {
  // ETF는 KRX API 사용 → 별도 캐시 키 (naver-stocks-ETF.json 구 캐시 자동 무력화)
  const cacheFile = path.join(app.getPath('userData'),
    market === 'ETF' ? 'krx-etf.json' : `naver-stocks-${market}.json`);
  const now       = Date.now();

  // 메모리 캐시 유효 시 즉시 반환
  if (_naverStockCache[market] && (now - _naverStockCache[market].ts) < NAVER_STOCK_TTL) {
    return { ok: true, data: _naverStockCache[market].data, fromCache: true, cachedAt: _naverStockCache[market].ts };
  }
  // 파일 캐시 확인
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (cached.ts && (now - cached.ts) < NAVER_STOCK_TTL) {
        _naverStockCache[market] = { data: cached.data, ts: cached.ts };
        return { ok: true, data: cached.data, fromCache: true, cachedAt: cached.ts };
      }
    } catch(_) {}
  }

  try {
    const data = await fetchNaverStockList(market);
    if (!data.length) throw new Error(`${market} 종목 0건 — 네이버 API 응답 구조 확인 필요`);
    const ts = Date.now();
    _naverStockCache[market] = { data, ts };
    try { fs.writeFileSync(cacheFile, JSON.stringify({ ts, data }), 'utf-8'); } catch(_) {}
    console.log(`[StockBook] 네이버 ${market}: ${data.length}종목 로드 완료`);
    return { ok: true, data, fromCache: false, cachedAt: ts };
  } catch(e) {
    console.error(`[StockBook] 네이버 ${market} 조회 실패:`, e.message);
    // 만료 캐시 폴백
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (cached.data && cached.data.length) {
          return { ok: true, data: cached.data, fromCache: true, stale: true, cachedAt: cached.ts };
        }
      } catch(_) {}
    }
    return { ok: false, error: e.message };
  }
});

// 종목 상세 정보 (팝업: PER·PBR·EPS, 시총·상장주식수·상장일, 52주 최고·최저, 배당)
ipcMain.handle('fetch-stock-detail', async (event, code) => {
  try {
    const base = `https://m.stock.naver.com/api/stock/${code.trim()}`;
    const [basicRes, annualRes] = await Promise.allSettled([
      httpsGet(`${base}/basic`,           10000, NAVER_HEADERS),
      httpsGet(`${base}/finance/annual`,  10000, NAVER_HEADERS),
    ]);

    const data = basicRes.status === 'fulfilled' ? JSON.parse(basicRes.value) : {};

    // annual 데이터에서 재무 지표 추출 (basic에 없는 경우 보완)
    if (annualRes.status === 'fulfilled') {
      try {
        const ann      = JSON.parse(annualRes.value);
        const rowList  = ann?.financeInfo?.rowList  || [];
        const titleList= ann?.financeInfo?.trTitleList || [];
        // 컨센서스 제외 실제 연도 중 가장 최근 key
        const realYears = titleList.filter(t => t.isConsensus === 'N');
        const latestKey = realYears[realYears.length - 1]?.key;
        const getVal = name => {
          const row = rowList.find(r => r.title === name);
          const v   = row?.columns?.[latestKey]?.value;
          return v ? v.replace(/,/g, '') : null;
        };
        // basic에 없거나 '0'인 경우에만 annual로 보완
        const setIfMissing = (field, annVal) => {
          if (annVal && (!data[field] || data[field] === '0' || data[field] === '-')) data[field] = annVal;
        };
        setIfMissing('per',           getVal('PER'));
        setIfMissing('pbr',           getVal('PBR'));
        setIfMissing('eps',           getVal('EPS'));
        setIfMissing('bps',           getVal('BPS'));
        setIfMissing('roe',           getVal('ROE'));
        setIfMissing('dividendYield', getVal('배당수익률'));
        setIfMissing('dividend',      getVal('주당배당금'));
        setIfMissing('operatingMargin', getVal('영업이익률'));
      } catch(_) {}
    }

    return { ok: true, data };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});

// ── KIS API 시세 조회 ─────────────────────────────────────────────────────────
// 토큰 캐시: 메모리 + 파일 영구 저장 (앱 재시작 후에도 유효한 토큰 재사용)
let _kisToken         = null;
let _kisTokenExpiry   = 0;
let _kisTokenPending  = null;  // 동시 토큰 발급 방지

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
  // 동시 요청이 이미 진행 중이면 같은 promise 반환 (중복 발급 방지)
  if (_kisTokenPending) return _kisTokenPending;
  _kisTokenPending = (async () => {
    try {
      // 저장된 API 키 로드
      const credFile = getCredFile('kis');
      if (!fs.existsSync(credFile)) return null;
      let creds;
      try {
        creds = JSON.parse(safeStorage.decryptString(fs.readFileSync(credFile)));
      } catch (_) { return null; }
      if (!creds?.appKey || !creds?.appSecret) return null;
      // 토큰 발급 (하루 1회 제한 — 캐시 미스 시에만 호출됨)
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
    } finally {
      _kisTokenPending = null;
    }
  })();
  return _kisTokenPending;
}

// ── KIS WebSocket 실시간 시세 ──────────────────────────────────────────────
const WebSocket = require('ws');

let _kisWs                  = null;
let _kisWsReconnectTimer    = null;
let _kisWsSubscribedTickers = [];
let _kisApprovalKey         = null;
let _kisApprovalKeyExpiry   = 0;
let _kisApprovalKeyPending  = null;  // 동시 approval_key 발급 방지
const KIS_WS_URL            = 'ws://ops.koreainvestment.com:21000';

// WebSocket용 Approval Key (access_token과 별도 발급)
async function getKisApprovalKey() {
  if (_kisApprovalKey && Date.now() < _kisApprovalKeyExpiry) return _kisApprovalKey;
  // 동시 요청 방지 — 이미 발급 중이면 같은 promise 반환
  if (_kisApprovalKeyPending) return _kisApprovalKeyPending;
  _kisApprovalKeyPending = (async () => {
    try {
      const credFile = getCredFile('kis');
      if (!fs.existsSync(credFile)) return null;
      let creds;
      try {
        creds = JSON.parse(safeStorage.decryptString(fs.readFileSync(credFile)));
      } catch (_) { return null; }
      if (!creds?.appKey || !creds?.appSecret) return null;
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
    } finally {
      _kisApprovalKeyPending = null;
    }
  })();
  return _kisApprovalKeyPending;
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

// ── KIS 잔고 조회 (보유 종목 + 예수금) ──────────────────────────────────────
ipcMain.handle('fetch-kis-balance', async () => {
  const auth = await getKisToken();
  if (!auth) return { ok: false, error: 'KIS 토큰 없음. API 키를 확인해주세요.' };

  // 저장된 계좌번호 로드 (10자리: 앞8자리=CANO, 뒤2자리=상품코드)
  let account = '';
  try {
    const credFile = getCredFile('kis');
    if (fs.existsSync(credFile)) {
      const creds = JSON.parse(safeStorage.decryptString(fs.readFileSync(credFile)));
      account = (creds?.account || '').replace(/[-\s]/g, '');
    }
  } catch (_) {}

  if (!account || account.length < 8) {
    return { ok: false, error: '계좌번호를 설정해주세요 (API 설정 > KIS 계좌번호 10자리).' };
  }

  const CANO          = account.slice(0, 8);
  const ACNT_PRDT_CD  = account.length >= 10 ? account.slice(8, 10) : '01';

  try {
    const params = new URLSearchParams({
      CANO, ACNT_PRDT_CD,
      AFHR_FLPR_YN: 'N', OFL_YN: '', INQR_DVSN: '02',
      UNPR_DVSN: '01', FUND_STTL_ICLD_YN: 'N',
      FNCG_AMT_AUTO_RDPT_YN: 'N', PRCS_DVSN: '01',
      CTX_AREA_FK100: '', CTX_AREA_NK100: '',
    });
    const body = await httpsGet(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/trading/inquire-balance?${params}`,
      15000,
      {
        authorization: `Bearer ${auth.token}`,
        appkey:        auth.appKey,
        appsecret:     auth.appSecret,
        tr_id:         'TTTC8434R',  // 실계좌 (모의투자: VTTC8434R)
      }
    );
    const d = JSON.parse(body);
    if (d?.rt_cd !== '0') {
      return { ok: false, error: d?.msg1 || `KIS API 오류 (rt_cd: ${d?.rt_cd})` };
    }

    const holdings = (d.output1 || [])
      .filter(s => parseInt(s.hldg_qty || '0') > 0)
      .map(s => ({
        code:      s.pdno || '',
        name:      s.prdt_name || '',
        qty:       parseInt(s.hldg_qty || '0'),
        avgPrice:  Math.round(parseFloat(s.pchs_avg_pric || '0')),
        price:     parseFloat(s.prpr || '0'),
        evalAmt:   parseFloat(s.evlu_amt || '0'),
        profit:    parseFloat(s.evlu_pfls_amt || '0'),
        profitPct: parseFloat(s.evlu_pfls_rt || '0'),
        cost:      parseFloat(s.pchs_amt || '0'),
      }));

    const summary   = Array.isArray(d.output2) ? d.output2[0] : (d.output2 || {});
    const cash      = parseFloat(summary.dnca_tot_amt || '0');
    const totalEval = parseFloat(summary.tot_evlu_amt || '0');

    console.log(`[StockBook] KIS 잔고: 예수금 ${cash.toLocaleString()}원, 보유 ${holdings.length}종목`);
    return { ok: true, holdings, cash, totalEval };
  } catch(e) {
    console.error('[StockBook] KIS 잔고 조회 실패:', e.message);
    return { ok: false, error: e.message };
  }
});

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

// ── KIS 호가 조회 (매도5+매수5 실시간 호가 레더) ─────────────────────────────
async function fetchKisHoga(code) {
  const auth = await getKisToken();
  if (!auth) return null;
  try {
    const body = await httpsGet(
      `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`,
      8000,
      {
        authorization: `Bearer ${auth.token}`,
        appkey:        auth.appKey,
        appsecret:     auth.appSecret,
        tr_id:         'FHKST01010200',
      }
    );
    const d = JSON.parse(body);
    const o = d?.output1;
    if (!o) return null;
    // 매도호가: askp5(가장 높음)→askp1(가장 낮음) 순으로 배열 (화면 위→아래)
    const asks = [];
    for (let i = 5; i >= 1; i--) {
      const price = parseInt(o[`askp${i}`]      || '0', 10);
      const qty   = parseInt(o[`askp_rsqn${i}`] || '0', 10);
      if (price > 0) asks.push({ price, qty });
    }
    // 매수호가: bidp1(가장 높음)→bidp5(가장 낮음) 순으로 배열
    const bids = [];
    for (let i = 1; i <= 5; i++) {
      const price = parseInt(o[`bidp${i}`]      || '0', 10);
      const qty   = parseInt(o[`bidp_rsqn${i}`] || '0', 10);
      if (price > 0) bids.push({ price, qty });
    }
    if (!asks.length || !bids.length) return null;
    return { asks, bids };
  } catch (e) {
    console.error('[StockBook] KIS 호가 조회 실패:', e.message);
    return null;
  }
}

ipcMain.handle('fetch-hoga', async (_event, code) => {
  if (!code || !/^\d{6}$/.test(code)) return null;
  return await fetchKisHoga(code);
});

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

// ── IPC: 시장 지수 티커 일괄 조회 ──────────────────────────────────────────────
ipcMain.handle('fetch-market-tickers', async () => {
  const results = {};

  // ① 코스피 / 코스닥 — 네이버 index API
  const naverIndexFetch = async (indexCode, key) => {
    for (const tryUrl of [
      `https://m.stock.naver.com/api/index/${indexCode}/basic`,
      `https://m.stock.naver.com/api/index/${indexCode}/detail`,
    ]) {
      try {
        const body   = await httpsGet(tryUrl, 12000, NAVER_HEADERS);
        const parsed = JSON.parse(body);
        // 쉼표 포함 문자열을 replace 후 파싱
        const strip = v => parseFloat(String(v || '0').replace(/,/g, ''));
        const price = strip(parsed.closePrice || parsed.currentValue || parsed.indexValue || parsed.price || '0');
        const chg   = strip(parsed.compareToPreviousClosePrice || parsed.change || '0');
        const prev  = price > 0 ? (price - chg) : 0;
        if (price > 0) {
          results[key] = { regularMarketPrice: price, previousClose: prev, chartPreviousClose: prev };
          return;
        }
      } catch(_) {}
    }
  };

  // ② 미국+한국 지수 — Yahoo Finance (Electron net.fetch로 Chromium 쿠키 세션 사용)
  // KOSPI/KOSDAQ는 Naver가 우선이고, 실패 시 Yahoo ^KS11/^KQ11로 보완
  const YF_SYMS = {
    kospi:  '^KS11',  // 코스피 폴백
    kosdaq: '^KQ11',  // 코스닥 폴백
    nasdaq: '^IXIC', sp500: '^GSPC', dow: '^DJI', sox: '^SOX', nikkei: '^N225', wti: 'CL=F',
  };
  const yfFetch = async () => {
    const symStr = Object.values(YF_SYMS).map(s => encodeURIComponent(s)).join(',');
    for (const host of ['query1', 'query2']) {
      try {
        const res  = await net.fetch(
          `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent('^IXIC')}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const meta = (await res.json())?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) {
          // IXIC 성공 시 전체 심볼 v7 quote로 일괄 조회
          const symRes = await net.fetch(
            `https://${host}.finance.yahoo.com/v7/finance/quote?lang=en-US&region=US&symbols=${symStr}`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' } }
          );
          const rows = symRes.ok ? ((await symRes.json())?.quoteResponse?.result || []) : [];
          for (const row of rows) {
            const key = Object.entries(YF_SYMS).find(([,s]) => s === row.symbol)?.[0];
            if (key && row.regularMarketPrice && !results[key]) {
              // Naver가 이미 채운 kospi/kosdaq는 덮어쓰지 않음
              results[key] = { regularMarketPrice: row.regularMarketPrice, previousClose: row.regularMarketPreviousClose || row.regularMarketPrice, chartPreviousClose: row.regularMarketPreviousClose || row.regularMarketPrice };
            }
          }
          if (!results.nasdaq && meta.regularMarketPrice) results.nasdaq = { regularMarketPrice: meta.regularMarketPrice, previousClose: meta.previousClose || meta.regularMarketPrice, chartPreviousClose: meta.previousClose || meta.regularMarketPrice };
          return;
        }
      } catch(_) {}
    }
  };

  // ③ 환율 — exchangerate-api.com (무료, API 키 불필요)
  const fxFetch = async () => {
    try {
      const res    = await net.fetch('https://api.exchangerate-api.com/v4/latest/USD', {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data   = await res.json();
      const krw    = data?.rates?.KRW;
      const jpy    = data?.rates?.JPY;
      if (krw) results.usdkrw  = { regularMarketPrice: krw,             previousClose: krw,             chartPreviousClose: krw };
      if (jpy) results.jpy     = { regularMarketPrice: 100 / jpy * 100, previousClose: 100 / jpy * 100, chartPreviousClose: 100 / jpy * 100 };
    } catch(_) {}
  };

  await Promise.all([
    naverIndexFetch('KOSPI',  'kospi'),
    naverIndexFetch('KOSDAQ', 'kosdaq'),
    yfFetch(),
    fxFetch(),
  ]);

  console.log('[StockBook] 지수 티커:', Object.entries(results).filter(([,v])=>v).map(([k])=>k).join(', '));
  return results;
});

// ── IPC: 네이버 금융 재무 데이터 (annual + summary) ─────────────────────────
ipcMain.handle('fetch-naver-finance', async (_event, code) => {
  if (!code || !/^\d{6}$/.test(code.trim())) return null;
  const base = `https://m.stock.naver.com/api/stock/${code.trim()}`;
  try {
    const [annualBody, summaryBody] = await Promise.all([
      httpsGet(`${base}/finance/annual`,  10000, NAVER_HEADERS),
      httpsGet(`${base}/finance/summary`, 10000, NAVER_HEADERS),
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
  // icon-192.png도 임시 디렉터리에 복사 (HTML의 ./icon-192.png 상대경로 참조를 위해)
  try { fs.copyFileSync(path.join(__dirname, 'icon-192.png'), path.join(app.getPath('temp'), 'icon-192.png')); } catch (e) { /* 무시 */ }

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
