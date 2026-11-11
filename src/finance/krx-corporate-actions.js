(function (root) {
  'use strict';
  const samsung = Object.freeze({
    code: '005930', isin: 'KR7005930003', date: '2018-05-04', newShares: 50, oldShares: 1,
    source: 'https://www.samsung.com/global/ir/reports-disclosures/public-disclosure-view.71265/',
    suspensionDates: ['2018-04-30', '2018-05-02', '2018-05-03'],
  });
  function actionsFor(code, isin) {
    return code === samsung.code && isin === samsung.isin ? [samsung] : [];
  }
  function priceRows(records, basis) {
    if (!['raw', 'split-adjusted'].includes(basis)) throw Error('가격 기준을 확인해 주세요.');
    const last = records.at(-1);
    const events = actionsFor(last.code, last.isin).filter(event => event.date <= last.date);
    const rows = records.map(row => {
      let factor = 1;
      if (basis === 'split-adjusted') {
        for (const event of events) if (row.date < event.date) factor *= event.oldShares / event.newShares;
      }
      return { date: row.date, ...row.values,
        open: row.values.open * factor, high: row.values.high * factor,
        low: row.values.low * factor, close: row.values.close * factor };
    });
    const boundary = events.some(event => records[0].date < event.date && last.date >= event.date);
    return { rows, events, boundary, verified: actionsFor(last.code, last.isin).length > 0 };
  }
  const api = { actionsFor, priceRows, samsung };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockBookKrxActions = api;
})(typeof window === 'object' ? window : globalThis);
