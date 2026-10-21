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
    const hasClass = (sel, cls) => page.evaluate(([s, c]) => !!document.querySelector(s)?.classList.contains(c), [sel, cls]);
    const step = async (name, fn) => { try { await fn(); } catch (e) { errors.push(`${name}: ${e.message}`); } await page.waitForTimeout(150); };

    await step('사이드바 메뉴', async () => {
      // 첫 화면 = 좌측 종목창 + 우측 종합 + 우측 하단 기존 포트폴리오
      const openPids = () => page.evaluate(() => [...document.querySelectorAll('.mdi-panel')]
        .filter(el => el.dataset.mdiState === 'open' && getComputedStyle(el).display !== 'none').map(el => el.dataset.pid));
      const first = await openPids();
      check(first.length === 2 && first.includes('watchlist') && first.includes('portfolio'), `첫 화면 종목창/하단 작업 패널 표시 오류: [${first}]`);
      const dbg = await page.evaluate(() => { const w = document.getElementById('mdiWorkspace'), c = document.getElementById('dockCtx'); return `ws=${getComputedStyle(w).display}/${w.dataset.dockScreen} ctx=${getComputedStyle(c).display} parent=${c.parentElement.id || c.parentElement.className}`; });
      check(await page.evaluate(() => ['watchlist', 'trading', 'portfolio', 'news', 'journal'].every(p => document.getElementById('mdi-panel-' + p)?.parentElement.id === 'mdiWorkspace')), '모든 중앙 화면 패널은 #mdiWorkspace 직속이어야 함 (HTML 닫힘 태그 불일치)');
      check(await page.evaluate(() => getComputedStyle(document.getElementById('dockCtx')).display !== 'none'), `관심종목 화면에 문맥 패널이 보이지 않음 (${dbg})`);
      check(await page.evaluate(() => [...document.querySelectorAll('.mdi-tb, .mdi-tb-btn')].every(el => !el.offsetParent)), '중앙 작업영역에 제목줄/창 버튼이 보임');
      for (const pid of ['portfolio', 'news', 'trading', 'journal', 'watchlist']) {
        check(await click(`.mdi-sb-btn[data-pid="${pid}"]`), `사이드바 버튼 없음: ${pid}`);
        await page.waitForTimeout(250);
        const open = await openPids();
        const expected = pid === 'watchlist' || pid === 'portfolio' ? ['watchlist', 'portfolio'] : ['journal','trading','news'].includes(pid) ? ['watchlist',pid] : [pid];
        check(open.length === expected.length && expected.every(p => open.includes(p)), `사이드바 '${pid}' 화면 구성 오류: [${open}]`);
        const inside = await page.evaluate(p => {
          const r = document.getElementById('mdi-panel-' + p)?.getBoundingClientRect();
          const ws = document.getElementById('mdiWorkspace').getBoundingClientRect();
          return !!r && r.width > 200 && r.height > 100 && r.left >= ws.left - 1 && r.right <= ws.right + 1;
        }, pid);
        check(inside, `'${pid}' 화면이 작업영역 안에 표시되지 않음`);
        check(await hasClass(`.mdi-sb-btn[data-pid="${pid}"]`, 'mdi-sb-btn-active'), `사이드바 '${pid}' 활성 표시 없음`);
      }
      const collapsed0 = await hasClass('#mdiSidebar', 'sb-collapsed');
      await click('#mdiSbToggle');
      check(await hasClass('#mdiSidebar', 'sb-collapsed') !== collapsed0, '사이드바 접기/펼치기 동작 안 함');
      await click('#mdiSbToggle');
      check(await hasClass('#mdiSidebar', 'sb-collapsed') === collapsed0, '사이드바 펼치기 복귀 실패');
    });

    await step('사용성 검토: 분류·추가·호가 기록·뉴스 탐색', async () => {
      const result = await page.evaluate(async () => {
        const backup = { wl:state.watchlist, groups:state.watchlistGroups, pf:state.portfolio,
          raw:_allStockRaw, group:window._wlActiveGroup, sel:window._dockSel, api:window.electronAPI, hogaCode:_hogaCurrentCode, ic:{..._ic} };
        const checks = {};
        try {
          state.watchlist = [{ticker:'005930',name:'삼성전자',group:'반도체',price:100,change:1,quoteAt:Date.now()},
            {ticker:'000660',name:'SK하이닉스',group:'전력',price:200,change:1,quoteAt:Date.now()}];
          state.watchlistGroups=[];state.portfolio=[];window._wlActiveGroup='전체';window._dockSel='005930';
          _allStockRaw={KOSPI:[{code:'000001',name:'추가 검증 종목',market:'KOSPI'}]};
          window._MDI.show('watchlist');renderWatchlist();
          checks.themeRecovery=document.getElementById('wlGroupBar').textContent.includes('반도체');
          checks.assignment=!!document.querySelector('#watchlistBody select[aria-label="삼성전자 테마"]');
          wlSetGroup('반도체');checks.groupFilter=document.querySelectorAll('#watchlistBody tr[data-watch-ticker]').length===1;
          window.electronAPI={...backup.api,saveState:async()=>true,fetchNaverStocks:async()=>({ok:true,data:[{code:'000002',name:'목록 조회 검증',market:'KOSDAQ'}]})};
          document.getElementById('sbWatchAdd').click();
          document.getElementById('sbWatchMarket').value='KOSDAQ';
          await document.getElementById('sbWatchCatalog').onclick({currentTarget:document.getElementById('sbWatchCatalog')});
          checks.catalogWithoutNavigation=_allStockRaw.KOSDAQ[0].code==='000002'&&document.getElementById('sbWatchAddDialog').open;
          document.getElementById('sbWatchAddSearch').value='추가 검증';
          document.getElementById('sbWatchAddSearch').dispatchEvent(new Event('input'));
          document.querySelector('#sbWatchAddResults button').click();
          checks.explicitAdd=state.watchlist.some(w=>w.ticker==='000001'&&w.group==='반도체');
          document.getElementById('wlSearchInput').value='이름만 검색';_wlOnInput();
          checks.filterDoesNotAdd=state.watchlist.length===3;
          document.getElementById('wlSearchInput').value='';window._wlActiveGroup='전체';renderWatchlist();
          sbDesktopAction('trade');
          const visible=id=>document.getElementById(id)?.checkVisibility();
          checks.compactTrade=visible('mdi-panel-trading')&&visible('mdi-panel-watchlist')&&visible('dockCtx');
          document.getElementById('qo_price').value='100';document.getElementById('qo_qty').value='2';
          dockSelectStock('000660');
          checks.newStockClearsPrice=document.getElementById('qo_stock_code').value==='000660'&&document.getElementById('qo_price').value!=='100';
          _renderHogaTable([{price:201,askVol:12,bidVol:0,isCur:false},{price:199,askVol:0,bidVol:15,isCur:false}]);
          document.querySelector('#qo_hoga_body tr').click();
          checks.quoteToPrice=document.getElementById('qo_price').value==='201';
          _renderSimulatedHoga(200);checks.noSyntheticHoga=!document.querySelector('#qo_hoga_body tr[onclick]')&&document.getElementById('qo_hoga_body').textContent.includes('호가 미수신');
          checks.noDuplicateMenu=!document.querySelector('.mdi-sidebar [data-pid="portfolio"]').checkVisibility()&&!document.querySelector('.mdi-sidebar [data-pid="trading"]').checkVisibility();
          const requests=[];
          window.electronAPI={...backup.api,saveState:async()=>true,fetchHoga:async()=>({asks:[{price:202,qty:10}],bids:[{price:198,qty:10}]}),fetchNews:async opts=>{requests.push(opts);return {ok:true,items:[
            {id:'article-a',code:opts.code,title:'다른 기사',source:'검증 출처',summary:'첫 요약',time:'2026-10-21T09:00:00'},
            {id:'article-b',code:opts.code,title:'찾을 기사',source:'검증 출처',summary:'내용 검색어',time:'2026-10-21T08:00:00'}]};}};
          await sbDesktopHoga();document.querySelector('#sbHogaRows tr').click();
          checks.receivedHogaToTrade=document.getElementById('qo_price').value==='202'&&document.getElementById('mdiWorkspace').dataset.dockScreen==='trading';
          const fetchHoga=window.electronAPI.fetchHoga;let resolveOldHoga;
          window.electronAPI.fetchHoga=code=>code==='005930'?new Promise(resolve=>{resolveOldHoga=resolve;}):fetchHoga(code);
          connectToHoga('005930','삼성전자');connectToHoga('000660','SK하이닉스');
          resolveOldHoga({asks:[{price:999,qty:10}],bids:[{price:998,qty:10}]});await new Promise(resolve=>setTimeout(resolve,0));
          checks.noStaleHoga=!document.getElementById('qo_hoga_body').textContent.includes('999');
          window.electronAPI.fetchHoga=fetchHoga;
          window._MDI.show('news');document.getElementById('icStockSearch').value='005930';icPickStock();await icRefresh();
          checks.newsLocalSelection=requests.some(r=>r.kind==='stock'&&r.code==='005930')&&document.getElementById('mdiWorkspace').dataset.dockScreen==='news';
          document.getElementById('icArticleSearch').value='내용 검색어';_icRenderList();
          checks.articleFilter=document.querySelectorAll('#icList .ic-row').length===1;
          document.querySelector('#icList .ic-row').click();
          checks.filteredDetail=document.getElementById('icDetail').textContent.includes('찾을 기사');
          checks.newsUsesHeight=document.querySelector('.ic-wrap').getBoundingClientRect().height>450;
          openSettings('general');
          checks.noEmptySettings=!document.querySelector('#settingsNav [data-cat="advanced"]').checkVisibility();
          checks.compactSettings=document.querySelector('#settingsModal .sb-modal').getBoundingClientRect().height<550;
          const sidebar=document.getElementById('mdiSidebar').getBoundingClientRect();
          checks.modalCoversSidebar=!document.elementFromPoint(sidebar.x+10,sidebar.y+80)?.closest('#mdiSidebar');
          closeSettings();
          return checks;
        } finally {
          document.getElementById('sbWatchAddDialog')?.remove();closeSettings();
          state.watchlist=backup.wl;state.watchlistGroups=backup.groups;state.portfolio=backup.pf;
          _allStockRaw=backup.raw;window._wlActiveGroup=backup.group;window._dockSel=backup.sel;window.electronAPI=backup.api;
          _stopHogaAutoRefresh();_hogaCurrentCode=backup.hogaCode;
          Object.assign(_ic,backup.ic);document.getElementById('icArticleSearch').value='';
          window._MDI.show('watchlist');
        }
      });
      for (const [name, passed] of Object.entries(result)) check(passed, `사용성 회귀: ${name}`);
    });

    await step('데스크톱 새 셸과 기존 작업 연결', async () => {
      const result = await page.evaluate(() => {
        const bak = { wl: state.watchlist, pf: state.portfolio, sel: window._dockSel, journal: document.getElementById('j_name').value };
        try {
          state.watchlist = [{ ticker:'005930', name:'삼성전자', price:100, change:1, quoteAt:Date.now() }];
          state.portfolio = [{ ticker:'005930', name:'삼성전자', qty:1, avgPrice:90, currentPrice:100, target1:120, stop1:80 }];
          window._dockSel = '005930';
          window._MDI.show('watchlist');
          const rail = document.getElementById('mdiSidebar').getBoundingClientRect().width <= 64;
          const header = document.querySelector('.header').getBoundingClientRect().height <= 70;
          const actions = document.querySelector('.sb-work-toolbar .sb-btn--primary')?.textContent.includes('거래 등록');
          const columns = document.getElementById('sbQuoteColumns');
          columns.click(); const full = !document.getElementById('watchlistBody').classList.contains('sb-compact-quotes');
          columns.click(); const compact = document.getElementById('watchlistBody').classList.contains('sb-compact-quotes');
          const targets = document.getElementById('sbDesktopTargets').textContent.includes('120 / 80');
          window._MDIPanelTab('portfolio','cash'); sbDesktopCash();
          const cash = document.getElementById('sbDesktopCashBalance').textContent === fmt(getCashBalance()) + '원';
          window._MDIPanelTab('portfolio','pf');
          document.getElementById('j_name').value = '미완성 일지';
          sbDesktopAction('journal');
          const draft = document.getElementById('j_name').value === '미완성 일지' && document.getElementById('mdiWorkspace').dataset.dockScreen === 'journal';
          const left = document.getElementById('mdi-panel-watchlist').getBoundingClientRect();
          const journal = document.getElementById('mdi-panel-journal').getBoundingClientRect();
          const journalLayout = left.height > journal.height && journal.x >= left.right;
          sbDesktopAction('trade');
          const trade = document.getElementById('mdiWorkspace').dataset.dockScreen === 'trading' && document.getElementById('qo_stock_code').value === '005930';
          return { rail, header, actions:!!actions, full, compact, targets, cash, draft, journalLayout, trade };
        } finally {
          state.watchlist=bak.wl; state.portfolio=bak.pf; window._dockSel=bak.sel;
          document.getElementById('j_name').value=bak.journal;
          window._MDI.show('watchlist');
        }
      });
      for (const [name, passed] of Object.entries(result)) check(passed, `새 데스크톱 셸 회귀: ${name}`);
    });

    await step('동시 분석 영역과 실제 호가 상태', async () => {
      const result = await page.evaluate(async () => {
        const backup={wl:state.watchlist,sel:window._dockSel,api:window.electronAPI};
        try {
          state.watchlist=[{ticker:'005930',name:'삼성전자',price:100,change:1,quoteAt:Date.now()},{ticker:'000660',name:'SK하이닉스',price:200,change:2,quoteAt:Date.now()}];
          window._dockSel='005930';window._MDI.show('watchlist');
          window.electronAPI=undefined;await sbDesktopHoga();
          const disconnected=document.getElementById('sbHogaRows').children.length===0 && document.getElementById('sbHogaStatus').textContent.includes('연결 필요');
          window.electronAPI={fetchHoga:async()=>({asks:[{price:101,qty:0}],bids:[{price:99,qty:2}]})};
          await sbDesktopHoga();
          const book=document.getElementById('sbHogaRows');const real=book.children.length===2 && book.textContent.includes('101') && book.textContent.includes('99');
          let resolve;window.electronAPI.fetchHoga=()=>new Promise(r=>resolve=r);
          const pending=sbDesktopHoga();dockSelectStock('000660');resolve({asks:[{price:101,qty:1}],bids:[{price:99,qty:1}]});await pending;
          const stale=book.children.length===0 && document.getElementById('sbHogaStatus').textContent.includes('조회 대기');
          window.electronAPI.fetchHoga=async()=>{throw new Error('offline')};await sbDesktopHoga();
          const failure=book.children.length===0 && document.getElementById('sbHogaStatus').textContent.includes('조회 실패');
          const checks=[];
          for (const screen of ['watchlist','portfolio','journal']) {
            window._MDI.show(screen);
            const region=document.getElementById('sbAnalysis'),r=region.getBoundingClientRect();
            checks.push(r.width>100 && r.height>100 && r.right<=innerWidth && getComputedStyle(region).display!=='none' && region.textContent.includes('AI 분석') && region.textContent.includes('규칙 신호'));
          }
          document.getElementById('sbAiCheck').open=true;document.getElementById('sbSignalCheck').open=true;
          const flow=document.getElementById('sbAiCheck').textContent.includes('생성 시각') && document.getElementById('sbSignalCheck').textContent.includes('시계열 데이터');
          document.getElementById('sbAiCheck').open=false;document.getElementById('sbSignalCheck').open=false;
          return {disconnected,real,stale,failure,simultaneous:checks.every(Boolean),flow};
        } finally {state.watchlist=backup.wl;window._dockSel=backup.sel;window.electronAPI=backup.api;window._MDI.show('watchlist');}
      });
      for(const [key,value] of Object.entries(result)) check(value, `분석/호가 동시 화면 회귀: ${key}`);
    });

    await step('문맥 패널 보유 합산', async () => {
      // PR #42 리뷰 재현: 관심종목 시세가 없으면 보유 현재가(currentPrice)를 쓰고, 여러 계좌의 같은 종목을 합산해야 한다
      const res = await page.evaluate(() => {
        const bak = { wl: state.watchlist, pf: state.portfolio, sel: window._dockSel };
        try {
          state.watchlist = [{ ticker: '005930', name: '삼성전자', price: null, change: null }];
          state.portfolio = [
            { ticker: '005930', name: '삼성전자', qty: 10, avgPrice: 100, currentPrice: 120, accountId: 'a' },
            { ticker: '005930', name: '삼성전자', qty: 5,  avgPrice: 130, currentPrice: 120, accountId: 'b' },
          ];
          window._dockSel = '005930';
          dockCtxRender();
          return document.getElementById('dockCtxHold')?.textContent || '';
        } finally {
          state.watchlist = bak.wl; state.portfolio = bak.pf; window._dockSel = bak.sel;
          try { dockCtxRender(); } catch (_) {}
        }
      });
      // 수량 15주, 평단 (1000+650)/15=110, 평가손익 1800-1650=+150
      check(res.includes('15주'), `문맥 패널이 복수 계좌 보유를 합산하지 않음: "${res}"`);
      check(res.includes('110'), `문맥 패널 합산 평균단가 오류: "${res}"`);
      check(res.includes('+150'), `문맥 패널이 보유 현재가(currentPrice)를 쓰지 않음: "${res}"`);
    });

    await step('관심종목 실데이터·선택·구독', async () => {
      const result = await page.evaluate(async () => {
        const bak = { wl: state.watchlist, pf: state.portfolio, accounts: state.accounts, sel: window._dockSel, api: window.electronAPI, priority: localStorage.getItem(RT_PRIO_KEY) };
        const input = document.getElementById('wlSearchInput');
        const search = input.value;
        try {
          localStorage.removeItem(RT_PRIO_KEY);
          input.value = '';
          state.accounts = [{ id: 'a', nickname: '<계좌 A>' }, { id: 'b', nickname: '계좌 B' }];
          state.portfolio = [
            { ticker: '005930', qty: 10, avgPrice: 100, currentPrice: 120, accountId: 'a' },
            { ticker: '005930', qty: 5, avgPrice: 130, currentPrice: 120, accountId: 'b' },
          ];
          state.watchlist = Array.from({ length: 80 }, (_, i) => ({ ticker: String(100001 + i), name: `종목 ${i}`, quoteAt: Date.now() }));
          window._dockSel = state.watchlist[0].ticker;
          renderWatchlist();
          const first = document.querySelector('#watchlistBody [data-watch-ticker]');
          first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
          const keyboard = window._dockSel === '100002';
          dockSelectStock('100080');
          const visible = dockVisibleWatchTickers();
          const tickers = buildRtTickers();
          const subscription = tickers[0] === '005930' && tickers[1] === '100080' && tickers.length <= 40 && new Set(tickers).size === tickers.length && tickers.every(t => ['005930', '100080'].includes(t) || visible.includes(t));
          handleRealtimePrice({ ticker: '100080', price: 150, change: 5, changePct: 3.45 });
          dockCtxRender();
          const realtime = state.watchlist[79].price === 150 && document.getElementById('dockCtxPrice').textContent === '150';
          state.watchlist = [{ ticker: '005930', name: '삼성전자', price: null }];
          window._dockSel = '005930';
          window.electronAPI = undefined;
          await dockLoadQuote(state.watchlist[0]);
          const offline = document.getElementById('dockCtxStatus').textContent.includes('연결 필요') && state.watchlist[0].price === null;
          window.electronAPI = { fetchQuote: async () => ({ price: 140, prevClose: 120, openPrice: 125, highPrice: 145, lowPrice: 120, volume: 0, high52: 160, low52: 80, source: 'KIS' }) };
          await dockLoadQuote(state.watchlist[0]);
          renderWatchlist();
          const quote = document.getElementById('dockCtxQuote').textContent;
          const hold = document.getElementById('dockCtxHold');
          const snapshot = quote.includes('145') && quote.includes('160') && state.watchlist[0].volume === 0 && document.getElementById('dockCtxStatus').textContent.includes('KIS');
          const accounts = hold.textContent.includes('15주') && hold.textContent.includes('+450') && hold.textContent.includes('<계좌 A>') && hold.querySelector('details') && !hold.querySelector('계좌');
          state.watchlist.push({ ticker: '100001', name: '미보유 종목', price: 50, quoteAt: Date.now() });
          window._dockSel = '100001';
          dockCtxAction('hoga');
          const hoga = document.getElementById('mdiWorkspace').dataset.dockScreen === 'trading' && document.getElementById('qo_stock_code').value === '100001' && document.getElementById('qo_cur_price').textContent.includes('50');
          window._MDI.show('watchlist');
          window._dockSel = '005930';
          let resolve;
          window.electronAPI.fetchQuote = () => new Promise(r => { resolve = r; });
          const pending = dockLoadQuote(state.watchlist[0]);
          handleRealtimePrice({ ticker: '005930', price: 155, change: 35, changePct: 29.17 });
          resolve({ price: 130, source: 'KIS', openPrice: 125 });
          await pending;
          const stale = state.watchlist[0].price === 155 && state.portfolio.every(p => p.currentPrice === 155);
          window.electronAPI.fetchQuote = async () => { throw new Error('offline'); };
          await dockLoadQuote(state.watchlist[0]);
          const failed = state.watchlist[0].quoteStatus.includes('조회 실패') && state.watchlist[0].price === 155;
          return { keyboard, subscription, realtime, offline, snapshot, accounts: !!accounts, hoga, stale, failed };
        } finally {
          state.watchlist = bak.wl; state.portfolio = bak.pf; state.accounts = bak.accounts; window._dockSel = bak.sel; window.electronAPI = bak.api;
          if (bak.priority == null) localStorage.removeItem(RT_PRIO_KEY); else localStorage.setItem(RT_PRIO_KEY, bak.priority);
          input.value = search;
          renderWatchlist();
        }
      });
      for (const [name, ok] of Object.entries(result)) check(ok, `관심종목 회귀 실패: ${name}`);
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
        await page.waitForTimeout(300);
        await page.evaluate(() => window._MDI.show('watchlist'));
        const layout = await page.evaluate(() => {
          const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; };
          return { left:rect('mdi-panel-watchlist'),ctx:rect('dockCtx'),work:rect('mdi-panel-portfolio'),analysis:rect('sbAnalysis'),workspace:rect('mdiWorkspace'),header:document.querySelector('.header').getBoundingClientRect().bottom };
        });
        check(Math.abs(layout.left.width / (layout.left.width + layout.ctx.width) - .4) < .02, `${vp.width}px: 좌우 40:60 비율 오류`);
        check(layout.work.y >= layout.ctx.bottom && Math.abs(layout.work.x-layout.ctx.x) < 2 && layout.analysis.x >= layout.work.right && Math.abs(layout.analysis.right-layout.ctx.right) < 2 && Math.abs(layout.analysis.y-layout.work.y) < 2, `${vp.width}px: 하단 작업 패널이 우측 종합 패널 아래에 정렬되지 않음`);
        check(Math.abs(layout.left.bottom-layout.work.bottom)<2 && layout.left.y >= layout.workspace.y, `${vp.width}px: 좌측 종목창 전체 높이 오류`);
        check(layout.workspace.y >= layout.header-1 && layout.work.bottom <= vp.height+1, `${vp.width}px: 상단 겹침 또는 하단 잘림`);
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

