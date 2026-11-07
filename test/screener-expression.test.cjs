const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const legacy = require('./fixtures/screener-v1/src/screener/engine.js'),
  engine = require('../src/screener/engine.js'),
  expression = require('../src/screener/expression.js');
const data = (values, complete = true) => ({
  ok: true,
  metadata: {
    stockCode: '005930',
    lastBarComplete: complete,
    source: 'parity fixture',
    fetchedAt: '2026-11-07',
  },
  candles: values.map((close, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    open: close,
    high: close + 1,
    low: Math.max(0.1, close - 1),
    close,
    volume: 100 + (i % 4) * 100,
  })),
});
const values = (n) => Array.from({ length: n }, (_, i) => 100 + i * 0.2 + Math.sin(i * 0.6) * 6);
const ops = ['crossUp', 'crossDown', 'above', 'below'];
const rules = [
  ...ops.map((op) => ({ id: 'sma', op, fast: 2, slow: 3 })),
  ...ops.map((op) => ({ id: 'rsi', op, period: 2, method: 'wilder', level: 50 })),
  ...[0, 25].flatMap((shift) =>
    ops.map((op) => ({ id: 'bb', op, period: 5, multiplier: 1.9, shift })),
  ),
  ...['enter', 'breakout', 'bullish'].map((op) => ({
    id: 'ichimoku',
    op,
    conversion: 1,
    base: 2,
    span: 3,
    displacement: 2,
  })),
  ...[0, 100, 500].map((threshold) => ({ id: 'volume', op: 'gte', threshold })),
  { id: 'turnover', op: 'gte', threshold: 200 },
];
const groups = [
  ...rules.map((r) => [r]),
  [rules[0], rules[4], rules.at(-1)],
  [rules[2], rules.at(-2)],
  [rules[16], rules[8], rules.at(-1)],
];
function money(d, kind) {
  if (kind === 'missing') return null;
  return {
    ok: true,
    source: 'KIS',
    market: 'KRX',
    currency: 'KRW',
    unit: '원',
    rows: d.candles.slice(-100).map((c, i) => ({
      date: c.date,
      volume: c.volume + (kind === 'mismatch' ? 1 : 0),
      value: i % 2 ? 0 : 500,
    })),
  };
}
function parity(d, conditions, options) {
  const expected = legacy.evaluate(d, conditions, options),
    actual = expression.evaluate(d, expression.migrateLegacy(conditions, options), {
      turnover: options.turnover,
    });
  assert.deepEqual(actual, expected);
  assert.deepEqual(engine.evaluate(d, conditions, options), expected);
  const rich = expression.evaluateExpression(d, expression.migrateLegacy(conditions, options), {
    turnover: options.turnover,
  });
  assert.equal(rich.state, expected.state);
  assert.equal(rich.date, expected.date);
  assert.equal(rich.cycle, expected.cycle);
  assert.equal(rich.mode, expected.mode);
  assert.equal(rich.provisional, expected.provisional);
  assert.deepEqual(
    rich.results.map(({ key, time, anchorIndex, barIndex, ...result }) => result),
    expected.results,
  );
}

