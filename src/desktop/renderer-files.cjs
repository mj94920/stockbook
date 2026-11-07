const fs = require('node:fs');
const path = require('node:path');

// Stage app-owned static files together. Each launch has an isolated directory.
function prepareRendererFiles(appDir, tempDir) {
  const directory = fs.mkdtempSync(path.join(tempDir, 'stockbook-renderer-'));
  try {
    const copy = (name) => fs.cpSync(path.join(appDir, name), path.join(directory, name), {
      recursive: true,
      filter: source => {
        if (fs.lstatSync(source).isSymbolicLink()) throw new Error('Renderer symlinks are not supported');
        return true;
      },
    });
    copy('index.html');
    copy('icon-192.png');
    if (fs.existsSync(path.join(appDir, 'src'))) copy('src');
    const htmlPath = path.join(directory, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const [, reference] of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      if (/^(?:https?:|data:|\/\/)/i.test(reference)) continue;
      const relative = decodeURIComponent(reference.split(/[?#]/)[0]);
      const target = path.resolve(directory, relative);
      if (!target.startsWith(directory + path.sep) || !fs.statSync(target).isFile()) {
        throw new Error('Missing or invalid renderer script: ' + reference);
      }
    }
    return { directory, htmlPath };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { prepareRendererFiles };
