import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
await mkdir('smoke-shots/agent/electron-profile', { recursive: true });
const env = { ...process.env, STOCKBOOK_AGENT_DATA: resolve('smoke-shots/agent/electron-profile') };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['agent/launch.cjs'], env });
try {
  let page;
  for (let attempt = 0; attempt < 100; attempt++) {
    page = app.windows().find(p => p.url().endsWith('stockbook-app.html'));
    if (page) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(page, 'Stockbook main window must load');
  page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => window.stockbookAgent && window.stockbookCharacter, null, { timeout: 30000 }).catch(async e => {
    console.log('Character status:', await page.locator('#sbAgent .agent-status').textContent());
    throw e;
  });
  const config = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('stockbook-app.html')).webContents.getLastWebPreferences());
  assert.equal(config.contextIsolation, true); assert.equal(config.nodeIntegration, false);
  await page.waitForFunction(() => {
    const intro = document.getElementById('mobileIntro');
    return !intro;
  }, null, { timeout: 15000 });
  await page.locator('#loginModal').waitFor({ state: 'visible' });
  await page.locator('#loginModal').getByRole('button', { name: '취소', exact: true }).click();
  await page.locator('#sbAgentToggle').click();
  await page.locator('#sbCharacterChat input').fill('내 평가손익은?');
  await page.locator('#sbCharacterChat button').click();
  await page.waitForFunction(() => window.stockbookCharacter.getSnapshot().displayText.includes('평가손익은'));
  assert.deepEqual(await page.evaluate(() => window.stockbookCharacter.getSnapshot().protocolWarnings), []);
  await page.waitForFunction(() => document.querySelector('.agent-character img')?.naturalWidth > 0);
  // Real network call through the existing preload/main handlers. No API credentials needed.
  const search = await page.evaluate(() => window.stockbookAgent.call('search', { query: '삼성', market: 'KOSPI' }));
  console.log('Electron live search:', JSON.stringify(search));
  assert.equal(search.ok, true, search.error); assert.ok(search.data.total > 0);
  await page.evaluate(() => window.stockbookAgentPanel.run('search', { query: '삼성', market: 'KOSPI' }));
  await page.evaluate(() => window.stockbookAgent.call('show', { screen: 'search' }));
  await page.evaluate(() => setTheme('dark'));
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'smoke-shots/agent/electron-live.png' });
  assert.deepEqual(errors, []);
  console.log('Electron integration passed: real character/core, security settings, live IPC search.');
} finally { await app.close(); }
