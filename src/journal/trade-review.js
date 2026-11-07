(function (root) {
  'use strict';

  // Only call when the same action creates both the trade and the journal draft.
  function linkNewDraft(trade) {
    const id = root.crypto?.randomUUID?.();
    if (!id) return {};
    trade.reviewTradeId = id;
    return { reviewTradeId: id };
  }

  function linkedTrade(journal, trades) {
    const id = journal.reviewTradeId;
    if (typeof id !== 'string' || !id) return null;

    const matches = trades.filter(trade => trade?.reviewTradeId === id);
    if (matches.length !== 1) return null;
    const [trade] = matches;
    if (trade.type !== 'buy' && trade.type !== 'sell') return null;
    return trade.type === journal.type && trade.name === journal.name ? trade : null;
  }

  const api = { linkNewDraft, linkedTrade };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockBookJournalReview = api;
})(globalThis);
