/* Runs in Stockbook's renderer: reuse its live state, calculations and panels. */
(() => {
  'use strict';
  if (window.stockbookAgent) return;
  const copy = value => JSON.parse(JSON.stringify(value));
  const open = (panel, tab) => {
    window._MDI?.open(panel);
    if (tab) window._MDIPanelTab?.(panel, tab);
  };
  const tools = {
    watchlist() {
      renderWatchlist(); // Includes Stockbook's legacy migration, if needed.
      return { items: copy((state.watchlist || []).map(w => ({
        ticker: w.ticker, name: w.name, price: w.price ?? null,
        change: w.change ?? null, group: w.group || '미분류'
      }))) };
    },
    accounts() {
      return { items: copy((state.accounts || []).map(a => ({
        id: a.id, nickname: a.nickname, broker: a.broker,
        cash: a.cash ?? null,
        holdings: (state.portfolio || []).filter(s => s.accountId === a.id).map(s => ({
          name: s.name, ticker: s.ticker, qty: s.qty, avgPrice: s.avgPrice,
          currentPrice: s.currentPrice ?? null
        }))
      }))), unassigned: copy((state.portfolio || []).filter(s => !s.accountId).map(s => ({
        name: s.name, ticker: s.ticker, qty: s.qty, avgPrice: s.avgPrice,
        currentPrice: s.currentPrice ?? null
      }))) };
    },
    summary() {
      return { ...calcAssetSummary(), holdings: state.portfolio.length,
        missingPrices: state.portfolio.filter(s => !s.currentPrice).length,
        basis: 'Stockbook calcAssetSummary / getCashBalance · 현재가 없으면 평균단가 적용' };
    },
    async search({ query = '', market = 'KOSPI' } = {}) {
      if (!['KOSPI', 'KOSDAQ'].includes(market)) throw new Error('KOSPI 또는 KOSDAQ를 선택하세요.');
      if (typeof query !== 'string' || query.length > 100) throw new Error('검색어는 100자 이내로 입력하세요.');
      _allMkt = market;
      const input = document.getElementById('allStockSearch');
      if (input) input.value = query;
      if (!_allStockRaw[market]?.length) await loadAllStocks();
      if (!_allStockRaw[market]?.length) throw new Error('전종목 데이터가 없습니다. Electron 앱에서 조회하거나 기존 데이터를 불러오세요.');
      filterAndRenderAll(); // Stockbook's exact name/code/industry filtering.
      return { market, total: _allFiltered.length, items: copy(_allFiltered.slice(0, 30).map(s => ({
        code: s.code, name: s.name, industry: s.industry, price: s.price ?? null
      }))), basis: 'Stockbook 전종목 데이터 · 시총 1,000억 이상 · 최대 30개 표시' };
    },
    show({ screen } = {}) {
      if (screen === 'watchlist') { open('watchlist', 'wl'); renderWatchlist(); }
      else if (screen === 'portfolio') { open('portfolio', 'pf'); renderPortfolio(); }
      else if (screen === 'accounts') openAccountPanel();
      else if (screen === 'search') open('watchlist', 'as');
      else throw new Error('지원하지 않는 화면입니다.');
      return { screen };
    },
    async detail({ code } = {}) {
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('국내 종목의 6자리 코드를 입력하세요.');
      const found = Object.values(_allStockRaw).flat().find(s => s.code === code)
        || (state.watchlist || []).find(s => s.ticker === code)
        || state.portfolio.find(s => s.ticker === code);
      if (!found) throw new Error('관심·보유 또는 전종목 목록에서 먼저 종목을 조회하세요.');
      await openAllStockPopup(code, found.name || code);
      return { code, name: found.name || code, screen: 'detail' };
    }
  };
  window.stockbookAgent = Object.freeze({
    version: 1,
    tools: Object.freeze(Object.keys(tools)),
    async call(name, args = {}) {
      try {
        if (!Object.hasOwn(tools, name)) throw new Error('지원하지 않는 Stockbook 도구입니다.');
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('도구 인자가 올바르지 않습니다.');
        return { ok: true, tool: name, data: await tools[name](args) };
      } catch (e) { return { ok: false, tool: name, error: e.message }; }
    }
  });
})();
