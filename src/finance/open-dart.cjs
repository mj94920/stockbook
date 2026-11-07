const https = require('node:https');
const fs = require('node:fs');
const { inflateRawSync } = require('node:zlib');

const maxZip = 16 * 1024 * 1024;
const maxXml = 64 * 1024 * 1024;
const knownAccounts = new Set(['매출액', '영업이익', '당기순이익', '자산총계', '부채총계', '자본총계']);
const failure = code => ({ ok: false, code });

function statusCode(status) {
  if (['010', '011', '901'].includes(status)) return 'KEY_INVALID';
  if (status === '012') return 'IP_DENIED';
  if (status === '020') return 'LIMIT';
  if (['013', '014'].includes(status)) return 'NO_DATA';
  return 'SERVICE';
}

function requestDart(endpoint, params, maxBytes) {
  const url = new URL(endpoint, 'https://opendart.fss.or.kr/api/');
  url.search = new URLSearchParams(params).toString();
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'StockBook' },
      signal: AbortSignal.timeout(15000),
    }, response => {
      if (response.statusCode !== 200) {
        response.destroy();
        reject(new Error('DART HTTP failure'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error('DART response exceeds limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

function corpCodeXml(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > zip.length || end + 22 + zip.readUInt16LE(end + 20) !== zip.length) {
    throw new Error('Invalid DART ZIP directory');
  }
  const total = zip.readUInt16LE(end + 10);
  let entry = zip.readUInt32LE(end + 16);
  for (let i = 0; i < total && entry + 46 <= end; i++) {
    if (zip.readUInt32LE(entry) !== 0x02014b50) break;
    const nameLength = zip.readUInt16LE(entry + 28);
    const next = entry + 46 + nameLength + zip.readUInt16LE(entry + 30) + zip.readUInt16LE(entry + 32);
    if (next > end) break;
    const name = zip.toString('ascii', entry + 46, entry + 46 + nameLength);
    if (name.toUpperCase() === 'CORPCODE.XML') {
      const method = zip.readUInt16LE(entry + 10);
      const size = zip.readUInt32LE(entry + 20);
      const unpacked = zip.readUInt32LE(entry + 24);
      const local = zip.readUInt32LE(entry + 42);
      if (zip.readUInt16LE(entry + 8) & 1 || unpacked > maxXml || local + 30 > entry ||
          zip.readUInt32LE(local) !== 0x04034b50) break;
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      if (start + size > entry || ![0, 8].includes(method)) break;
      const data = zip.subarray(start, start + size);
      const xml = method === 0 ? data : inflateRawSync(data, { maxOutputLength: maxXml });
      if (xml.length === unpacked) return xml.toString('utf8');
      break;
    }
    entry = next;
  }
  throw new Error('DART corporate code XML missing or invalid');
}

function readCorpCodes(bytes) {
  if (bytes.subarray(0, 2).toString('ascii') !== 'PK') {
    return failure(statusCode(/<status>\s*(\d{3})\s*<\/status>/.exec(bytes.toString('utf8'))?.[1]));
  }
  const codes = new Map();
  for (const [, item] of corpCodeXml(bytes).matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const code = /<stock_code>\s*(\d{6})\s*<\/stock_code>/.exec(item)?.[1];
    const corp = /<corp_code>\s*(\d{8})\s*<\/corp_code>/.exec(item)?.[1];
    if (!code || !corp) continue;
    if (codes.has(code) && codes.get(code) !== corp) codes.set(code, null);
    else codes.set(code, corp);
  }
  return codes.size ? { ok: true, codes } : failure('SERVICE');
}

function readAnnual(bytes, stockCode, year, fetchedAt) {
  const payload = JSON.parse(bytes.toString('utf8'));
  if (payload.status !== '000') return failure(statusCode(payload.status));
  if (!Array.isArray(payload.list)) return failure('SERVICE');
  const rows = [];
  const netIncomeRows = new Set();
  for (const row of payload.list) {
    if (row?.stock_code !== stockCode || row.bsns_year !== year || row.reprt_code !== '11011' ||
        !['CFS', 'OFS'].includes(row.fs_div)) continue;
    const account = row.account_nm === '당기순이익(손실)' ? '당기순이익' : row.account_nm;
    if (!knownAccounts.has(account)) continue;

    const amount = typeof row.thstrm_amount === 'string' ? row.thstrm_amount.trim() : '';
    const entry = {
      statement: row.fs_div,
      account,
      amount: /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(amount) ? amount : null,
      currency: /^[A-Z]{3}$/.test(row.currency ?? '') ? row.currency : null,
      receipt: /^\d{14}$/.test(row.rcept_no ?? '') ? row.rcept_no : null,
    };
    if (account === '당기순이익') {
      const key = JSON.stringify([entry.statement, entry.amount, entry.currency, entry.receipt]);
      if (netIncomeRows.has(key)) continue;
      netIncomeRows.add(key);
    }
    rows.push(entry);
  }
  return rows.length ? { ok: true, year, reportCode: '11011', fetchedAt, rows } : failure('NO_DATA');
}

function registerOpenDart({ ipcMain, getMainWindow, getKeyFile, safeStorage, request = requestDart }) {
  let cached;
  let pending;
  let keyVersion = 0;
  const handle = (channel, action) => ipcMain.handle(channel, async (event, ...args) => {
    const webContents = getMainWindow()?.webContents;
    if (!webContents || event.sender !== webContents || event.senderFrame !== webContents.mainFrame) {
      return failure('FORBIDDEN');
    }
    try { return await action(...args); }
    catch { return failure('SERVICE'); }
  });
  function loadKey() {
    if (!fs.existsSync(getKeyFile())) return null;
    if (!safeStorage.isEncryptionAvailable()) return failure('STORAGE');
    try {
      return safeStorage.decryptString(fs.readFileSync(getKeyFile()));
    } catch {
      return failure('STORAGE');
    }
  }
  function resetCache() {
    keyVersion++;
    cached = undefined;
    pending = undefined;
  }
  async function corpCodes(key, refresh = false) {
    if (!refresh && cached?.expiresAt > Date.now()) return cached.result;
    if (pending) return pending;
    const version = keyVersion;
    pending = (async () => {
      try {
        const result = readCorpCodes(await request('corpCode.xml', { crtfc_key: key }, maxZip));
        if (result.ok && version === keyVersion) cached = { result, expiresAt: Date.now() + 86400000 };
        return result;
      } finally {
        if (version === keyVersion) pending = undefined;
      }
    })();
    return pending;
  }

  handle('dart-key-status', () => ({ ok: true, registered: fs.existsSync(getKeyFile()) }));
  handle('dart-key-save', input => {
    const key = typeof input === 'string' ? input.trim() : '';
    if (!/^[a-z0-9]{40}$/i.test(key)) return failure('KEY_FORMAT');
    if (!safeStorage.isEncryptionAvailable()) return failure('STORAGE');
    const file = getKeyFile();
    const temp = file + '.tmp';
    try {
      fs.writeFileSync(temp, safeStorage.encryptString(key));
      fs.renameSync(temp, file);
    } catch {
      try { fs.rmSync(temp, { force: true }); } catch {}
      return failure('STORAGE');
    }
    resetCache();
    return { ok: true };
  });
  handle('dart-key-delete', () => {
    try { fs.rmSync(getKeyFile(), { force: true }); }
    catch { return failure('STORAGE'); }
    resetCache();
    return { ok: true };
  });
  handle('dart-key-test', async () => {
    const key = loadKey();
    if (typeof key !== 'string') return key || failure('KEY_MISSING');
    const version = keyVersion;
    const result = await corpCodes(key, true);
    if (version !== keyVersion) return failure('KEY_CHANGED');
    return result.ok ? { ok: true } : result;
  });
  handle('dart-annual', async (stockCode, year) => {
    const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
    if (typeof stockCode !== 'string' || !/^\d{6}$/.test(stockCode) ||
        typeof year !== 'string' || !/^\d{4}$/.test(year) ||
        Number(year) < 2015 || Number(year) > currentYear) return failure('INPUT');
    const key = loadKey();
    if (typeof key !== 'string') return key || failure('KEY_MISSING');
    const version = keyVersion;
    const index = await corpCodes(key);
    if (version !== keyVersion) return failure('KEY_CHANGED');
    if (!index.ok) return index;
    const corpCode = index.codes.get(stockCode);
    if (!corpCode) return failure('CORP_NOT_FOUND');
    const bytes = await request('fnlttSinglAcnt.json', {
      crtfc_key: key, corp_code: corpCode, bsns_year: year, reprt_code: '11011',
    }, 1024 * 1024);
    return version === keyVersion ? readAnnual(bytes, stockCode, year, new Date().toISOString()) : failure('KEY_CHANGED');
  });
}

module.exports = { registerOpenDart, readAnnual, readCorpCodes };
