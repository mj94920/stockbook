const { test } = require('node:test'),
  assert = require('node:assert/strict');
const temporal = require('../src/screener/temporal.js'),
  expression = require('../src/screener/expression.js'),
  engine = require('../src/screener/engine.js');
const legacy = require('./fixtures/screener-v1/src/screener/engine.js'),
  oldSeries = require('./fixtures/screener-v1/src/chart/series.js');
const point = (state) => ({
  state,
  date: '2026-01-01',
  value: state === 'unknown' ? null : 100,
  reference: 50,
});
const read = (states) => (ago) => point(states[ago]);
const data = (volumes, complete = true) => ({
  ok: true,
  metadata: { stockCode: '005930', lastBarComplete: complete },
  candles: volumes.map((volume, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume,
  })),
});
function possibilities(states) {
  let choices = [[]];
  for (const state of states)
    choices = choices.flatMap((choice) =>
      (state === 'unknown' ? [true, false] : [state === 'match']).map((value) => [
        ...choice,
        value,
      ]),
    );
  return choices;
}
const consensus = (values) =>
  values.every(Boolean) ? 'match' : values.every((v) => !v) ? 'no-match' : 'unknown';

test('temporal count and streak follow every possible completion of unknown values, including zero and endpoint thresholds', () => {
  function sequences(n) {
    return n
      ? [].concat(
          ...sequences(n - 1).map((row) =>
            ['match', 'no-match', 'unknown'].map((s) => [...row, s]),
          ),
        )
      : [[]];
  }
  for (let span = 1; span <= 4; span++)
    for (const states of sequences(span)) {
      const counts = possibilities(states).map((row) => row.filter(Boolean).length);
      for (const operator of ['gte', 'lte', 'eq'])
        for (let threshold = 0; threshold <= span; threshold++) {
          const expected = consensus(
            counts.map((n) =>
              operator === 'gte'
                ? n >= threshold
                : operator === 'lte'
                  ? n <= threshold
                  : n === threshold,
            ),
          );
          assert.equal(
            temporal.evaluate({ kind: 'count', span, operator, threshold }, read(states)).state,
            expected,
          );
        }
      assert.equal(
        temporal.evaluate({ kind: 'streak', span }, read(states)).state,
        consensus(possibilities(states).map((row) => row.every(Boolean))),
      );
    }
});
test('interrupted matches satisfy a count but never become consecutive matches', () => {
  const states = ['match', 'no-match', 'match'];
  assert.equal(
    temporal.evaluate({ kind: 'count', span: 3, operator: 'gte', threshold: 2 }, read(states))
      .state,
    'match',
  );
  assert.equal(temporal.evaluate({ kind: 'streak', span: 3 }, read(states)).state, 'no-match');
  const partial = temporal.evaluate(
    { kind: 'count', span: 3, operator: 'gte', threshold: 2 },
    read(['match', 'unknown', 'no-match']),
  );
  assert.equal(partial.state, 'unknown');
  assert.equal(partial.lowerBound, 1);
  assert.equal(partial.upperBound, 2);
  assert.equal(
    temporal.evaluate({ kind: 'streak', span: 3 }, read(['match', 'unknown', 'match'])).state,
    'unknown',
  );
});
test('a one-bar temporal condition preserves the point result, including NOT of unknown and exact-zero absence', () => {
  for (const state of ['match', 'no-match', 'unknown']) {
    assert.equal(
      temporal.evaluate({ kind: 'count', span: 1, operator: 'gte', threshold: 1 }, read([state]))
        .state,
      state,
    );
    assert.equal(temporal.evaluate({ kind: 'streak', span: 1 }, read([state])).state, state);
    assert.equal(
      temporal.evaluate({ kind: 'count', span: 1, operator: 'eq', threshold: 0 }, read([state]))
        .state,
      expression.notState(state),
    );
  }
});
test('window includes its chosen anchor and the oldest endpoint, with closed/latest and offset kept separate', () => {
  const d = data([100, 10, 200, 0, 300], false),
    doc = expression.migrateLegacy([{ id: 'volume', op: 'gte', threshold: 100 }]);
  doc.conditions[0].window = { kind: 'count', span: 3, operator: 'eq', threshold: 1 };
  let result = expression.evaluateExpression(d, doc).results[0];
  assert.equal(result.state, 'match');
  assert.equal(result.pointState, 'no-match');
  assert.deepEqual(
    result.window.samples.map((p) => p.date),
    d.candles
      .slice(1, 4)
      .reverse()
      .map((c) => c.date),
  );
  assert.equal(result.window.matched, 1);
  doc.conditions[0].time.mode = 'latest';
  doc.conditions[0].window.threshold = 2;
  result = expression.evaluateExpression(d, doc).results[0];
  assert.equal(result.window.matched, 2);
  assert.equal(result.state, 'match');
  doc.conditions[0].time.barsAgo = 1;
  doc.conditions[0].window.threshold = 1;
  assert.equal(expression.evaluateExpression(d, doc).results[0].window.matched, 1);
  assert.throws(() => expression.evaluate(d, doc)); // The old flat adapter must not silently ignore a temporal configuration.
});
test('temporal integration evaluates exactly the frozen legacy predicates at past bars rather than reinterpreting their math', () => {
  const d = data(
    Array.from({ length: 90 }, (_, i) => (i % 3 ? 100 : 0)),
    false,
  );
  d.candles = d.candles.map((c, i) => {
    const close = 100 + Math.sin(i * 0.7) * 8 + i * 0.05;
    return { ...c, open: close, high: close + 1, low: close - 1, close };
  });
  const rules = [
    { id: 'sma', op: 'crossUp', fast: 2, slow: 3 },
    { id: 'rsi', op: 'above', period: 2, method: 'wilder', level: 50 },
    { id: 'bb', op: 'crossUp', period: 5, multiplier: 1.9, shift: 2 },
    { id: 'ichimoku', op: 'bullish', conversion: 1, base: 2, span: 3, displacement: 1 },
  ];
  for (const cycle of ['day', 'week'])
    for (const rule of rules) {
      const doc = expression.migrateLegacy([rule], { cycle });
      doc.conditions[0].window = { kind: 'count', span: 6, operator: 'gte', threshold: 2 };
      const result = expression.evaluateExpression(d, doc).results[0];
      const bars = oldSeries.aggregate(d.candles, cycle, d.metadata),
        anchor = bars.length - 2;
      const expected = Array.from({ length: 6 }, (_, ago) => {
        const bar = bars[anchor - ago];
        if (!bar) return 'unknown';
        const prefix = {
          ...d,
          metadata: { ...d.metadata, lastBarComplete: true },
          candles: d.candles.filter((c) => c.date <= bar.date),
        };
        return legacy.evaluate(prefix, [rule], { cycle, mode: 'latest' }).state;
      });
      assert.deepEqual(
        result.window.samples.map((s) => s.state),
        expected,
      );
      assert.equal(result.window.matched, expected.filter((s) => s === 'match').length);
      assert.equal(result.window.unknown, expected.filter((s) => s === 'unknown').length);
    }
});
test('exhausted price history and missing real turnover remain unknown through temporal evaluation and NOT', () => {
  const d = data([100], false),
    doc = expression.migrateLegacy([{ id: 'volume', op: 'gte', threshold: 0 }]);
  doc.conditions[0].window = { kind: 'streak', span: 3 };
  doc.root = { type: 'not', child: { type: 'ref', key: 'A' } };
  assert.equal(expression.evaluateExpression(d, doc).state, 'unknown');
  const money = expression.migrateLegacy([{ id: 'turnover', op: 'gte', threshold: 1 }]);
  money.conditions[0].window = { kind: 'count', span: 3, operator: 'eq', threshold: 0 };
  money.root = { type: 'not', child: { type: 'ref', key: 'A' } };
  const r = expression.evaluateExpression(data([100, 100, 100]), money);
  assert.equal(r.state, 'unknown');
  assert.equal(r.results[0].window.unknown, 3);
});
test('bounded evidence display never truncates the computed window or hides a failing oldest endpoint', () => {
  let calls = 0;
  const result = temporal.evaluate({ kind: 'streak', span: 1200 }, (ago) => {
    calls++;
    return point(ago === 1199 ? 'no-match' : 'match');
  });
  assert.equal(calls, 1200);
  assert.equal(result.state, 'no-match');
  assert.equal(result.samples.length, 32);
  assert.equal(result.omittedSamples, 1168);
  assert.equal(result.samples.at(-1).ago, 1199);
  assert.equal(result.unmatched, 1);
});
test('invalid windows are rejected and default migrated documents remain unmodified point rules', () => {
  for (const config of [
    null,
    { kind: 'count', span: 0, operator: 'gte', threshold: 0 },
    { kind: 'count', span: 2, operator: 'eq', threshold: 3 },
    { kind: 'count', span: 3, operator: 'gt', threshold: 1 },
    { kind: 'streak', span: 2, threshold: 1 },
    { kind: 'streak', span: 1201 },
    { kind: 'streak', span: 1.5 },
  ])
    assert.throws(() => temporal.validate(config));
  assert.throws(() => temporal.evaluate({ kind: 'streak', span: 1 }, () => ({ state: 'missing' })));
  const doc = expression.migrateLegacy([{ id: 'volume', op: 'gte', threshold: 0 }]);
  assert.equal(Object.hasOwn(doc.conditions[0], 'window'), false);
  const d = data([100, 100]);
  assert.equal(
    expression.evaluateExpression(d, JSON.parse(JSON.stringify(doc))).state,
    legacy.evaluate(d, [doc.conditions[0].condition]).state,
  );
});

