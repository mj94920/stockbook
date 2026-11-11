'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { nonTradingDay, coverage } = require('./krx-calendar.cjs');

const dayMs = 86400000;
const fields = ['open', 'high', 'low', 'close', 'volume', 'value'];

function dateTime(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2010-01-04') throw Error('INPUT');
  const time = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) throw Error('INPUT');
  return time;
}

function validateRecord(row) {
  if (!row || !/^\d{6}$/.test(row.code) || !/^KR[A-Z0-9]{10}$/.test(row.isin) ||
      typeof row.name !== 'string' || typeof row.market !== 'string' ||
      !Number.isFinite(Date.parse(row.fetchedAt))) throw Error('STORAGE');
  dateTime(row.date);
  if (!row.values || !fields.every(field => Number.isSafeInteger(row.values[field]) && row.values[field] >= 0) ||
      row.values.low > Math.min(row.values.open, row.values.close) ||
      row.values.high < Math.max(row.values.open, row.values.close) ||
      row.values.high < row.values.low) throw Error('STORAGE');
  return {
    code: row.code, date: row.date, isin: row.isin, name: row.name.slice(0, 100),
    market: row.market.slice(0, 50), fetchedAt: row.fetchedAt,
    values: Object.fromEntries(fields.map(field => [field, row.values[field]])),
  };
}

function createHistoryStore({ getFile, safeStorage }) {
  function load(file) {
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
    if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw Error('STORAGE');
    const seen = new Set();
    return parsed.records.map(record => {
      const row = validateRecord(record);
      const key = row.code + ':' + row.date;
      if (seen.has(key)) throw Error('STORAGE');
      seen.add(key);
      return row;
    });
  }
  const shard = (code, year) => path.join(getFile() + '.d', code + '-' + year + '.enc');
  const checkFile = (code, year) => path.join(getFile() + '.d', code + '-' + year + '.checks.enc');
  function loadChecks(code, year) {
    const file = checkFile(code, year);
    if (!fs.existsSync(file)) return [];
    const data = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
    if (data.version !== 1 || !Array.isArray(data.checks)) throw Error('STORAGE');
    const dates = new Set();
    for (const check of data.checks) {
      dateTime(check.date);
      if (check.code !== code || check.date.slice(0, 4) !== String(year) ||
          !['received', 'no-data', 'error'].includes(check.state) || dates.has(check.date) ||
          typeof check.marketHasData !== 'boolean' || !Number.isFinite(Date.parse(check.checkedAt)) ||
          !/^[A-Z_]{0,40}$/.test(check.error)) throw Error('STORAGE');
      dates.add(check.date);
    }
    return data.checks;
  }
  function write(file, data) {
    const temp = file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(data)), { mode: 0o600 });
      fs.renameSync(temp, file);
    } catch {
      try { fs.rmSync(temp, { force: true }); } catch {}
      throw Error('STORAGE');
    }
  }
  function merge(older, newer) {
    const records = new Map(older.map(row => [row.code + ':' + row.date, row]));
    for (const row of newer) records.set(row.code + ':' + row.date, row);
    return [...records.values()];
  }
  return {
    readChecks(code, start, end) {
      if (!/^\d{6}$/.test(code)) throw Error('INPUT');
      dateTime(start);
      dateTime(end);
      const checks = [];
      for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
        checks.push(...loadChecks(code, year).filter(check => check.date >= start && check.date <= end));
      }
      return checks;
    },
    recordCheck(code, date, result) {
      if (!/^\d{6}$/.test(code)) throw Error('INPUT');
      dateTime(date);
      const year = date.slice(0, 4);
      const checks = loadChecks(code, year).filter(check => check.date !== date);
      checks.push({ code, date, checkedAt: new Date().toISOString(),
        state: result.ok ? 'received' : result.code === 'NO_DATA' ? 'no-data' : 'error',
        marketHasData: result.marketHasData === true,
        error: /^[A-Z_]{1,40}$/.test(result.code || '') ? result.code : '' });
      write(checkFile(code, year), { version: 1, checks });
    },
    read(code, start, end) {
      dateTime(start);
      dateTime(end);
      if (typeof code !== 'string' || !/^\d{6}$/.test(code) || start > end) throw Error('INPUT');
      let records = load(getFile()).filter(row => row.code === code && row.date >= start && row.date <= end);
      for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
        const rows = load(shard(code, year));
        if (rows.some(row => row.code !== code || row.date.slice(0, 4) !== String(year))) throw Error('STORAGE');
        records = merge(records, rows.filter(row => row.date >= start && row.date <= end));
      }
      return records
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    save(input) {
      const row = validateRecord(input);
      const year = row.date.slice(0, 4);
      const file = shard(row.code, year);
      const legacy = load(getFile()).filter(old => old.code === row.code && old.date.slice(0, 4) === year);
      const current = load(file);
      if (current.some(old => old.code !== row.code || old.date.slice(0, 4) !== year)) throw Error('STORAGE');
      const records = merge(merge(legacy, current), [row]).sort((a, b) => a.date.localeCompare(b.date));
      write(file, { version: 1, records });
    },
  };
}

async function collectHistory({ code, start, end, store, readDay, signal, onProgress = () => {}, pauseMs = 250 }) {
  const first = dateTime(start);
  const last = dateTime(end);
  const days = (last - first) / dayMs + 1;
  if (!/^\d{6}$/.test(code) || !Number.isInteger(days) || days < 1) throw Error('INPUT');
  const cached = store.read(code, start, end);
  const dates = new Set(cached.map(row => row.date));
  const emptyDates = [];
  let received = 0;
  let error = null;
  let processed = 0;
  for (let time = first; time <= last; time += dayMs) {
    if (signal.aborted) { error = 'CANCELLED'; break; }
    const date = new Date(time).toISOString().slice(0, 10);
    onProgress({ processed, days, received, date });
    if (!dates.has(date) && !nonTradingDay(code, date)) {
      const result = await readDay(code, date);
      if (signal.aborted) { error = 'CANCELLED'; break; }
      try { store.recordCheck?.(code, date, result); }
      catch { error = 'STORAGE'; break; }
      if (result.ok) {
        try { store.save(result); received++; }
        catch { error = 'STORAGE'; break; }
      } else if (result.code === 'NO_DATA') emptyDates.push(date);
      else { error = result.code || 'SERVICE'; break; }
      if (pauseMs) await new Promise(resolve => setTimeout(resolve, pauseMs));
    }
    processed++;
    onProgress({ processed, days, received });
  }
  const rows = store.read(code, start, end);
  return { ok: true, rows, received, cached: cached.length,
    emptyDates, processed, requestedDays: days, partial: Boolean(error), error,
    coverage: coverage(code, start, end, rows, store.readChecks?.(code, start, end) || []) };
}

module.exports = { createHistoryStore, collectHistory };
