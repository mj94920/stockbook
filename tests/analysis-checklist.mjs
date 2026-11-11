// Run from the checkout root: node tests/analysis-checklist.mjs
// Uses a fresh browser profile and blocks all external requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const assets = new Map([
  ['/index.html', ['text/html; charset=utf-8', await readFile('index.html')]],
  ['/src/desktop/shortcuts.js', ['text/javascript; charset=utf-8', await readFile('src/desktop/shortcuts.js')]],
  ['/src/desktop/stock-selection.js', ['text/javascript; charset=utf-8', await readFile('src/desktop/stock-selection.js')]],
  ['/src/analysis/report-data.js', ['text/javascript; charset=utf-8', await readFile('src/analysis/report-data.js')]],
  ['/src/finance/naver-annual.js', ['text/javascript; charset=utf-8', await readFile('src/finance/naver-annual.js')]],
]);
const server = createServer((req, res) => {
  const asset = assets.get(req.url);
  if (!asset) { res.writeHead(404); res.end(); return; }
  const [type, body] = asset;
  res.setHeader('content-type', type);
  res.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route =>
    route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto(`${base}/index.html`);
  const cases = [
    { name: 'empty', checks: {}, expected: 0 },
    { name: 'unknown keys only', checks: { retired: true, extra: 1 }, expected: 0 },
    { name: 'six valid plus stale', checks: { pos: true, align: true, knee: true,
      golden: true, ma20: true, ma200: true, retired: true }, expected: 6 },
    { name: 'toggle a seventh item', checks: { align: true, knee: true,
      golden: true, ma20: true, ma200: true, pivot: true, retired: true }, expected: 6 },
    { name: 'ten valid plus stale', checks: { pos: true, align: true, knee: true,
      golden: true, ma20: true, ma200: true, pivot: true, gap: true,
      monthly: true, index: true, retired: true }, expected: 10 },
    { name: 'existing truthy values', checks: { pos: 1, align: 'saved', retired: true }, expected: 2 },
  ];
  for (const scenario of cases) {
    const result = await page.evaluate(({ checks }) => {
      const stock = { name: '__checklist_test__', ticker: 'TEST', qty: 1,
        avgPrice: 100, currentPrice: 100 };
      const second = { name: '다른 종목', ticker: 'OTHER' };
      state.watchlist = [stock, second];
      state.analysisChecks = { [stock.name]: structuredClone(checks), [second.name]: { gap: true } };
      const box = document.getElementById('sbAiPrinciples');
      box.open = true;
      const select = ticker => { window._dockSel = ticker; dockCtxRender(); };
      const snapshot = () => ({
        checked: box.querySelectorAll('input[type=checkbox]:checked').length,
        count: box.querySelector('#sbAiPrincipleCount').textContent,
      });
      select(stock.ticker);
      const initial = snapshot();
      box.querySelector('input[type=checkbox]').click();
      const toggled = snapshot();
      select(second.ticker);
      const other = snapshot();
      select(stock.ticker);
      return { initial, toggled, other, reopened: snapshot(), saved: JSON.parse(localStorage.getItem(STORAGE_KEY)).analysisChecks[stock.name] };
    }, scenario);
    const expectedAfter = scenario.expected + (scenario.checks.pos ? -1 : 1);
    assert.deepEqual(result.initial, { checked: scenario.expected,
      count: `${scenario.expected}/10` }, scenario.name);
    assert.deepEqual(result.toggled, { checked: expectedAfter,
      count: `${expectedAfter}/10` }, scenario.name);
    assert.deepEqual(result.other, { checked: 1, count: '1/10' }, scenario.name);
    assert.deepEqual(result.reopened, result.toggled, scenario.name);
    assert.deepEqual(result.saved, { ...scenario.checks, pos: !scenario.checks.pos },
      `${scenario.name}: preserve unknown stored keys`);
    console.log(`PASS ${scenario.name}: ${result.initial.count} → ${result.toggled.count}`);
  }
  await page.reload();
  await page.evaluate(() => { window._dockSel = 'TEST'; dockCtxRender(); });
  assert.equal(await page.locator('#sbAiPrincipleCount').textContent(), '1/10');

  await page.evaluate(() => {
    const stock = { code: '005935', name: '삼성전자우', price: 100000 };
    state.portfolio = [{ ticker: stock.code, name: stock.name, qty: 1, avgPrice: 99000 }];
    _allStockRaw.KOSPI = _allFiltered = [stock];
    window.electronAPI = {
      fetchNaverFinance: async () => ({ annual: { corporationSummary: { comment1: '기업 요약 테스트' } } }),
      fetchDartAnnual: async () => ({ ok: false, error: '검사 자료' }),
      saveState: async () => true,
    };
    window._MDIPanelTab('watchlist', 'as');
    renderAllStockTable();
  });
  const companyAction = page.locator('#allStockBody').getByRole('button', { name: '기업 정보', exact: true });
  assert.equal(await companyAction.evaluate(button => getComputedStyle(button).whiteSpace), 'nowrap');
  await companyAction.press('Enter');
  const company = page.getByRole('complementary', { name: '기업 정보', exact: true });
  await company.getByText('기업 요약 테스트').waitFor();
  const facts = await company.innerText();
  assert.match(facts, /삼성전자우.*005935/);
  assert.match(facts, /Open DART 연간 주요 재무정보/i);
  assert.match(facts, /핵심 투자지표/);
  assert.doesNotMatch(facts, /체크리스트|AI 코멘트|평균단가|평가손익/);
  await company.getByRole('button', { name: '기업 정보 닫기' }).click();
  await company.waitFor({ state: 'hidden' });
  console.log('PASS company information opens from the stock list and contains financial facts only');
  await page.locator('#sbAiPrinciples > summary').click();
  await page.locator('#sbAiPrinciplesList input').last().check();
  assert.equal(await page.locator('#sbAiPrincipleCount').textContent(), '2/10');
  assert.ok(await page.locator('#sbAnalysis').evaluate(panel => panel.scrollTop > 0));
  console.log('PASS all checklist items are reachable in the narrow AI panel');
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
