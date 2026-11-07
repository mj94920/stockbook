const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { calculateSale, summarizeSales } = require('../src/portfolio/realized-profit.js');

test('sale P&L preserves the average-cost formula before fees and taxes', () => {
  assert.deepEqual(calculateSale(120, 10, 100), { pnl: 200, pnlPct: 20 });
  assert.deepEqual(calculateSale(120, 4, 100), { pnl: 80, pnlPct: 20 });
  assert.deepEqual(calculateSale(90, 6, 100), { pnl: -60, pnlPct: -10 });
  assert.deepEqual(calculateSale(100, 2, 100), { pnl: 0, pnlPct: 0 });
  assert.equal(calculateSale(100, 2, 0).pnlPct, null);
});

test('display uses stored rates, explicit cost basis, and recognizable legacy quick sales', () => {
  const sales = [
    Object.freeze({ price: 130, buyPrice: 100, pnlPct: 0, pnl: 0 }),
    Object.freeze({ price: 120, buyPrice: 100, qty: 4, pnl: 80 }),
    Object.freeze({ price: 90, qty: 6, totalAmt: 540, pnl: -60, memo: '빠른 주문 입력' }),
    Object.freeze({ price: 100, qty: 1, pnl: 0, totalAmt: 100, memo: '빠른 주문 입력' }),
    Object.freeze({ price: 120, qty: 4, pnl: 80 }),
  ];
  const result = summarizeSales(sales);
  assert.deepEqual(result.rows.map(row => row.pnlPct), [0, 20, -10, 0, null]);
  assert.equal(result.count, 5);
  assert.equal(result.knownCount, 4);
  assert.equal(result.total, 100);
  assert.equal(result.avgPct, 2.5);
});

test('incomplete or inconsistent legacy records do not enter the average', () => {
  const quick = { memo: '빠른 주문 입력', price: 120, qty: 4, pnl: 80, totalAmt: 480 };
  const result = summarizeSales([
    { ...quick, totalAmt: 479 },
    { ...quick, qty: 0 },
    { ...quick, pnl: null },
    { ...quick, pnl: 480 },
    { pnlPct: NaN },
    { pnlPct: null },
  ]);
  assert.ok(result.rows.every(row => row.pnlPct === null));
  assert.equal(result.knownCount, 0);
  assert.equal(result.avgPct, null);
  assert.equal(summarizeSales([]).avgPct, null);
});

test('both sell entry points record the same return and the realized view excludes unknowns', async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://stockbook.test') return route.abort();
      return route.fulfill({ path: path.join(__dirname, '..', url.pathname) });
    });
    await page.goto('http://stockbook.test/index.html');

    const sales = await page.evaluate(() => {
      function recordSale(quick, price, qty) {
        state.portfolio = [{ name: '테스트 종목', ticker: '000001', qty: 10, avgPrice: 100 }];
        state.trades = [];
        state.journals = [];
        const set = (id, value) => { document.getElementById(id).value = value; };
        if (quick) {
          _qoMode = 'sell';
          _qoTradeType = 'cash';
          set('qo_name_input', '테스트 종목');
          set('qo_price', price);
          set('qo_qty', qty);
          submitQuickOrder();
        } else {
          sellTargetIdx = 0;
          set('sell_price', price);
          set('sell_qty', qty);
          confirmSell();
        }
        const { pnl, pnlPct } = state.trades[0];
        return { pnl, pnlPct, remaining: state.portfolio[0]?.qty ?? 0 };
      }
      return [[120, 4], [90, 10], [100, 1]].map(([price, qty]) =>
        [recordSale(false, price, qty), recordSale(true, price, qty)]
      );
    });
    const expected = [
      { pnl: 80, pnlPct: 20, remaining: 6 },
      { pnl: -100, pnlPct: -10, remaining: 0 },
      { pnl: 0, pnlPct: 0, remaining: 9 },
    ];
    assert.deepEqual(sales, expected.map(sale => [sale, sale]));

    const display = await page.evaluate(() => {
      state.trades = [
        { type: 'sell', name: '빠른 매도', price: 120, qty: 4, pnl: 80, totalAmt: 480, memo: '빠른 주문 입력' },
        { type: 'sell', name: '본전', pnl: 0, pnlPct: 0 },
        { type: 'sell', name: '근거 부족', price: 120, qty: 4, pnl: 80 },
      ];
      document.getElementById('realizedYear').value = 'all';
      const before = JSON.stringify(state.trades);
      renderRealizedTab();
      return {
        count: document.getElementById('rs_count').textContent,
        average: document.getElementById('rs_avg').textContent,
        rates: Array.from(document.querySelectorAll('#realizedBody tr td:nth-child(7)'), cell => cell.textContent),
        unchanged: JSON.stringify(state.trades) === before,
      };
    });
    assert.deepEqual(display, {
      count: '3건 (수익률 확인 2건)',
      average: '+10.00%',
      rates: ['+20.00%', '+0.00%', '확인 불가'],
      unchanged: true,
    });
  } finally {
    await browser.close();
  }
});
