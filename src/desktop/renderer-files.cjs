const fs = require('node:fs');
const path = require('node:path');

// Inspect only markup, not resource-looking strings inside inline JavaScript/style blocks.
function rendererReferences(html) {
  const markup = html
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, '$1</script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  const references = [];
  for (const match of markup.matchAll(/<(script|link|img)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase(),
      attrs = match[2];
    if (tag === 'link') {
      const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] || '';
      if (
        !rel
          .toLowerCase()
          .split(/\s+/)
          .some((r) => r === 'stylesheet' || r === 'icon')
      )
        continue;
    }
    const attr = tag === 'link' ? 'href' : 'src',
      reference = new RegExp('\\b' + attr + '\\s*=\\s*["\']([^"\']+)["\']', 'i').exec(attrs)?.[1];
    if (reference && !/^(?:https?:|data:|\/\/)/i.test(reference)) references.push(reference);
  }
  return references;
}

// Stage app-owned static files together. Each launch has an isolated directory.
function prepareRendererFiles(appDir, tempDir) {
  const directory = fs.mkdtempSync(path.join(tempDir, 'stockbook-renderer-'));
  try {
    const copy = (name) =>
      fs.cpSync(path.join(appDir, name), path.join(directory, name), {
        recursive: true,
        filter: (source) => {
          if (fs.lstatSync(source).isSymbolicLink())
            throw new Error('Renderer symlinks are not supported');
          return true;
        },
      });
    copy('index.html');
    copy('icon-192.png');
    if (fs.existsSync(path.join(appDir, 'src'))) copy('src');
    const htmlPath = path.join(directory, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const reference of rendererReferences(html)) {
      const relative = decodeURIComponent(reference.split(/[?#]/)[0]);
      const target = path.resolve(directory, relative);
      if (
        !target.startsWith(directory + path.sep) ||
        !fs.statSync(target, { throwIfNoEntry: false })?.isFile()
      ) {
        throw new Error('Missing or invalid renderer asset: ' + reference);
      }
    }
    return { directory, htmlPath };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { prepareRendererFiles, rendererReferences };
