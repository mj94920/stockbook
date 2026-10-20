'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

test('real app preview: no external request, explicit journal selection, immutable data, theme support and no persistence', async () => {
  const root = path.resolve(__dirname, '..');
  const server = createServer(async (req, res) => {
    try {
      const relative = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(root, relative); if (!file.startsWith(root + path.sep)) throw new Error('path');
      const body = await readFile(file);
      res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = []; let external = 0;
    page.on('pageerror', err => errors.push(err.message)); page.on('dialog', d => d.dismiss());
    await page.route('**/*', route => { if (route.request().url().startsWith(base)) return route.continue(); external++; return route.abort(); });
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      state.watchlist = [{ ticker: '005930', market: 'KOSPI', currency: 'KRW', name: '삼성전자', price: 120, change: 1.5, quoteAt: Date.now(), quoteSource: '테스트 수신 시세' }];
      state.portfolio = [{ ticker: '005930', currency: 'KRW', qty: 2, avgPrice: 100, accountId: 'SECRET-ACCOUNT' }];
      state.journals = [{ name: '삼성전자', date: '2026-10-20', buyNote: '<img src=x onerror="window.LEAK=true"> SELECTED' }, { name: '다른 종목', buyNote: 'UNSELECTED-SECRET' }];
      window._dockSel = '005930'; window._MDI.show('watchlist');
    });
    await page.waitForTimeout(100);
    const storedBefore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    const before = external;
    await page.locator('#sbAiPreviewOpen').click();
    await page.waitForTimeout(100);
    assert.equal(external, before, 'preview causes no new external request');
    assert.equal(await page.locator('#sbAiPreviewDialog').isVisible(), true);
    let payload = JSON.parse(await page.locator('#sbAiPayload').textContent());
    assert.equal(payload.journals.length, 0); assert.equal(payload.holdings[0].quantity, 2);
    assert.doesNotMatch(JSON.stringify(payload), /SECRET/);
    await page.locator('#sbAiJournalChecks > summary').click();
    await page.locator('#sbAiJournalChoices input').first().check();
    payload = JSON.parse(await page.locator('#sbAiPayload').textContent());
    assert.equal(payload.journals.length, 1); assert.match(payload.journals[0].buyNote, /SELECTED/);
    assert.doesNotMatch(JSON.stringify(payload), /UNSELECTED-SECRET/);
    assert.equal(await page.evaluate(() => window.LEAK), undefined, 'journal is text, not executable HTML');
    await page.evaluate(() => { state.watchlist[0].price = 999; state.journals[0].buyNote = 'CHANGED'; });
    await page.locator('#sbAiJournalChoices input').first().uncheck();
    await page.locator('#sbAiJournalChoices input').first().check();
    payload = JSON.parse(await page.locator('#sbAiPayload').textContent());
    assert.equal(payload.quote.price, 120); assert.match(payload.journals[0].buyNote, /SELECTED/);
    await page.locator('#sbAiConsent').check();
    assert.equal(await page.locator('#sbAiPreviewDialog .sb-btn--primary').isDisabled(), true, 'consent does not enable an unconnected engine');
    await mkdir(path.join(root, 'artifacts'), { recursive: true });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(light => document.body.classList.toggle('light-mode', light), theme === 'light');
      await page.waitForTimeout(250);
      await page.locator('#sbAiPreviewDialog .sb-modal__body').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: path.join(root, 'artifacts', `analysis-ai-preview-${theme}.png`) });
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sbAiPreviewDialog').isVisible(), false);
    assert.equal(await page.locator('#sbAiPayload').textContent(), '');
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), storedBefore, 'preview and consent do not write to storage');
    await page.locator('#sbAiPreviewOpen').click();
    assert.equal(JSON.parse(await page.locator('#sbAiPayload').textContent()).journals.length, 0, 'review selection resets for each request');
    assert.equal(JSON.parse(await page.locator('#sbAiPayload').textContent()).quote.price, 999, 'reopening captures new data');
    await page.locator('#sbAiPreviewDone').click();
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#sbAiConsent').isChecked(), false, 'consent does not survive app restart');
    assert.equal(await page.locator('#sbAiPayload').textContent(), '');
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
