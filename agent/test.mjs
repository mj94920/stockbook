import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPreview } from './preview.mjs';
const { server, url } = await createPreview({ indexPath: process.env.AGENT_INDEX });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => route.request().url().startsWith(new URL(url).origin) ? route.continue() : route.abort());
  await page.goto(url); await page.waitForFunction(() => window.stockbookAgent);
  const call = (name, args = {}) => page.evaluate(([n, a]) => window.stockbookAgent.call(n, a), [name, args]);
  assert.equal((await call('watchlist')).data.items.length, 0);
  assert.equal((await call('summary')).data.holdings, 0);
  assert.equal((await call('search', { query: '삼성' })).ok, false);
  assert.equal((await call('delete')).ok, false);
  assert.equal((await call('constructor')).ok, false);
  assert.equal((await call('search', { market: '../secret' })).ok, false);
  assert.equal((await call('detail', { code: "'><img>" })).ok, false);
  // Synthetic fixtures exist only inside this disposable test context, never in the app.
  await page.evaluate(() => {
    state.accounts = [{ id: 'a', nickname: '테스트 A', broker: 'kis', cash: 300, accountNumber: 'SECRET' }, { id: 'b', nickname: '테스트 B', cash: 200 }];
    state.portfolio = [{ name: '검증종목', ticker: '005930', qty: 10, avgPrice: 100, currentPrice: 120, accountId: 'a' }, { name: '검증종목', ticker: '005930', qty: 5, avgPrice: 200, currentPrice: null, accountId: 'b' }];
    state.watchlist = [{ name: '검증종목', ticker: '005930', price: null }];
    _allStockRaw.KOSPI = [{ code: '005930', name: '검증종목', industry: '반도체', price: 120 }, { code: '000001', name: '다른종목', industry: '은행', price: 50 }];
    _renderAll();
  });
  const summary = (await call('summary')).data;
  assert.equal(summary.pnl, 200); assert.equal(summary.total, 2700); assert.equal(summary.rate, 10); assert.equal(summary.missingPrices, 1);
  const accounts = await call('accounts');
  assert.equal(accounts.data.items[1].holdings[0].qty, 5);
  assert.ok(!JSON.stringify(accounts).includes('SECRET'));
  assert.equal((await call('search', { query: '반도체' })).data.total, 1);
  assert.equal((await call('search', { query: '005930' })).data.items[0].code, '005930');
  assert.equal((await call('search', { query: '없는종목' })).data.total, 0);
  for (const screen of ['watchlist', 'portfolio', 'accounts', 'search']) {
    assert.equal((await call('show', { screen })).ok, true);
    await page.waitForTimeout(100); // Allow original panel's requestAnimationFrame to finish.
    if (screen === 'portfolio') assert.notEqual(await page.locator('#mdi-ptc-portfolio-pf').evaluate(el => getComputedStyle(el).display), 'none');
  }
  await page.evaluate(() => closeAccountPanel());
  await page.waitForTimeout(350);
  await call('detail', { code: '005930' });
  assert.equal(await page.locator('#allStockDetailPopup').count(), 1);
  await page.evaluate(() => document.getElementById('allStockDetailPopup')?.remove());
  await page.locator('#sbAgentToggle').click();
  await page.locator('[data-tool="summary"]').click();
  await page.waitForFunction(() => document.getElementById('sbAgentResult').textContent.includes('2,700'));
  if (process.env.CHARACTER_PROJECT) {
    await page.waitForFunction(() => window.stockbookCharacter);
    assert.equal(await page.locator('.agent-character img').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await page.locator('#sbCharacterChat input').fill('내 평가손익은?');
    await page.locator('#sbCharacterChat button').click();
    await page.waitForFunction(() => window.stockbookCharacter.getSnapshot().displayText.includes('200원'));
    assert.deepEqual(await page.evaluate(() => window.stockbookCharacter.getSnapshot().protocolWarnings), []);
  }
  await mkdir('smoke-shots/agent', { recursive: true });
  for (const width of [1400, 1024]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width, height: width === 1400 ? 900 : 768 });
    await page.evaluate(mode => setTheme(mode), theme);
    await page.waitForTimeout(250); // Existing component theme transitions.
    const bounds = await page.locator('#sbAgent').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.screenshot({ path: resolve(`smoke-shots/agent/${width}-${theme}.png`) });
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#sbAgentToggle').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(errors, []);
  console.log('Agent integration passed: data, calculations, original panels, errors, themes, character core.');
} finally { await browser.close(); server.close(); }
