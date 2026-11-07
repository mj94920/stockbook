'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { embedRenderer } = require('../docs/design/lib/embed-renderer.cjs');
test('offline preview embedding follows every current JS/CSS reference without editing inline script strings', () => {
  const root = path.resolve(__dirname, '..');
  for (const file of ['index.html', 'chart.html']) {
    const html = embedRenderer(fs.readFileSync(path.join(root, file), 'utf8'), root);
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=["']src\//i);
    assert.doesNotMatch(html, /<link\b[^>]*\bhref=["']src\/[^"']+\.css/i);
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
      if (!/\bsrc=/.test(match[1])) assert.doesNotThrow(() => new vm.Script(match[2]));
  }
  const html = '<script>const example="<link rel=\"stylesheet\" href=\"missing.css\">";</script>';
  assert.equal(embedRenderer(html, root), html);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-preview-assets-'));
  try {
    const app = path.join(temp, 'app');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(temp, 'outside.js'), 'outside');
    assert.throws(
      () => embedRenderer('<script src="../outside.js"></script>', app),
      /outside app directory/,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
