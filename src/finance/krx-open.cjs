'use strict';

const fs = require('node:fs');
const { createHistoryStore, collectHistory } = require('./krx-history.cjs');
const { coverage } = require('./krx-calendar.cjs');

const origin = 'https://data-dbg.krx.co.kr/svc/apis/sto/';
const fields = ['open', 'high', 'low', 'close', 'volume', 'value'];
const failure = code => ({ ok: false, code });
const dateDigits = value => typeof value === 'string' ? value.replaceAll('-', '') : '';

function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2010-01-04') return false;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}

function numbers(row, names) {
  const values = names.map(name => {
    const value = row[name];
    if (typeof value !== 'string' || !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) return NaN;
    return Number(value.replaceAll(',', ''));
  });
  if (!values.every(Number.isSafeInteger)) return null;
  return Object.fromEntries(fields.map((field, index) => [field, values[index]]));
}

async function krxRows(fetch, endpoint, date, key, signal) {
  const response = await fetch(origin + endpoint + '?basDd=' + dateDigits(date), {
    headers: { AUTH_KEY: key, Accept: 'application/json' },
    redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
  });
  if (response.status === 401 || response.status === 403) return failure('ACCESS');
  if (response.status === 429) return failure('LIMIT');
  if (!response.ok) return failure('SERVICE');
  const text = await response.text();
  if (text.length > 4000000) return failure('FORMAT');
  const { OutBlock_1: rows } = JSON.parse(text);
  return Array.isArray(rows) ? { ok: true, rows } : failure('FORMAT');
}

async function readKrxDay(fetch, code, date, key, signal) {
  const lookup = name => krxRows(fetch, name, date, key, signal).catch(() => failure('SERVICE'));
  const [trades, master] = await Promise.all([lookup('stk_bydd_trd'), lookup('stk_isu_base_info')]);
  const services = { daily: trades.ok ? 'OK' : trades.code, basic: master.ok ? 'OK' : master.code };
  if (!trades.ok || !master.ok) return { ...failure(Object.values(services).includes('LIMIT') ? 'LIMIT' : 'API'), services };
  const matches = master.rows.filter(row => row?.ISU_SRT_CD === code);
  const info = matches.length === 1 ? matches[0] : null;
  if (matches.length > 1) return { ...failure('FORMAT'), services };
  if (!info || !/^KR[A-Z0-9]{10}$/.test(info.ISU_CD)) return { ...failure('NO_DATA'), services, marketHasData: trades.rows.length > 0 };
  const daily = trades.rows.filter(row => dateDigits(row?.BAS_DD) === dateDigits(date) &&
    (row.ISU_CD === code || row.ISU_CD === info.ISU_CD));
  const values = daily.length === 1 && numbers(daily[0],
    ['TDD_OPNPRC', 'TDD_HGPRC', 'TDD_LWPRC', 'TDD_CLSPRC', 'ACC_TRDVOL', 'ACC_TRDVAL']);
  if (!daily.length) return { ...failure('NO_DATA'), services, marketHasData: trades.rows.length > 0 };
  if (!values || values.low > Math.min(values.open, values.close) ||
      values.high < Math.max(values.open, values.close)) return { ...failure('FORMAT'), services };
  return {
    ok: true, services, code, date, fetchedAt: new Date().toISOString(), values,
    name: String(info.ISU_ABBRV || info.ISU_NM || '').slice(0, 100),
    market: String(info.MKT_TP_NM || '').slice(0, 50),
    listed: /^\d{8}$/.test(dateDigits(info.LIST_DD)) ? dateDigits(info.LIST_DD) : '',
    isin: info.ISU_CD,
  };
}

async function kisDaily({ httpsGet, getKisToken }, code, date) {
  const auth = await getKisToken();
  if (!auth) return failure('KIS_MISSING');
  const day = dateDigits(date);
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: day, FID_INPUT_DATE_2: day,
    FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '1',
  });
  const body = await httpsGet('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?' + params,
    8000, { authorization: 'Bearer ' + auth.token, appkey: auth.appKey, appsecret: auth.appSecret,
      tr_id: 'FHKST03010100', custtype: 'P' }, { signal: AbortSignal.timeout(10000) });
  const data = JSON.parse(body);
  if (data.rt_cd !== '0' || data.output1?.stck_shrn_iscd !== code || !Array.isArray(data.output2)) return failure('KIS_SERVICE');
  const rows = data.output2.filter(row => row?.stck_bsop_date === day);
  const values = rows.length === 1 && numbers(rows[0],
    ['stck_oprc', 'stck_hgpr', 'stck_lwpr', 'stck_clpr', 'acml_vol', 'acml_tr_pbmn']);
  return values ? { ok: true, values } : failure('KIS_NO_DATA');
}

