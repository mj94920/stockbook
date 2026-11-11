(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./series.js') : root.StockBookChartSeries);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockBookMarketRadar = api;
})(typeof window === 'object' ? window : globalThis, function (series) {
  'use strict';

  const cache = new WeakMap();
  const period = 14;

  function directionalIndicators(bars) {
    const plus = bars.map(() => null), minus = bars.map(() => null);
    let tr = 0, positive = 0, negative = 0;
    for (let i = 1; i < bars.length; i++) {
      const current = bars[i], previous = bars[i - 1];
      const up = current.high - previous.high, down = previous.low - current.low;
      const range = Math.max(current.high - current.low,
        Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
      const addPlus = up > down && up > 0 ? up : 0;
      const addMinus = down > up && down > 0 ? down : 0;
      // Seed with the first 14 complete changes; then apply Wilder smoothing.
      if (i > period) {
        tr -= tr / period;
        positive -= positive / period;
        negative -= negative / period;
      }
      tr += range;
      positive += addPlus;
      negative += addMinus;
      if (i >= period && tr > 0) {
        plus[i] = 100 * positive / tr;
        minus[i] = 100 * negative / tr;
      }
    }
    return { plus, minus };
  }

  function scanCross(bars, from, to, left, right) {
    let evaluated = 0, latest = null, cross = null;
    for (let i = Math.max(1, from); i <= to; i++) {
      const values = [left[i], right[i], left[i - 1], right[i - 1]];
      if (!values.every(Number.isFinite)) continue;
      evaluated++;
      const [value, reference, previousValue, previousReference] = values;
      latest = { date: bars[i].date, previousDate: bars[i - 1].date, value, reference, previousValue, previousReference };
      if (previousValue <= previousReference && value > reference) cross = latest;
    }
    return { state: cross ? 'crossed' : evaluated ? 'absent' : 'unknown', evaluated, point: cross || latest };
  }

  function read(daily, range = '6m') {
    if (!Array.isArray(daily?.candles) || !daily.candles.length || !series?.ranges.includes(range)) return null;
    const complete = daily.lastBarComplete === true, key = range + ':' + complete;
    let readings = cache.get(daily.candles);
    if (!readings) { readings = new Map(); cache.set(daily.candles, readings); }
    if (readings.has(key)) return readings.get(key);
    try {
      const bars = series.aggregate(daily.candles, 'day', { lastBarComplete: complete });
      const from = series.visibleOffset(bars, range, 'day');
      const to = bars.length - (complete ? 1 : 2);
      if (to < from) return null;
      const di = directionalIndicators(bars);
      const result = { start: bars[from].date, end: bars[to].date,
        golden: scanCross(bars, from, to, series.average(bars, 5), series.average(bars, 10)),
        di: scanCross(bars, from, to, di.plus, di.minus) };
      readings.set(key, result);
      return result;
    } catch { return null; }
  }

  return Object.freeze({ read, directionalIndicators });
});
