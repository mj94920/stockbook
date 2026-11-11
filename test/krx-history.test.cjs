'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHistoryStore, collectHistory } = require('../src/finance/krx-history.cjs');
const { statistics, verifyAggregation } = require('../src/finance/krx-history.js');
const { coverage, nonTradingDay } = require('../src/finance/krx-calendar.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(__dirname, '.krx-history-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'history.enc');
  const safeStorage = {
    encryptString: text => Buffer.from(text).reverse(),
    decryptString: value => Buffer.from(value).reverse().toString(),
  };
  return { file, shard: path.join(file + '.d', '005930-2026.enc'), safeStorage,
    store: createHistoryStore({ getFile: () => file, safeStorage }) };
}

function record(date, close = 12) {
  return { ok: true, code: '005930', date, isin: 'KR7005930003', name: '합성 종목', market: 'KOSPI',
    fetchedAt: '2026-11-11T00:00:00Z', values: { open: 10, high: 13, low: 9, close, volume: 100, value: 1100 } };
}

test('encrypted history resumes partial collection, reuses saved dates and leaves absent dates unfilled', async t => {
  const { shard, store } = fixture(t);
  const requests = [];
  const readDay = async (_code, date) => {
    requests.push(date);
    if (date === '2026-11-08') return { ok: false, code: 'NO_DATA' };
    if (date === '2026-11-09') return { ok: false, code: 'API' };
    return record(date);
  };
  const options = { code: '005930', start: '2026-11-06', end: '2026-11-10',
    store, signal: new AbortController().signal, pauseMs: 0 };
  const first = await collectHistory({ ...options, readDay });
  assert.equal(first.partial, true);
  assert.equal(first.error, 'API');
  assert.deepEqual(first.emptyDates, []);
  assert.deepEqual(first.rows.map(row => row.date), ['2026-11-06']);
  assert.equal(fs.readFileSync(shard).includes('005930'), false);
  requests.length = 0;
  const resumed = await collectHistory({ ...options, readDay: async (_code, date) => {
    requests.push(date);
    return date === '2026-11-08' ? { ok: false, code: 'NO_DATA' } : record(date);
  } });
  assert.deepEqual(requests, ['2026-11-09', '2026-11-10']);
  assert.equal(resumed.cached, 1);
  assert.equal(resumed.received, 2);
  assert.equal(resumed.rows.length, 3);
  assert.equal(resumed.partial, false);
  store.save(record('2026-11-06', 11));
  assert.equal(store.read('005930', options.start, options.end).length, 3);
  assert.equal(store.read('005930', options.start, options.end)[0].values.close, 11);
});

test('cancel preserves completed dates and corrupt encrypted data is never overwritten', async t => {
  const { shard, store } = fixture(t);
  const controller = new AbortController();
  const result = await collectHistory({
    code: '005930', start: '2026-11-09', end: '2026-11-11', store, signal: controller.signal, pauseMs: 0,
    readDay: async (_code, date) => {
      if (date === '2026-11-10') controller.abort();
      return record(date);
    },
  });
  assert.equal(result.error, 'CANCELLED');
  assert.deepEqual(result.rows.map(row => row.date), ['2026-11-09']);
  const bad = Buffer.from('invalid data');
  fs.writeFileSync(shard, bad);
  assert.throws(() => store.save(record('2026-11-11')));
  assert.deepEqual(fs.readFileSync(shard), bad);
});

test('KRX weekly and monthly statistics use raw OHLC, sum only received volume and money, and reject mixed identities', () => {
  const rows = [record('2026-11-06', 11), record('2026-11-09'), record('2026-11-10')];
  const weekly = statistics(rows, 'week');
  assert.equal(weekly.bars.length, 2);
  assert.equal(weekly.bars[1].value, 2200);
  assert.equal(weekly.bars[1].volume, 200);
  assert.equal(weekly.bars[1].close, 12);
  assert.equal(weekly.value, 3300);
  assert.equal(statistics(rows, 'month').bars.length, 1);
  assert.throws(() => statistics([rows[0], { ...rows[1], isin: 'KR7000000000' }]), /종목 식별자/);
});

test('multi-year collection completes beyond 31 days and statistics accept more than 1000 received days', async () => {
  const rows = new Map();
  const start = '2010-01-04';
  const end = '2015-01-05';
  const store = {
    read: () => [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)),
    save: row => rows.set(row.date, row),
  };
  const progress = [];
  const result = await collectHistory({
    code: '005930', start, end, store, signal: new AbortController().signal, pauseMs: 0,
    readDay: async (_code, date) => record(date),
    onProgress: value => progress.push(value),
  });
  assert.equal(result.partial, false);
  assert.ok(result.received > 1000);
  assert.equal(result.rows.at(-1).date, end);
  assert.equal(progress.at(-1).processed, result.requestedDays);
  assert.equal(statistics(result.rows).received, result.received);
  const larger = result.rows.map(row => ({ ...row, values: { ...row.values, value: Number.MAX_SAFE_INTEGER } }));
  assert.equal(statistics(larger, 'month').value, BigInt(Number.MAX_SAFE_INTEGER) * BigInt(result.received));
});

