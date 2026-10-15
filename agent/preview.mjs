import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function createPreview({ indexPath = resolve(root, 'index.html'), port = 0, characterRoot = process.env.CHARACTER_PROJECT } = {}) {
  const html = await readFile(indexPath, 'utf8');
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/character-config.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ enabled: !!characterRoot,
          moduleUrl: '/character/desktop-pet/src/agent.js',
          sprites: Object.fromEntries([['neutral', 'arin_shy_dark_01.png'], ['curious', 'arin_notice_dark_01.png'], ['worried', 'arin_sleepy_dark_01.png']].map(([key, file]) => [key, '/character-assets/' + file])) }));
      }
      const modules = new Set(['desktop-pet/src/agent.js', 'shared/core/src/core/character-core.js',
        'shared/core/src/core/dummy-ai.js', 'shared/core/src/core/settings-store.js',
        'shared/core/src/protocol/agent-response.js', 'shared/core/src/protocol/character-profile.js',
        'shared/core/src/protocol/constants.js']);
      const sprites = new Set(['arin_shy_dark_01.png', 'arin_notice_dark_01.png', 'arin_sleepy_dark_01.png']);
      if (characterRoot && (pathname.startsWith('/character/') || pathname.startsWith('/character-assets/'))) {
        const asset = pathname.startsWith('/character-assets/');
        const name = pathname.slice(asset ? '/character-assets/'.length : '/character/'.length);
        if (!(asset ? sprites : modules).has(name)) { res.writeHead(404); return res.end(); }
        const filename = resolve(characterRoot, asset ? 'android-launcher/app/src/main/res/drawable-nodpi/' + name : name);
        const content = await readFile(filename);
        res.writeHead(200, { 'content-type': asset ? 'image/png' : 'text/javascript; charset=utf-8' });
        return res.end(content);
      }
      if (pathname === '/' || pathname === '/agent.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(html.replace('</body>', '<script src="/agent/adapter.js"></script><script src="/agent/panel.js"></script><script type="module" src="/agent/character.mjs"></script></body>'));
      }
      // Serve only this preview's assets; never expose repository files or credentials.
      if (!['/agent/adapter.js', '/agent/panel.js', '/agent/character.mjs', '/icon-192.png', '/icon-512.png', '/logo.svg'].includes(pathname)) {
        res.writeHead(404); return res.end();
      }
      const filename = resolve(root, '.' + pathname);
      if (relative(root, filename).startsWith('..')) throw new Error('Invalid path');
      const content = await readFile(filename);
      res.writeHead(200, { 'content-type': ({ '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(filename)] });
      res.end(content);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}/agent.html` };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { url } = await createPreview({ port: Number(process.env.PORT || 4173) });
  console.log(`Stockbook Agent: ${url}`);
}
