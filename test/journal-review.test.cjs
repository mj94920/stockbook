const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { linkedTrade } = require('../src/journal/trade-review.js');

test('review needs a unique explicit reference and never guesses from name or date', () => {
  const journal = { name: '테스트', type: 'buy', date: '2026-11-07' };
  const trade = { ...journal, reviewTradeId: 'explicit', qty: 4 };
  const linked = { ...journal, reviewTradeId: 'explicit' };
  assert.equal(linkedTrade(journal, [trade]), null);
  assert.equal(linkedTrade(linked, []), null);
  assert.equal(linkedTrade(linked, [trade, { ...trade }]), null);
  assert.equal(linkedTrade(linked, [{ ...trade, name: '다른 종목' }]), null);
  assert.equal(linkedTrade(linked, [{ ...trade, type: 'sell' }]), null);
  assert.equal(linkedTrade(linked, [{ ...journal, qty: 99 }, trade]), trade);
});

test('journal detail uses the linked sale and leaves the original plan unknown', async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') return route.abort();
      return route.fulfill({ path: path.join(__dirname, '..', url.pathname) });
    });
    await page.goto('http://localhost/index.html');
    const result = await page.evaluate(() => {
      state.trades = [];
      state.journals = [];
      state.portfolio = [{ name: '테스트', qty: 10, avgPrice: 100, target1: 999, stop1: 777 }];
      sellTargetIdx = 0;
      document.getElementById('sell_price').value = 120;
      document.getElementById('sell_qty').value = 4;
      confirmSell();
      const [linked] = state.journals;
      const [sale] = state.trades;
      state.journals.push({
        name: sale.name, date: sale.date, type: sale.type, target1: 888,
        resultNote: '기존 결과', lesson: '기존 교훈',
      });
      const before = JSON.stringify(state);
      renderJournals();
      const reviews = [...document.querySelectorAll('.journal-trade-review')].map(node => node.textContent);
      return {
        explicit: Boolean(linked.reviewTradeId) && linked.reviewTradeId === sale.reviewTradeId,
        reviews,
        unchanged: before === JSON.stringify(state),
        remaining: state.portfolio[0].qty,
      };
    });
    assert.equal(result.explicit, true);
    assert.equal(result.unchanged, true);
    assert.equal(result.remaining, 6);
    assert.match(result.reviews[0], /진입 당시 계획\s*확인 불가/);
    assert.match(result.reviews[0], /단가 120원 · 수량 4주/);
    assert.match(result.reviews[0], /실현손익 80원 · 수익률 \+20\.00%/);
    assert.doesNotMatch(result.reviews[0], /999|777/);
    assert.match(result.reviews[1], /실제 거래\s*확인 불가/);
    assert.doesNotMatch(result.reviews[1], /120원|888/);
  } finally {
    await browser.close();
  }
});