test('migration oracle is the byte-identical engine and series from f435fbc, not the current implementation', () => {
  const folder = path.join(__dirname, 'fixtures/screener-v1'),
    manifest = JSON.parse(fs.readFileSync(path.join(folder, 'provenance.json'), 'utf8'));
  assert.equal(manifest.commit, 'f435fbc48767cbb87fa08161027655979d16fe78');
  for (const [file, hash] of Object.entries(manifest.sha256))
    assert.equal(
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(folder, file)))
        .digest('hex'),
      hash,
    );
});
test('gate 1: migrated flat expressions preserve every result and numeric field across input, completion, cycle, mode, join and missing-money cases', (t) => {
  let cases = 0;
  for (const n of [1, 16, 100])
    for (const complete of [true, false, null])
      for (const cycle of ['day', 'week', 'month', 'year'])
        for (const mode of ['closed', 'latest'])
          for (const join of ['all', 'any'])
            for (const conditions of groups) {
              const d = data(values(n), complete),
                kind = ['missing', 'valid', 'mismatch'][cases % 3];
              parity(d, conditions, { cycle, mode, join, turnover: money(d, kind) });
              cases++;
            }
  const long = data(values(3000), false);
  for (const mode of ['closed', 'latest'])
    for (const conditions of groups) {
      parity(long, conditions, {
        cycle: 'year',
        mode,
        join: 'all',
        turnover: money(long, 'valid'),
      });
      cases++;
    }
  t.diagnostic('full differential comparisons: ' + cases);
});
test('gate 1: equality-at-previous-bar crossings and the closed/latest anchor retain the existing meaning', () => {
  const up = { id: 'sma', op: 'crossUp', fast: 2, slow: 3 },
    down = { ...up, op: 'crossDown' };
  for (const [prices, rule] of [
    [[2, 2, 2, 3], up],
    [[3, 3, 3, 2], down],
  ]) {
    const d = data(prices, true),
      result = expression.evaluate(d, expression.migrateLegacy([rule]));
    assert.equal(result.state, 'match');
    assert.equal(result.results[0].previousValue, result.results[0].previousReference);
    parity(d, [rule], {});
    const padded = data([prices[0], ...prices], false);
    assert.equal(legacy.evaluate(padded, [rule]).state, 'no-match');
    assert.equal(expression.evaluate(padded, expression.migrateLegacy([rule])).state, 'no-match');
    parity(padded, [rule], {});
    const open = data(prices, false);
    assert.equal(legacy.evaluate(open, [rule]).state, 'unknown');
    assert.equal(expression.evaluate(open, expression.migrateLegacy([rule])).state, 'unknown');
    assert.equal(
      expression.evaluate(open, expression.migrateLegacy([rule], { mode: 'latest' })).state,
      'match',
    );
    parity(open, [rule], {});
    parity(open, [rule], { mode: 'latest' });
  }
  const d = data([2], false);
  assert.equal(expression.evaluate(d, expression.migrateLegacy([up])).state, 'unknown');
  parity(d, [up], {});
});

