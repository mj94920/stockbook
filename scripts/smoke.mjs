#!/usr/bin/env node
// StockBook 스모크 테스트: 실제 브라우저(Chromium)로 index.html 을 띄워
// 초기화 중 발생하는 치명적 JS 오류(null 참조, TDZ, 미정의 함수 등)를 잡는다.
// 외부 네트워크는 전부 차단 → 시세 API 장애와 무관하게 결정적으로 동작.
// 실행: npm run smoke
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const PAGES = [
  { path: '/index.html',  viewport: { width: 1400, height: 900 } },
];
const SETTLE_MS = Number(process.env.SMOKE_SETTLE_MS ?? 4000);
const SHOT_DIR  = process.env.SMOKE_SHOT_DIR ?? 'smoke-shots';   // UI 확인용 스크린샷 (CI 아티팩트로 업로드)
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

  // 다크/라이트 스크린샷 (실패해도 테스트 결과에는 영향 없음)
  try {
    await mkdir(SHOT_DIR, { recursive: true });
    const name = pg.path.replace(/^\//, '').replace(/\.html$/, '');
    await page.evaluate(() => document.body.classList.remove('light-mode'));
    await page.screenshot({ path: `${SHOT_DIR}/${name}-dark.png` });
    await page.evaluate(() => document.body.classList.add('light-mode'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}/${name}-light.png` });
  } catch (e) { console.warn(`  (스크린샷 생략: ${e.message})`); }

  // ── 1차 개편 회귀: 사이드바·설정 허브·공통 모달·시장 일정 센터·테마 전환 (PC 화면 전용) ──
  if (pg.path === '/index.html') {
    const check = (cond, msg) => { if (!cond) errors.push(msg); };
    const click = sel => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);
    const mdiState = pid => page.evaluate(p => document.getElementById('mdi-panel-' + p)?.dataset.mdiState ?? null, pid);
    const hasClass = (sel, cls) => page.evaluate(([s, c]) => !!document.querySelector(s)?.classList.contains(c), [sel, cls]);
    const step = async (name, fn) => { try { await fn(); } catch (e) { errors.push(`${name}: ${e.message}`); } await page.waitForTimeout(150); };

    await step('사이드바 메뉴', async () => {
      for (const pid of ['watchlist', 'portfolio', 'news', 'trading', 'journal']) {
        const before = await mdiState(pid);
        check(await click(`.mdi-sb-btn[data-pid="${pid}"]`), `사이드바 버튼 없음: ${pid}`);
        await page.waitForTimeout(250);
        const after = await mdiState(pid);
        check(before !== null && after !== null && before !== after, `사이드바 '${pid}' 클릭 후 data-mdi-state 불변 (${before}→${after})`);
        await click(`.mdi-sb-btn[data-pid="${pid}"]`);   // 원상 복구
        await page.waitForTimeout(250);
      }
      const collapsed0 = await hasClass('#mdiSidebar', 'sb-collapsed');
      await click('#mdiSbToggle');
      check(await hasClass('#mdiSidebar', 'sb-collapsed') !== collapsed0, '사이드바 접기/펼치기 동작 안 함');
      await click('#mdiSbToggle');
      check(await hasClass('#mdiSidebar', 'sb-collapsed') === collapsed0, '사이드바 펼치기 복귀 실패');
    });

    await step('설정 허브', async () => {
      await page.evaluate(() => openSettings());
      check(await hasClass('#settingsModal', 'open'), '설정 허브가 열리지 않음');
      const cats = await page.evaluate(() => [...document.querySelectorAll('#settingsNav .sb-hub__nav-btn')].map(b => b.dataset.cat));
      check(cats.length >= 10, `설정 카테고리 ${cats.length}개 (10개 이상 기대)`);
      for (const cat of cats) {
        await page.evaluate(c => settingsGo(c), cat);
        const ok = await page.evaluate(c => !!document.querySelector(`#settingsModal .sb-hub__page[data-page="${c}"]`)?.classList.contains('active'), cat);
        check(ok, `설정 카테고리 전환 실패: ${cat}`);
      }
      await page.evaluate(() => closeSettings());
      check(!(await hasClass('#settingsModal', 'open')), '설정 허브가 닫히지 않음');
    });

    await step('공통 모달', async () => {
      for (const [open, close, id] of [['openTotalAssetModal', 'closeTotalAssetModal', 'totalAssetModal'],
                                       ['openCashManualModal', 'closeCashManualModal', 'cashManualModal']]) {
        const exists = await page.evaluate(([o, c, i]) => typeof window[o] === 'function' && typeof window[c] === 'function' && !!document.getElementById(i), [open, close, id]);
        if (!exists) { errors.push(`공통 모달 함수/요소 없음: ${open}`); continue; }
        await page.evaluate(o => window[o](), open);
        check(await hasClass('#' + id, 'open'), `${id} 열림 실패`);
        await page.evaluate(c => window[c](), close);
        check(!(await hasClass('#' + id, 'open')), `${id} 닫힘 실패`);
      }
    });

    await step('시장 일정 센터', async () => {
      await page.evaluate(() => openCalendarPanel());
      check(await hasClass('#calPanel', 'open'), '시장 일정 센터가 열리지 않음');
      await page.evaluate(() => switchCalTab('eco'));
      check(await page.evaluate(() => getComputedStyle(document.getElementById('calTabEco')).display !== 'none'), '경제지표 탭 전환 실패');
      await page.evaluate(() => switchCalTab('corp'));
      check(await page.evaluate(() => getComputedStyle(document.getElementById('calTabCorp')).display !== 'none'), '기업 이벤트 탭 전환 실패');
      await page.evaluate(() => closeCalendarPanel());
      check(!(await hasClass('#calPanel', 'open')), '시장 일정 센터가 닫히지 않음');
    });

    await step('테마 전환', async () => {
      await page.evaluate(() => setTheme('dark'));
      await page.evaluate(() => toggleTheme());
      await page.waitForTimeout(200);
      await page.evaluate(() => toggleTheme());
      await page.waitForTimeout(200);
    });

    // 주요 창 크기 스크린샷 (다크/라이트)
    try {
      await mkdir(SHOT_DIR, { recursive: true });
      for (const vp of [{ width: 1400, height: 900 }, { width: 1024, height: 768 }]) {
        await page.setViewportSize(vp);
        for (const mode of ['dark', 'light']) {
          await page.evaluate(m => setTheme(m), mode);
          await page.waitForTimeout(300);
          await page.screenshot({ path: `${SHOT_DIR}/index-${vp.width}x${vp.height}-${mode}.png` });
        }
      }
    } catch (e) { console.warn(`  (뷰포트 스크린샷 생략: ${e.message})`); }
    await page.waitForTimeout(300);
  }

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
