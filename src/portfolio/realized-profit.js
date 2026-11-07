(function (root) {
  'use strict';

  const positive = value => Number.isFinite(value) && value > 0;

  function calculateSale(price, qty, avgPrice) {
    const change = price - avgPrice;
    const rate = positive(Number(avgPrice)) ? change / avgPrice * 100 : null;
    return {
      pnl: change * qty,
      pnlPct: Number.isFinite(rate) ? rate : null,
    };
  }

  function saleReturn(trade) {
    if (Number.isFinite(trade.pnlPct)) return trade.pnlPct;
    if (!positive(trade.price)) return null;

    let avgPrice = trade.buyPrice;
    if (avgPrice == null) {
      // Legacy quick sales stored gross P&L and proceeds, but omitted the cost basis.
      if (trade.memo !== '빠른 주문 입력' || !positive(trade.qty) ||
          !Number.isFinite(trade.pnl) || trade.totalAmt !== trade.price * trade.qty) {
        return null;
      }
      avgPrice = trade.price - trade.pnl / trade.qty;
    }
    if (!positive(avgPrice)) return null;

    return calculateSale(trade.price, trade.qty, avgPrice).pnlPct;
  }

  function summarizeSales(sells) {
    const rows = sells.map(trade => ({ trade, pnlPct: saleReturn(trade) }));
    const rates = rows.map(row => row.pnlPct).filter(Number.isFinite);
    return {
      rows,
      count: rows.length,
      knownCount: rates.length,
      total: sells.reduce((sum, trade) => sum + (trade.pnl || 0), 0),
      avgPct: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null,
    };
  }

  const api = { calculateSale, summarizeSales };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockBookRealizedProfit = api;
})(globalThis);