function registerKrxOpen({ ipcMain, getMainWindow, getPageUrl, getKeyFile, getHistoryFile, safeStorage, httpsGet, getKisToken, fetch = globalThis.fetch }) {
  let version = 0;
  let busy = false;
  let collection = null;
  let progress = null;
  const store = getHistoryFile ? createHistoryStore({ getFile: getHistoryFile, safeStorage }) : null;
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    const contents = getMainWindow()?.webContents;
    const pageUrl = getPageUrl();
    if (!pageUrl || !contents || event.sender !== contents || event.senderFrame !== contents.mainFrame ||
        event.senderFrame?.url.split('#')[0] !== pageUrl) return failure('FORBIDDEN');
    try { return await fn(...args); }
    catch { return failure('SERVICE'); }
  });
  const canEncrypt = () => safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  handle('krx-open-status', () => ({ ok: true, registered: fs.existsSync(getKeyFile()), busy, progress }));
  handle('krx-open-cancel', () => {
    collection?.abort();
    return { ok: true };
  });
  handle('krx-open-save', input => {
    const key = typeof input === 'string' ? input.trim() : '';
    if (!/^[!-~]{1,256}$/.test(key)) return failure('KEY_FORMAT');
    if (!canEncrypt()) return failure('STORAGE');
    const file = getKeyFile();
    const temp = file + '.tmp';
    try {
      fs.writeFileSync(temp, safeStorage.encryptString(key), { mode: 0o600 });
      fs.renameSync(temp, file);
    } catch {
      try { fs.rmSync(temp, { force: true }); } catch {}
      return failure('STORAGE');
    }
    version++;
    collection?.abort();
    return { ok: true };
  });
  handle('krx-open-delete', () => {
    try { fs.rmSync(getKeyFile(), { force: true }); }
    catch { return failure('STORAGE'); }
    version++;
    collection?.abort();
    return { ok: true };
  });
  handle('krx-open-lookup', async (code, date) => {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !validDate(date)) return failure('INPUT');
    if (busy) return failure('BUSY');
    if (!fs.existsSync(getKeyFile())) return failure('KEY_MISSING');
    if (!canEncrypt()) return failure('STORAGE');
    let key;
    try { key = safeStorage.decryptString(fs.readFileSync(getKeyFile())); }
    catch { return failure('STORAGE'); }
    const current = version;
    busy = true;
    try {
      const result = await readKrxDay(fetch, code, date, key);
      if (current !== version) return failure('KEY_CHANGED');
      if (!result.ok) {
        store?.recordCheck(code, date, result);
        return result;
      }
      const comparison = code === '005930'
        ? await kisDaily({ httpsGet, getKisToken }, code, date).catch(() => failure('KIS_SERVICE'))
        : null;
      if (current !== version) return failure('KEY_CHANGED');
      if (store) {
        try { store.save(result); store.recordCheck(code, date, result); }
        catch { return failure('STORAGE'); }
      }
      return { ...result, comparison };
    } finally {
      busy = false;
    }
  });
  handle('krx-open-history', async (code, start, end, collect = false) => {
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !validDate(start) || !validDate(end) ||
        start > end || end > today || typeof collect !== 'boolean') return failure('INPUT');
    if (!store || !canEncrypt()) return failure('STORAGE');
    if (busy) return failure('BUSY');
    if (!collect) {
      try {
        const rows = store.read(code, start, end);
        return { ok: true, rows, partial: false, savedOnly: true,
          coverage: coverage(code, start, end, rows, store.readChecks(code, start, end)) };
      }
      catch { return failure('STORAGE'); }
    }
    if (!fs.existsSync(getKeyFile())) return failure('KEY_MISSING');
    let key;
    try { key = safeStorage.decryptString(fs.readFileSync(getKeyFile())); }
    catch { return failure('STORAGE'); }
    const current = version;
    collection = new AbortController();
    const controller = collection;
    busy = true;
    try {
      const result = await collectHistory({
        code, start, end, store, signal: controller.signal,
        onProgress: value => { progress = value; },
        readDay: async (stock, date) => {
          const result = await readKrxDay(fetch, stock, date, key, controller.signal);
          return current === version ? result : failure('KEY_CHANGED');
        },
      });
      return current === version ? result : failure('KEY_CHANGED');
    } catch {
      return failure('STORAGE');
    } finally {
      collection = null;
      progress = null;
      busy = false;
    }
  });
}

module.exports = { registerKrxOpen };
