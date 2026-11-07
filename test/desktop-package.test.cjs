'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  fsp = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm'),
  { chromium } = require('playwright');
const { prepareRendererFiles, rendererReferences } = require('../src/desktop/renderer-files.cjs'),
  { createAppServer } = require('./helpers/app-server.cjs');
const root = path.resolve(__dirname, '..'),
  pkg = require('../package.json');
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(name) : [name];
  });
}
function stagePackage(destination, patterns = pkg.build.files) {
  const files = [
    ...sourceFiles(path.join(root, 'src')),
    ...pkg.build.files.filter((name) => !/[?*]/.test(name)).map((name) => path.join(root, name)),
  ];
  for (const source of new Set(files)) {
    const name = path.relative(root, source).split(path.sep).join('/');
    if (!patterns.some((pattern) => path.matchesGlob(name, pattern))) continue;
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}
test('the declared unpacked package contains every entrypoint renderer asset, and missing screener files reproduce the deployment failure', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-runtime-package-'));
  try {
    const app = path.join(temp, 'app');
    fs.mkdirSync(app);
    stagePackage(app);
    for (const entry of ['index.html', 'chart.html'])
      for (const reference of rendererReferences(fs.readFileSync(path.join(app, entry), 'utf8'))) {
        const file = path.resolve(app, reference.split(/[?#]/)[0]);
        assert.equal(fs.existsSync(file), true, entry + ': ' + reference);
      }
    const staged = prepareRendererFiles(app, temp);
    for (const name of ['engine.js', 'expression.js', 'temporal.js', 'client.js', 'screener.css'])
      assert.equal(fs.existsSync(path.join(staged.directory, 'src/screener', name)), true);
    const broken = path.join(temp, 'broken');
    fs.mkdirSync(broken);
    stagePackage(
      broken,
      pkg.build.files.filter((pattern) => pattern !== 'src/screener/**'),
    );
    assert.throws(
      () => prepareRendererFiles(broken, temp),
      /Missing or invalid renderer asset: src\/screener\//,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test('renderer staging validates local CSS/icons as well as scripts and ignores markup-like JavaScript strings', () => {
  assert.deepEqual(
    rendererReferences(
      `<script src="a.js"></script><script>const sample="<img src='not-a-file.png'>";</script><link rel="stylesheet" href="a.css?v=1"><link rel="icon" href="icon.png"><link rel="preconnect" href="https://example.com"><img src="data:image/png;base64,eA==">`,
    ),
    ['a.js', 'a.css?v=1', 'icon.png'],
  );
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-css-package-'));
  try {
    const app = path.join(temp, 'app');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'index.html'), '<link rel="stylesheet" href="missing.css">');
    fs.writeFileSync(path.join(app, 'icon-192.png'), 'fixture');
    assert.throws(() => prepareRendererFiles(app, temp), /missing\.css/);
    assert.equal(
      fs.readdirSync(temp).some((name) => name.startsWith('stockbook-renderer-')),
      false,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test('all runtime JavaScript files compile, including modules skipped by the legacy inline checker', () => {
  for (const file of sourceFiles(path.join(root, 'src')).filter((file) =>
    /\.(?:js|cjs)$/.test(file),
  ))
    assert.doesNotThrow(
      () =>
        new vm.Script(
          '(function(exports,require,module,__filename,__dirname){\n' +
            fs.readFileSync(file, 'utf8') +
            '\n})',
          { filename: path.relative(root, file) },
        ),
    );
});
test('the packaged renderer initializes and opens condition search using its shipped assets', async () => {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'sb-package-browser-'));
  let browser, server;
  try {
    const app = path.join(temp, 'app');
    await fsp.mkdir(app);
    stagePackage(app);
    const staged = prepareRendererFiles(app, temp);
    server = createAppServer(staged.directory);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch();
    const page = await browser.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) =>
      r.request().url().startsWith(base) ? r.continue() : r.abort(),
    );
    await page.goto(base + '/index.html');
    await page.locator('#sbScreenOpen').click();
    const dialog = page.getByRole('dialog', { name: '지표 조건검색' });
    await dialog.getByRole('button', { name: '거래대금 조건 추가', exact: true }).click();
    assert.equal(
      await dialog
        .locator('[data-condition-key=B]')
        .getByLabel('지표', { exact: true })
        .inputValue(),
      'turnover',
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server) await new Promise((r) => server.close(r));
    await fsp.rm(temp, { recursive: true, force: true });
  }
});
test('shared browser server serves correct MIME and blocks paths/symlinks outside its root', async () => {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'sb-test-server-')),
    app = path.join(temp, 'app');
  await fsp.mkdir(app);
  await fsp.writeFile(path.join(app, 'index.html'), '<p>test page</p>');
  await fsp.writeFile(path.join(app, 'data.json'), '{}');
  await fsp.writeFile(path.join(temp, 'outside.txt'), 'outside fixture');
  await fsp.symlink(path.join(temp, 'outside.txt'), path.join(app, 'outside-link.txt'));
  const server = createAppServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await fetch(base + '/')).status, 200);
    assert.match(
      (await fetch(base + '/data.json')).headers.get('content-type'),
      /application\/json/,
    );
    assert.equal((await fetch(base + '/..%2Foutside.txt')).status, 404);
    assert.equal((await fetch(base + '/outside-link.txt')).status, 404);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  } finally {
    await new Promise((r) => server.close(r));
    await fsp.rm(temp, { recursive: true, force: true });
  }
});
