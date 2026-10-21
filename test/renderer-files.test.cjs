const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { prepareRendererFiles } = require('../src/desktop/renderer-files.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stockbook-stage-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, '설치 원본');
  const temp = path.join(root, 'temp');
  fs.mkdirSync(source); fs.mkdirSync(temp);
  fs.writeFileSync(path.join(source, 'index.html'), '<html><body><img src="./icon-192.png"></body></html>');
  fs.copyFileSync(path.join(__dirname, '../icon-192.png'), path.join(source, 'icon-192.png'));
  return { source, temp };
}

test('copies required assets and isolates successive launches', t => {
  const { source, temp } = fixture(t);
  const first = prepareRendererFiles(source, temp);
  fs.writeFileSync(path.join(source, 'index.html'), '<html>new release</html>');
  const second = prepareRendererFiles(source, temp);
  assert.notEqual(first.directory, second.directory);
  assert.equal(fs.readFileSync(second.htmlPath, 'utf8'), '<html>new release</html>');
  assert.match(fs.readFileSync(first.htmlPath, 'utf8'), /icon-192/);
  assert.deepEqual(fs.readFileSync(path.join(second.directory, 'icon-192.png')),
    fs.readFileSync(path.join(source, 'icon-192.png')));
});

test('missing required asset fails and removes incomplete staging', t => {
  const { source, temp } = fixture(t);
  fs.unlinkSync(path.join(source, 'icon-192.png'));
  assert.throws(() => prepareRendererFiles(source, temp), /ENOENT/);
  assert.deepEqual(fs.readdirSync(temp), []);
});

test('missing relative script fails before loading HTML', t => {
  const { source, temp } = fixture(t);
  fs.appendFileSync(path.join(source, 'index.html'), '<script src="src/analysis-ai/preview.js"></script>');
  assert.throws(() => prepareRendererFiles(source, temp), /ENOENT/);
  assert.deepEqual(fs.readdirSync(temp), []);
});

test('relative script cannot escape its private staging directory', t => {
  const { source, temp } = fixture(t);
  fs.appendFileSync(path.join(source, 'index.html'), '<script src="../outside.js"></script>');
  assert.throws(() => prepareRendererFiles(source, temp), /invalid renderer script/);
  assert.deepEqual(fs.readdirSync(temp), []);
});

test('packaging includes the main-process staging helper', () => {
  const pkg = require('../package.json');
  assert.ok(pkg.build.files.includes('src/desktop/renderer-files.cjs'));
  assert.equal(pkg.build.asar, false);
});

test('file:// staging loads nested scripts and brand asset, then handles a click', async t => {
  const { source, temp } = fixture(t);
  const scripts = path.join(source, 'src/analysis-ai');
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(scripts, 'preview.js'), 'window.PreviewModel = { ready: true };');
  fs.writeFileSync(path.join(scripts, 'preview-ui.js'),
    'document.getElementById("open").onclick = () => { document.getElementById("result").textContent = window.PreviewModel.ready ? "opened" : "missing"; };');
  fs.appendFileSync(path.join(source, 'index.html'),
    '<button id="open">Open</button><div id="result"></div><script src="src/analysis-ai/preview.js"></script><script src="src/analysis-ai/preview-ui.js"></script>');
  const prepared = prepareRendererFiles(source, temp);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(request.url()));
    await page.goto(pathToFileURL(path.join(source, 'index.html')).href);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto(pathToFileURL(prepared.htmlPath).href);
    assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'dark');
    await page.locator('#open').click();
    assert.equal(await page.locator('#result').textContent(), 'opened');
    assert.ok(await page.locator('img').evaluate(img => img.complete && img.naturalWidth > 0));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
