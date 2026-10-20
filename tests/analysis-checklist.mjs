// Run from the checkout root: node tests/analysis-checklist.mjs
// Uses a fresh browser profile and blocks all external requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = await readFile('index.html');
const server = createServer((req, res) => {
  if (req.url !== '/index.html') { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
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
    { name: 'six to seven threshold', checks: { align: true, knee: true,
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
      document.getElementById('checklist-test')?.remove();
      const box = document.createElement('div');
      box.id = 'checklist-test'; document.body.appendChild(box);
      state.analysisChecks = { [stock.name]: structuredClone(checks) };
      const render = () => _renderAnalysisBody(box, stock, null, {});
      const snapshot = () => ({
        checked: box.querySelectorAll('input[type=checkbox]:checked').length,
        count: box.querySelector('#analysisScore strong').textContent,
        label: box.querySelector('#analysisScore span').textContent,
      });
      render();
      const initial = snapshot();
      // Trigger the real onchange handler and save(), then verify a fresh render.
      box.querySelector('input[type=checkbox]').click();
      const toggled = snapshot();
      render();
      return { initial, toggled, reopened: snapshot(), saved: state.analysisChecks[stock.name] };
    }, scenario);
    const expectedAfter = scenario.expected + (scenario.checks.pos ? -1 : 1);
    const label = count => count >= 7 ? '✅ 매수 조건 우호적'
      : count >= 4 ? '⚠️ 조건 일부 미충족' : '🔴 조건 대부분 미충족';
    assert.deepEqual(result.initial, { checked: scenario.expected,
      count: `${scenario.expected}/10`, label: label(scenario.expected) }, scenario.name);
    assert.deepEqual(result.toggled, { checked: expectedAfter,
      count: `${expectedAfter}/10`, label: label(expectedAfter) }, scenario.name);
    assert.deepEqual(result.reopened, result.toggled, scenario.name);
    assert.deepEqual(result.saved, { ...scenario.checks, pos: !scenario.checks.pos },
      `${scenario.name}: preserve unknown stored keys`);
    console.log(`PASS ${scenario.name}: ${result.initial.count} → ${result.toggled.count}`);
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