test('gate 2: NOT preserves unknown and every three-state AND/OR combination is explicit', () => {
  const states = ['match', 'no-match', 'unknown'],
    all = [
      ['match', 'no-match', 'unknown'],
      ['no-match', 'no-match', 'no-match'],
      ['unknown', 'no-match', 'unknown'],
    ],
    any = [
      ['match', 'match', 'match'],
      ['match', 'no-match', 'unknown'],
      ['match', 'unknown', 'unknown'],
    ];
  states.forEach((a, i) =>
    states.forEach((b, j) => {
      assert.equal(expression.combine('all', [a, b]), all[i][j]);
      assert.equal(expression.combine('any', [a, b]), any[i][j]);
    }),
  );
  assert.equal(expression.notState('match'), 'no-match');
  assert.equal(expression.notState('no-match'), 'match');
  assert.equal(expression.notState('unknown'), 'unknown');
  const doc = expression.migrateLegacy([{ id: 'turnover', op: 'gte', threshold: 1 }]);
  doc.root = { type: 'not', child: { type: 'ref', key: 'A' } };
  assert.equal(expression.evaluateExpression(data([2, 3]), doc).state, 'unknown');
  doc.root = { type: 'not', child: doc.root };
  assert.equal(expression.evaluateExpression(data([2, 3]), doc).state, 'unknown');
});
test('gate 2: parentheses and NOT/AND/OR precedence change grouping without losing unknown evidence', () => {
  const doc = expression.migrateLegacy([
    { id: 'volume', op: 'gte', threshold: 0 },
    { id: 'volume', op: 'gte', threshold: 9999 },
    { id: 'turnover', op: 'gte', threshold: 1 },
  ]);
  doc.root = expression.parseLogic('(A OR B) AND NOT C', ['A', 'B', 'C']);
  const first = expression.evaluateExpression(data([2, 3]), doc);
  assert.equal(first.state, 'unknown');
  assert.equal(first.results[2].state, 'unknown');
  doc.root = expression.parseLogic('A OR B AND NOT C', ['A', 'B', 'C']);
  assert.equal(expression.evaluateExpression(data([2, 3]), doc).state, 'match');
  doc.root = expression.parseLogic('NOT (A OR B) AND C', ['A', 'B', 'C']);
  assert.equal(expression.evaluateExpression(data([2, 3]), doc).state, 'no-match');
  doc.root = expression.parseLogic('A OR A', ['A', 'B', 'C']);
  const repeated = expression.evaluateExpression(data([2, 3]), doc);
  assert.equal(repeated.results.length, 1);
  assert.equal(repeated.trace.children.length, 2);
  assert.deepEqual(expression.usedKeys(doc), ['A']);
});
test('gate 2: offsets are relative to the selected anchor, including unknown final candles and every bar cycle', () => {
  for (const complete of [true, false, null])
    for (const cycle of ['day', 'week', 'month', 'year']) {
      const d = data(values(800), complete),
        shift = cycle === 'day' && complete === true ? 0 : 1;
      for (const offset of [0, 1, 2]) {
        const doc = expression.migrateLegacy([{ id: 'volume', op: 'gte', threshold: 100 }], {
          mode: 'closed',
          cycle,
        });
        doc.conditions[0].time.barsAgo = offset;
        const closed = expression.evaluateExpression(d, doc).results[0];
        doc.conditions[0].time = { cycle, mode: 'latest', barsAgo: offset + shift };
        const latest = expression.evaluateExpression(d, doc).results[0];
        for (const field of [
          'date',
          'state',
          'value',
          'reference',
          'previousValue',
          'previousReference',
          'provisional',
        ])
          assert.deepEqual(closed[field], latest[field]);
      }
    }
  const doc = expression.migrateLegacy([{ id: 'volume', op: 'gte', threshold: 0 }], {
    mode: 'latest',
  });
  doc.conditions[0].time.barsAgo = 100;
  doc.root = { type: 'not', child: { type: 'ref', key: 'A' } };
  assert.equal(expression.evaluateExpression(data([2, 3]), doc).state, 'unknown');
});
test('gate 2: mixed per-condition cycles keep their own source dates and do not reinterpret a daily offset as weekly', () => {
  const d = data(values(100), false),
    doc = expression.migrateLegacy(
      [
        { id: 'volume', op: 'gte', threshold: 0 },
        { id: 'volume', op: 'gte', threshold: 0 },
      ],
      { mode: 'latest' },
    );
  doc.conditions[0].time.barsAgo = 1;
  doc.conditions[1].time = { cycle: 'week', mode: 'closed', barsAgo: 1 };
  const result = expression.evaluateExpression(d, doc);
  assert.equal(result.cycle, 'mixed');
  assert.equal(result.mode, 'mixed');
  assert.equal(result.date, null);
  assert.equal(result.results[0].date, d.candles.at(-2).date);
  const weekly = engine.prepare(d, { cycle: 'week', mode: 'closed' });
  assert.equal(result.results[1].date, weekly.bars[weekly.index - 1].date);
  assert.equal(result.results[1].value, weekly.bars[weekly.index - 1].volume);
});
test('gate 2: malformed trees, future offsets, unknown labels, excessive depth and executable text are rejected', () => {
  const make = () => expression.migrateLegacy([{ id: 'volume', op: 'gte', threshold: 0 }]);
  for (const mutate of [
    (d) => (d.version = 1),
    (d) => (d.root.children = []),
    (d) => (d.root = { type: 'ref', key: 'K0150-001' }),
    (d) => (d.root = { type: 'not' }),
    (d) => (d.conditions[0].time.barsAgo = -1),
    (d) => (d.conditions[0].time.barsAgo = 0.5),
    (d) => d.conditions.push({ ...d.conditions[0] }),
    (d) => (d.root.command = 'order'),
  ]) {
    const doc = make();
    mutate(doc);
    assert.throws(() => expression.evaluateExpression(data([2, 3]), doc));
  }
  const deep = make();
  for (let n = 0; n < 10; n++) deep.root = { type: 'not', child: deep.root };
  assert.throws(() => expression.validateDocument(deep));
  for (const input of ['A; globalThis.BAD=1', 'A OR Z', '(A', 'A B', 'A OR', 'NOT', 'A || A'])
    assert.throws(() => expression.parseLogic(input, ['A']));
  assert.equal(globalThis.BAD, undefined);
});
