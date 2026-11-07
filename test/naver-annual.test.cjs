const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { annualRows } = require('../src/finance/naver-annual.js');

const fixture = {
  annualMetadata: { provider: '네이버 금융', fetchedAt: '2026-11-07T01:30:00.000Z' },
  annual: {
    financeInfo: {
      trTitleList: [
        { title: '2025.12.', key: '202512', isConsensus: 'N' },
        { title: '2026.12.', key: '202612', isConsensus: 'Y' },
        { title: '미제공', key: 'unknown' },
      ],
      rowList: [
        { title: '매출액', columns: { '202512': { value: '1,234' }, '202612': { value: '2,345' } } },
        { title: '영업이익', unit: '억원', columns: { '202512': { value: 0 }, '202612': { value: '-5' } } },
        { title: '당기순이익', columns: { '202512': { value: '' } } },
        { title: '영업이익률', columns: { '202512': { value: '0.00%' } } },
      ],
    },
  },
};

test('uses the provider period and status and keeps real zero separate from unavailable values', () => {
  assert.deepEqual(annualRows(fixture.annual), [
    { period: '2025.12', kind: '실적', values: ['1,234 (단위 확인 불가)', '0 억원', '확인 불가', '0.00 %', '확인 불가'] },
    { period: '2026.12', kind: '추정', values: ['2,345 (단위 확인 불가)', '-5 억원', '확인 불가', '확인 불가', '확인 불가'] },
    { period: '확인 불가', kind: '확인 불가', values: Array(5).fill('확인 불가') },
  ]);
});

test('handles legacy rows and refuses to invent dates, units or zero values', () => {
  const [row] = annualRows({ annualFinance: [{ year: 2024, totSale: 0, revenue: 8, netIncome: '—' }] });
  assert.equal(row.period, '2024');
  assert.equal(row.kind, '확인 불가');
  assert.equal(row.values[0], '0 (단위 확인 불가)');
  assert.equal(row.values[2], '확인 불가');
  assert.deepEqual(annualRows({ financeInfo: {} }), []);
});

test('both domestic finance views show provider, period and retrieval time separately', async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === 'http://localhost'
        ? route.fulfill({ path: path.join(__dirname, '..', url.pathname) })
        : route.abort();
    });
    await page.goto('http://localhost/index.html');
    const displayed = await page.evaluate(res => {
      const finance = document.createElement('div');
      finance.innerHTML = _buildFinanceTable(res, '005930');
      const analysis = document.createElement('div');
      _renderAnalysisBody(analysis, { name: '테스트', ticker: '005930', qty: 1, avgPrice: 100 }, res, null);
      const read = node => {
        const table = node.querySelector('table[aria-label="국내 연간 재무표"]');
        return {
          caption: table.caption.textContent.trim(),
          rows: [...table.tBodies[0].rows].map(row => [...row.cells].map(cell => cell.textContent)),
        };
      };
      return [read(finance), read(analysis)];
    }, fixture);
    for (const table of displayed) {
      assert.match(table.caption, /제공처 네이버 금융 · 조회 시각 .*10:30:00.*KST/);
      assert.deepEqual(table.rows[0].slice(0, 5), ['2025.12', '실적', '1,234 (단위 확인 불가)', '0 억원', '확인 불가']);
      assert.deepEqual(table.rows[1].slice(0, 2), ['2026.12', '추정']);
      assert.deepEqual(table.rows[2].slice(0, 2), ['확인 불가', '확인 불가']);
    }
  } finally {
    await browser.close();
  }
});
