/* Stock Book analysis preview. Independently authored; no character-engine code or credentials.
 * Current legacy stock links stay in the adapter. This module does not create persistent assets. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockBookAnalysisPreview = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const text = value => typeof value === 'string' ? value : null;
  const number = value => {
    if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
    const n = Number(value); return Number.isFinite(n) ? n : null;
  };
  const finite = value => Number.isFinite(value) ? value : null;
  const currencyOf = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const strings = values => Array.isArray(values) ? values.filter(v => typeof v === 'string') : [];
  function stockOf(selected) {
    if (!selected || !text(selected.ticker)) throw new TypeError('먼저 분석할 종목을 선택해 주세요.');
    return { stockCode: selected.ticker, market: text(selected.market),
      name: text(selected.name), currency: currencyOf(selected.currency) };
  }
  function quoteOf(selected) {
    const at = number(selected.quoteAt);
    const timestamp = at !== null && at > 0 && at <= 8640000000000000 ? new Date(at).toISOString() : null;
    return { price: number(selected.price), currency: currencyOf(selected.currency),
      changePercent: number(selected.change), receivedAt: timestamp, source: text(selected.quoteSource) };
  }
  function holdingsOf(rows, selected) {
    const groups = new Map(); const warnings = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      // Before #47, ticker is the legacy relation. Do not join different known markets or asset IDs.
      if (!row || row.ticker !== selected.ticker) continue;
      if (row.assetId && selected.assetId && row.assetId !== selected.assetId) continue;
      if (row.market && selected.market && row.market !== selected.market) continue;
      const qty = number(row.qty); if (qty === null || qty <= 0) continue;
      const currency = currencyOf(row.currency);
      const g = groups.get(currency) || { currency, quantity: 0, cost: 0, validCost: !!currency };
      const avg = number(row.avgPrice);
      g.quantity += qty;
      if (avg === null || avg < 0) g.validCost = false; else g.cost += avg * qty;
      groups.set(currency, g);
    }
    const items = [...groups.values()].map(g => {
      const cost = g.validCost ? finite(g.cost) : null;
      if (!g.currency) warnings.push('통화 미확인 보유분의 원가·평가금액은 합산하지 않았습니다.');
      const price = number(selected.price);
      const sameCurrency = !!g.currency && g.currency === currencyOf(selected.currency);
      const value = sameCurrency && price !== null && price >= 0 ? finite(g.quantity * price) : null;
      return { currency: g.currency, quantity: finite(g.quantity), acquisitionCost: cost,
        averageCost: cost !== null && g.quantity > 0 ? finite(cost / g.quantity) : null,
        marketValue: value, unrealizedProfit: value !== null && cost !== null ? finite(value - cost) : null };
    });
    return { items, warnings: [...new Set(warnings)] };
  }
  function journalOf(row) {
    return { stockName: text(row.name), date: date(row.date), buyDate: date(row.buyDate), sellDate: date(row.sellDate),
      type: ['buy', 'sell'].includes(row.type) ? row.type : null,
      buyReasons: strings(row.buyReasons), buyNote: text(row.buyNote), sellReasons: strings(row.sellReasons),
      sellNote: text(row.sellNote), resultNote: text(row.resultNote) };
  }
  function buildPreview({ selected, holdings = [], selectedJournals = [], capturedAt = Date.now() } = {}) {
    const stock = stockOf(selected); const aggregate = holdingsOf(holdings, selected);
    const at = number(capturedAt);
    return { schemaVersion: 'stockbook.analysis-input.v1', capturedAt: at !== null && at >= 0 && at <= 8640000000000000 ? new Date(at).toISOString() : null,
      stock, quote: quoteOf(selected), holdings: aggregate.items,
      journals: (Array.isArray(selectedJournals) ? selectedJournals : []).filter(r => r && typeof r === 'object').map(journalOf),
      notes: aggregate.warnings };
  }
  return Object.freeze({ buildPreview });
});
