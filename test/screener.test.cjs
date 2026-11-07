const { test } = require('node:test'),
  assert = require('node:assert/strict');
const series = require('../src/chart/series.js'),
  screen = require('../src/screener/engine.js');
const candles = (values) =>
  values.map((close, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    open: close,
    high: close + 1,
    low: Math.max(0.1, close - 1),
    close,
    volume: 100,
  }));
const data = (values, complete = true) => ({
  ok: true,
  metadata: { stockCode: '005930', lastBarComplete: complete, source: 'test' },
  candles: candles(values),
});
const volume = (threshold) => ({ id: 'volume', op: 'gte', threshold }),
  money = (threshold) => ({ id: 'turnover', op: 'gte', threshold });
test('SMA crossing differs from staying above, equality crosses once and insufficient history is unknown', () => {
  const rule = { id: 'sma', op: 'crossUp', fast: 2, slow: 3 };
  assert.equal(screen.evaluate(data([3, 2, 1, 4]), [rule]).state, 'match');
  const next = data([3, 2, 1, 4, 5]);
  assert.equal(screen.evaluate(next, [rule]).state, 'no-match');
  assert.equal(screen.evaluate(next, [{ ...rule, op: 'above' }]).state, 'match');
  assert.equal(screen.evaluate(data([2, 2, 2, 3]), [rule]).state, 'match');
  assert.throws(() =>
    screen.evaluate(data([2, 3, 4, 5, 6, 3.5, 5.4]), [{ ...rule, op: 'enter', displacement: 2 }]),
  );
  const enter = { id: 'ichimoku', op: 'enter', conversion: 1, base: 2, span: 3, displacement: 2 };
  for (const close of [5, 5.4, 5.75])
    assert.equal(screen.evaluate(data([2, 3, 4, 5, 6, 3.5, close]), [enter]).state, 'match');
  assert.equal(screen.evaluate(data([2, 3, 4, 5, 6, 3.5, 6]), [enter]).state, 'no-match');
  assert.equal(
    screen.evaluate(data([2, 3, 4, 5, 6, 3.5, 6]), [{ ...enter, op: 'breakout' }]).state,
    'match',
  );
  assert.equal(
    screen.evaluate(data([2, 3, 4, 5, 6, 3.5, 5.75]), [{ ...enter, op: 'breakout' }]).state,
    'no-match',
  );
  assert.equal(screen.evaluate(data([2, 3]), [rule]).state, 'unknown');
  assert.throws(() => screen.evaluate(data([1, 2]), [{ ...rule, fast: 5, slow: 2 }]));
});
test('BB uses the shared population deviation and exactly the configured display shift without looking forward', () => {
  const d = data([3, 2, 1, 4]),
    rule = { id: 'bb', op: 'crossUp', period: 2, multiplier: 1, shift: 1 };
  const result = screen.evaluate(d, [rule]).results[0];
  assert.equal(result.state, 'match');
  assert.equal(result.reference, 2);
  assert.equal(result.previousReference, 3);
  assert.deepEqual(series.bbUpperSeries([{ close: 1 }, { close: 3 }], 2, 1), [null, 3]);
  assert.equal(
    result.reference,
    series.bbUpperSeries(series.aggregate(d.candles, 'day', d.metadata), 2, 1)[2],
  );
  assert.throws(() => screen.evaluate(d, [{ ...rule, shift: -1 }]));
});
test('missing or mismatched real turnover is unknown and AND/OR obey three-valued logic', () => {
  const d = data([2, 3, 4]),
    turnover = {
      ok: true,
      source: 'KIS',
      market: 'KRX',
      currency: 'KRW',
      unit: '원',
      rows: d.candles.map((c) => ({ date: c.date, volume: 100, value: 12 })),
    };
  assert.equal(screen.evaluate(d, [money(100)], { turnover }).state, 'no-match'); // close*volume would incorrectly pass.
  assert.equal(screen.evaluate(d, [money(0)]).state, 'unknown');
  const wrong = structuredClone(turnover);
  wrong.rows.at(-1).volume = 99;
  assert.equal(screen.evaluate(d, [money(1)], { turnover: wrong }).state, 'unknown');
  assert.equal(screen.evaluate(d, [volume(0), money(1)], { join: 'all' }).state, 'unknown');
  assert.equal(screen.evaluate(d, [volume(0), money(1)], { join: 'any' }).state, 'match');
  assert.equal(screen.evaluate(d, [volume(101), money(1)], { join: 'all' }).state, 'no-match');
});
test('Wilder RSI shares chart calculation, supports period and threshold changes, and excludes warm-up', () => {
  const d = data([10, 9, 8, 9, 10]),
    rule = { id: 'rsi', op: 'crossUp', period: 2, method: 'wilder', level: 50 };
  const result = screen.evaluate(d, [rule]).results[0];
  assert.equal(result.state, 'match');
  assert.equal(result.previousValue, 50);
  assert.equal(result.value, 75);
  assert.equal(
    result.value,
    series.rsiSeries(series.aggregate(d.candles, 'day', d.metadata), 2, 'wilder').at(-1),
  );
  assert.equal(screen.evaluate(data([10, 9]), [rule]).state, 'unknown');
  assert.throws(() => screen.validate({ ...rule, method: 'unspecified' }));
  assert.equal(screen.evaluate(d, [{ ...rule, level: 90 }]).state, 'no-match');
});
test('bar cycles aggregate first, closed bars omit uncertain final groups and volume amounts use the selected bar', () => {
  const d = data(
      Array.from({ length: 80 }, (_, i) => 10 + i),
      false,
    ),
    daily = screen.evaluate(d, [volume(0)]),
    latest = screen.evaluate(d, [volume(0)], { mode: 'latest' });
  assert.equal(daily.date, d.candles.at(-2).date);
  assert.equal(daily.provisional, false);
  assert.equal(latest.date, d.candles.at(-1).date);
  assert.equal(latest.provisional, true);
  for (const cycle of ['week', 'month', 'year']) {
    const result = screen.evaluate(d, [volume(0)], { cycle, mode: 'latest' });
    assert.equal(result.cycle, cycle);
    assert.equal(result.provisional, true);
  }
  const weekly = screen.evaluate(d, [volume(0)], { cycle: 'week' }),
    bars = series.aggregate(d.candles, 'week', d.metadata);
  assert.equal(weekly.results[0].value, bars.at(-2).volume);
  assert.equal(weekly.date, bars.at(-2).date);
  assert.equal(
    screen.evaluate(d, [{ id: 'bb', op: 'above', period: 2, multiplier: 1, shift: 0 }], {
      cycle: 'week',
    }).state,
    'unknown',
  );
});
test('Ichimoku is independent of MA clouds and well/mountain, has explicit forward displacement and entry boundaries', () => {
  // Shifted cloud at the final bar must use earlier highs/lows, never the final spike.
  const d = data([2, 3, 4, 5, 6, 4]),
    rule = { id: 'ichimoku', op: 'bullish', conversion: 1, base: 2, span: 3, displacement: 1 };
  const rows = series.ichimokuSeries(series.aggregate(d.candles, 'day', d.metadata), rule),
    result = screen.evaluate(d, [rule]);
  assert.equal(result.state, 'match');
  assert.deepEqual(result.results[0].cloud, rows.at(-1));
  assert.equal(rows.at(-1).spanA, 5.75);
  assert.equal(rows.at(-1).spanB, 5);
  assert.equal(rows[0].spanA, null);
  const changed = structuredClone(d);
  changed.candles.at(-1).high = 1000;
  assert.equal(screen.evaluate(changed, [rule]).results[0].cloud.spanA, 5.75);
  const enter = { ...rule, op: 'enter', displacement: 2 };
  for (const close of [5, 5.4, 5.75])
    assert.equal(screen.evaluate(data([2, 3, 4, 5, 6, 3.5, close]), [enter]).state, 'match');
  assert.equal(screen.evaluate(data([2, 3, 4, 5, 6, 3.5, 6]), [enter]).state, 'no-match');
  assert.equal(
    screen.evaluate(data([2, 3, 4, 5, 6, 3.5, 6]), [{ ...enter, op: 'breakout' }]).state,
    'match',
  );
  assert.equal(
    screen.evaluate(data([2, 3, 4, 5, 6, 3.5, 5.75]), [{ ...enter, op: 'breakout' }]).state,
    'no-match',
  );
  assert.equal(screen.evaluate(data([2, 3]), [rule]).state, 'unknown');
  assert.ok(screen.pending.some((p) => p.id === 'wellMountain'));
  assert.ok(!screen.registry.wellMountain);
  assert.throws(() => screen.validate({ id: 'wellMountain', op: 'bullish' }));
  assert.ok(!screen.pending.some((p) => p.id === 'ichimoku'));
  assert.throws(() => screen.validate({ ...rule, conversion: 4, base: 2 }));
});
test('unconfirmed formulas and malformed source data cannot become passing screen results', () => {
  for (const id of ['di', 'macd', 'made-up']) assert.throws(() => screen.validate({ id }));
  const d = data([2, 3]);
  d.candles.reverse();
  assert.throws(() => screen.evaluate(d, [volume(0)]));
  assert.throws(() => screen.evaluate(data([2, 3]), [volume(-1)]));
  assert.throws(() => screen.evaluate(data([2, 3]), []));
});
