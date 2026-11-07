'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createServer } = require('node:http');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
function createAppServer(root, { defaultDocument = 'index.html' } = {}) {
  const directory = path.resolve(root);
  return createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      const name =
        decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') ||
        defaultDocument;
      const target = path.resolve(directory, name),
        real = await fs.realpath(target),
        base = await fs.realpath(directory);
      if (!target.startsWith(directory + path.sep) || !real.startsWith(base + path.sep))
        throw Error('outside test root');
      const body = await fs.readFile(real);
      res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
}
module.exports = { createAppServer };
