#!/usr/bin/env node
// StockBook 스모크 테스트: 실제 브라우저(Chromium)로 index.html · mobile.html 을 띄워
// 초기화 중 발생하는 치명적 JS 오류(null 참조, TDZ, 미정의 함수 등)를 잡는다.
// 외부 네트워크는 전부 차단 → 시세 API 장애와 무관하게 결정적으로 동작.
// 실행: npm run smoke
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const PAGES = [
  { path: '/index.html',  viewport: { width: 1400, height: 900 } },
  { path: '/mobile.html', viewport: { width: 390,  height: 844 } },
];
const SETTLE_MS = Number(process.env.SMOKE_SETTLE_MS ?? 4000);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
               '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const root = process.cwd();
const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const body = await readFile(join(root, p || 'index.html'));
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
let failed = 0;

for (const pg of PAGES) {
  const ctx  = await browser.newContext({ viewport: pg.viewport, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];

  // 외부 요청 차단 (로컬 정적 파일만 허용)
  await page.route('**/*', route =>
    route.request().url().startsWith(base) ? route.continue() : route.abort());

  page.on('pageerror', e => errors.push(e.stack || e.message));
  page.on('dialog', d => d.dismiss());

  const resp = await page.goto(base + pg.path, { waitUntil: 'load' });
  if (!resp?.ok()) errors.push(`HTTP ${resp?.status()}`);
  await page.waitForTimeout(SETTLE_MS);

  // 기본 렌더링 확인: body 에 실제 내용이 그려졌는지
  const textLen = await page.evaluate(() => document.body?.innerText.trim().length ?? 0);
  if (textLen < 20) errors.push(`body 텍스트가 비어 있음 (${textLen}자) — 렌더링 실패 의심`);

  if (errors.length) {
    failed++;
    console.error(`✗ ${pg.path}`);
    for (const e of errors) console.error('    ' + e.split('\n').slice(0, 4).join('\n    '));
  } else {
    console.log(`✓ ${pg.path}  (본문 ${textLen}자, 초기화 오류 없음)`);
  }
  await ctx.close();
}

await browser.close();
server.close();
if (failed) { console.error(`\n스모크 테스트 ${failed}건 실패`); process.exit(1); }
console.log('\n스모크 테스트 통과');
