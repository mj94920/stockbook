const {test}=require('node:test');const assert=require('node:assert/strict');
const {createServer}=require('node:http');const fs=require('node:fs/promises');const path=require('node:path');const {chromium}=require('playwright');
const {newsItems}=require('../src/news/list.cjs');
test('reader renders safe text, keeps source link and discards stale article; chart controls keep context',async()=>{
 const root=path.resolve(__dirname,'..');const server=createServer(async(req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/, '')||'index.html';const target=path.resolve(root,rel);if(!target.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',target.endsWith('.html')?'text/html; charset=utf-8':target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'application/octet-stream');res.end(await fs.readFile(target));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base+'/index.html');
  await page.evaluate(()=>{
   window.__chartContexts=[];window.__chartWindows=[];
   window.electronAPI={setChartContext:async value=>{window.__chartContexts.push(value);return {ok:true};},openChartWindow:async value=>{window.__chartWindows.push(value);return {ok:true};},fetchNewsArticle:url=>url.endsWith('111111')?new Promise(resolve=>window.__resolveOld=resolve):Promise.resolve({ok:true,body:'새 본문\n<img src=x onerror="window.UNSAFE=true">'})};
   state.watchlist=[{ticker:'005930',name:'검증 종목',price:100,change:1,quoteAt:Date.now()}];window._dockSel='005930';window._MDI.show('news');
   _ic.tab='stock';_ic.items=[{id:'old',title:'이전 기사',url:'https://n.news.naver.com/mnews/article/001/111111',summary:'이전 요약'},{id:'new',title:'새 기사',url:'https://n.news.naver.com/mnews/article/001/222222',summary:'새 요약'}];_ic.loading=false;_ic.err='';_icRenderList();
   window.__pendingArticle=icSelect(0);
  });
  await page.evaluate(()=>icSelect(1));
  assert.match(await page.locator('.ic-article-body').innerText(),/새 본문/);assert.equal(await page.locator('.ic-article-body img').count(),0);assert.equal(await page.evaluate(()=>window.UNSAFE),undefined);
  assert.equal(await page.getByRole('button',{name:'원문 보기 ↗',exact:true}).count(),1);
  await page.evaluate(async()=>{window.__resolveOld({ok:true,body:'늦게 도착한 이전 본문'});await window.__pendingArticle;});assert.doesNotMatch(await page.locator('#icDetail').innerText(),/늦게 도착/);
  await page.evaluate(async()=>{window.electronAPI.fetchNewsArticle=async()=>({ok:false});_ic.items.push({id:'failed',title:'수신 실패',url:'https://n.news.naver.com/mnews/article/001/333333',summary:'제공된 요약'});await icSelect(2);});
  assert.match(await page.locator('#icDetail').innerText(),/수신 요약/);assert.match(await page.locator('#icDetail').innerText(),/제공된 요약/);
  await page.evaluate(async()=>{
   window.electronAPI.fetchNewsArticle=async()=>({ok:true,body:' \n '});await icSelect(2);
  });
  assert.equal(await page.locator('.ic-article-body').count(),0);
  assert.match(await page.locator('#icDetail').innerText(),/수신 요약/);
  await page.evaluate(async()=>{
   _ic.items=[{id:'long',title:'긴 기사',source:'검증 언론',time:'2026-10-23T11:40:00+09:00',url:'https://n.news.naver.com/mnews/article/001/444444'},
    {id:'short',title:'다음 기사',url:'https://n.news.naver.com/mnews/article/001/555555'},
    {id:'stale-stock',title:'이전 종목 기사',url:'https://n.news.naver.com/mnews/article/001/666666'}];
   window.electronAPI.fetchNewsArticle=url=>url.endsWith('666666')?new Promise(resolve=>window.__resolveOldStock=resolve):Promise.resolve({ok:true,body:url.endsWith('444444')?Array.from({length:250},(_,i)=>`합성 본문 ${i+1}: 긴 기사의 스크롤 검증 문단입니다.`).join('\n\n'):'다음 기사 본문'});
   await icSelect(0);
  });
  assert.match(await page.locator('#icDetail').innerText(),/검증 언론/);
  assert.equal(await page.locator('#icDetail').evaluate(el=>{el.scrollTop=el.scrollHeight;return el.clientHeight>100&&el.scrollHeight>el.clientHeight&&el.scrollTop>0;}),true);
  await page.evaluate(()=>icSelect(1));assert.equal(await page.locator('#icDetail').evaluate(el=>el.scrollTop),0);
  await page.evaluate(()=>{
   window.__oldStockArticle=icSelect(2);
   window.electronAPI.fetchNews=async()=>({ok:true,items:[{id:'new-stock',title:'새 종목 기사',source:'다른 언론',url:'https://n.news.naver.com/mnews/article/001/777777'}]});
   icSelectStock('000660');
  });
  await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.id==='new-stock');
  await page.evaluate(async()=>{window.__resolveOldStock({ok:true,body:'늦은 이전 종목 본문'});await window.__oldStockArticle;});
  assert.doesNotMatch(await page.locator('#icDetail').innerText(),/늦은 이전 종목 본문/);
  for(const tab of ['econ','disclosure']){
   await page.evaluate(()=>{_ic.tab='stock';window.electronAPI.fetchNews=()=>new Promise(resolve=>window.__resolveList=resolve);window.__pendingList=icRefresh();});
   assert.equal(await page.locator('#icRefreshBtn').isDisabled(),true);
   await page.evaluate(tab=>icSetTab(tab),tab);assert.equal(await page.locator('#icRefreshBtn').isDisabled(),false);
   await page.evaluate(async()=>{window.__resolveList({ok:true,items:[{id:'late-list',title:'늦은 이전 목록'}]});await window.__pendingList;});
   assert.doesNotMatch(await page.locator('#icList').innerText(),/늦은 이전 목록/);
  }
  await page.evaluate(async()=>{_ic.tab='market';window.electronAPI.fetchNews=async()=>{throw Error('목록 수신 실패');};await icRefresh();});
  assert.match(await page.locator('#icList').innerText(),/목록 수신 실패/);assert.equal(await page.locator('#icRefreshBtn').isDisabled(),false);
  const receivedMarket=newsItems(require('./fixtures/news/market-20261023.json'));
  await page.evaluate(async items=>{_ic.tab='market';window.electronAPI.fetchNews=async()=>({ok:true,items});window.electronAPI.fetchNewsArticle=async()=>({ok:false});await icRefresh();await icSelect(0);},receivedMarket);
  assert.equal(await page.locator('#icList .ic-row').count(),3);assert.match(await page.locator('#icDetail').innerText(),/더팩트/);
  assert.match(await page.locator('#icDetail').innerText(),/수신 요약/);
  if(process.env.STOCKBOOK_CAPTURE_NEWS==='1')await page.screenshot({path:path.join(root,'docs/design/news-chart-workspace/news.png'),fullPage:true});
  await page.evaluate(()=>window._MDI.show('watchlist'));
  await page.locator('[data-context-tab="hoga"]').click();assert.equal(await page.locator('[data-context-pane="hoga"]').isVisible(),true);assert.equal(await page.locator('[data-context-pane="chart"]').isVisible(),false);
  await page.locator('[data-context-tab="info"]').click();assert.equal(await page.locator('#dockCtxQuote').isVisible(),true);
  await page.locator('[data-context-tab="chart"]').click();await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.count===1000);
  assert.match(await page.locator('#sbEmbeddedChart').innerText(),/보존 자료/);
  assert.equal(await page.locator('#sbEmbeddedChart .ma').count(),4);
  assert.equal(await page.locator('#sbEmbeddedChart .candle').count(),132);
  await page.locator('#sbChartPeriod').selectOption('3m');
  await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.displayed===66);await page.locator('#sbChartDetail').click();
  assert.deepEqual(await page.evaluate(()=>window.__chartWindows.at(-1)),{code:'005930',name:'검증 종목',period:'3m'});assert.deepEqual(errors,[]);
  await page.evaluate(()=>{state.watchlist=[];window._dockSel=null;dockCtxRender();});assert.equal(await page.locator('#sbEmbeddedChart .candle').count(),0);
  await page.addInitScript(()=>{window.stockBookChart={onContext:fn=>{window.__chartContext=fn;},setFollow:async value=>{window.__follow=value;return {ok:true};}};});
  await page.goto(base+'/chart.html');
  await page.evaluate(()=>window.__chartContext({code:'005930',name:'검증 종목',period:'3m',follow:true}));
  assert.match(await page.locator('#chartName').innerText(),/검증 종목/);assert.equal(await page.locator('#chartPeriod').innerText(),'3개월');
  await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.displayed===66);
  assert.equal(await page.locator('#chartViewport .ma').count(),8);
  assert.equal(await page.locator('#chartViewport .investor-line').count(),3);
  assert.equal(await page.locator('#chartViewport .investor-point').count(),15);
  assert.equal(await page.locator('#chartViewport .sb-proof-money').getAttribute('open'),null);
  const evidence=await page.locator('#chartViewport').evaluate(host=>host.chartEvidence);
  assert.equal(evidence.investors.totals.foreign,-1275121);assert.equal(evidence.investors.totals.institution,-1546172);assert.equal(evidence.investors.totals.individual,2316914);
  assert.equal(evidence.bbShift,25);
  await page.locator('#chartFollow').selectOption('pin');assert.equal(await page.evaluate(()=>window.__follow),false);
  await page.evaluate(()=>window.__chartContext({code:'005930',name:'검증 종목',period:'3m',follow:false}));assert.match(await page.locator('#chartStatus').innerText(),/고정/);
  await page.evaluate(()=>window.__chartContext({code:'000660',name:'다른 종목',period:'3m',follow:true}));
  await page.waitForFunction(()=>!document.querySelector('#chartViewport .candle'));
  assert.match(await page.locator('#chartViewport').innerText(),/아직 연결되지/);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