test('received real turnover drives point, count and streak results while missing rows, mismatched volume and wrong units stay unknown', () => {
  const d = data([100, 100, 100, 100, 100], false),
    amounts = [10100, 10150, 10250, 10290, 10450],
    money = {
      ok: true,
      stockCode: '005930',
      source: 'KIS',
      market: 'KRX',
      currency: 'KRW',
      unit: '원',
      rows: d.candles.map((c, i) => ({ date: c.date, volume: c.volume, value: amounts[i] })),
    };
  const doc = expression.migrateLegacy([{ id: 'turnover', op: 'gte', threshold: 10240 }]);
  let result = expression.evaluateExpression(d, doc, { turnover: money }).results[0];
  assert.equal(result.value, 10290);
  assert.notEqual(result.value, d.candles[3].close * d.candles[3].volume);
  doc.conditions[0].window = { kind: 'count', span: 3, operator: 'gte', threshold: 2 };
  result = expression.evaluateExpression(d, doc, { turnover: money }).results[0];
  assert.equal(result.state, 'match');
  assert.equal(result.window.matched, 2);
  assert.equal(result.window.unknown, 0);
  doc.conditions[0].window = { kind: 'streak', span: 3 };
  assert.equal(expression.evaluateExpression(d, doc, { turnover: money }).state, 'no-match');
  doc.conditions[0].window = { kind: 'count', span: 3, operator: 'gte', threshold: 2 };
  const missing = structuredClone(money);
  missing.rows.splice(2, 1);
  result = expression.evaluateExpression(d, doc, { turnover: missing }).results[0];
  assert.equal(result.state, 'unknown');
  assert.equal(result.window.lowerBound, 1);
  assert.equal(result.window.upperBound, 2);
  const mismatch = structuredClone(money);
  mismatch.rows[2].volume = 99;
  assert.equal(expression.evaluateExpression(d, doc, { turnover: mismatch }).state, 'unknown');
  const wrongUnit = { ...money, unit: '억원' };
  assert.equal(expression.evaluateExpression(d, doc, { turnover: wrongUnit }).state, 'unknown');
  delete doc.conditions[0].window;
  doc.conditions[0].condition.threshold = 10300;
  assert.equal(expression.evaluateExpression(d, doc, { turnover: money }).state, 'no-match');
  assert.ok(d.candles[3].close * d.candles[3].volume > 10300);
});