test('more than ten years of received days form at least ten annual candles with exact yearly amounts', () => {
  const records = Array.from({ length: 4383 }, (_, i) => record(
    new Date(Date.UTC(2010, 0, 4 + i)).toISOString().slice(0, 10)));
  const result = statistics(records, 'year', 'raw');
  assert.ok(result.bars.length >= 10);
  assert.equal(result.bars[0].firstDate, records[0].date);
  assert.equal(result.bars.at(-1).close, records.at(-1).values.close);
  const year2011 = result.bars.find(bar => bar.bucket === '2011');
  assert.equal(year2011.volume, 36500);
  assert.equal(year2011.value, 365 * 1100);
  assert.equal(year2011.open, 10);
  assert.equal(year2011.high, 13);
  assert.equal(year2011.low, 9);
});

test('split correction precedes annual OHLC and averages, keeps raw quantity and amount, and never mutates source days', () => {
  const input = [
    { ...record('2018-04-26'), values: { open: 5000, high: 5500, low: 4500, close: 5250, volume: 10, value: 50000 } },
    { ...record('2018-04-27'), values: { open: 5250, high: 6000, low: 5000, close: 5750, volume: 12, value: 65000 } },
    { ...record('2018-05-04'), values: { open: 115, high: 120, low: 110, close: 118, volume: 100, value: 11600 } },
    { ...record('2018-05-07'), values: { open: 118, high: 125, low: 115, close: 122, volume: 110, value: 13000 } },
  ];
  const original = JSON.stringify(input);
  const raw = statistics(input, 'year', 'raw');
  const adjusted = statistics(input, 'year', 'split-adjusted');
  assert.equal(raw.bars[0].open, 5000);
  assert.equal(raw.bars[0].high, 6000);
  assert.equal(adjusted.bars[0].open, 100);
  assert.equal(adjusted.bars[0].high, 125);
  assert.equal(adjusted.bars[0].low, 90);
  assert.equal(adjusted.bars[0].close, 122);
  assert.equal(adjusted.volume, raw.volume);
  assert.equal(adjusted.value, raw.value);
  assert.equal(raw.safeForAverage, false);
  assert.equal(adjusted.safeForAverage, true);
  assert.equal(adjusted.rawAudit.ok, true);
  assert.equal(adjusted.displayAudit.ok, true);
  assert.equal(JSON.stringify(input), original);
  const changed = adjusted.bars.map(bar => ({ ...bar, close: bar.close + 1 }));
  assert.equal(verifyAggregation(adjusted.correction.rows, changed, 'year').ok, false);
});

test('missing-price days still enter original volume and money totals, and a wholly unpriced group fails OHLC verification', () => {
  const rows = [
    { ...record('2017-12-28'), values: { open: 0, high: 0, low: 0, close: 0, volume: 5, value: 100 } },
    record('2018-01-02'),
  ];
  const result = statistics(rows, 'year', 'raw');
  assert.equal(result.volume, 105);
  assert.equal(result.value, 1200);
  assert.equal(result.rawAudit.ok, false);
  assert.equal(result.rawAudit.mismatches[0].bucket, '2017');
});

test('coverage distinguishes sourced closures and suspension from unverified dates and actual query failures', () => {
  const checks = [
    { date: '2018-05-07', state: 'no-data', marketHasData: false },
    { date: '2018-05-08', state: 'no-data', marketHasData: true },
    { date: '2018-05-09', state: 'error', error: 'SERVICE' },
  ];
  const result = coverage('005930', '2018-04-27', '2018-05-10',
    [record('2018-04-27'), record('2018-05-04')], checks);
  assert.deepEqual(result.counts, { received: 2, weekend: 4, closed: 1, suspended: 3,
    unverified: 1, failed: 1, marketEmpty: 1, stockMissing: 1 });
  assert.equal(result.complete, false);
  assert.equal(result.unresolved, 4);
  assert.equal(nonTradingDay('005930', '2012-10-09'), null);
  assert.equal(nonTradingDay('005930', '2013-10-09').kind, 'closed');
  assert.equal(nonTradingDay('005930', '2018-05-07'), null);
});

test('yearly encrypted shards preserve old combined history and allow multiple years without a global count limit', t => {
  const { file, store, safeStorage } = fixture(t);
  const legacy = [record('2025-12-30'), record('2025-12-31'), record('2026-01-02')];
  const original = safeStorage.encryptString(JSON.stringify({ version: 1, records: legacy }));
  fs.writeFileSync(file, original);
  store.save(record('2025-12-31', 11));
  store.save(record('2026-11-10'));
  assert.deepEqual(fs.readFileSync(file), original);
  const rows = store.read('005930', '2025-01-01', '2026-12-31');
  assert.equal(rows.length, 4);
  assert.equal(rows[1].values.close, 11);
  assert.equal(fs.existsSync(path.join(file + '.d', '005930-2025.enc')), true);
  assert.equal(fs.existsSync(path.join(file + '.d', '005930-2026.enc')), true);
});
