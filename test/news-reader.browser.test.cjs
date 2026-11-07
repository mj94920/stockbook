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
  const bloterList=require('../src/news/bloter.cjs').bloterItems(require('node:fs').readFileSync(path.join(__dirname,'fixtures/news/bloter-list-structure-20261023.html'),'utf8'));
  await page.evaluate(items=>{
   window.electronAPI.fetchNews=opts=>opts.provider==='bloter'?Promise.resolve({ok:true,items}):new Promise(resolve=>window.__resolveNaverList=resolve);
   window.electronAPI.fetchNewsArticle=async()=>({ok:true,body:'합성 블로터 본문',time:'2026-10-23T11:27:16+09:00'});
   _ic.tab='market';window.__oldNaverList=icRefresh();icSetTab('bloter');
  },bloterList);
  await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.source==='블로터');
  assert.equal(await page.locator('#icList .ic-row').count(),2);assert.equal(await page.locator('#icList .ic-time').first().innerText(),'10-23');
  await page.evaluate(()=>icSelect(0));assert.match(await page.locator('#icDetail').innerText(),/합성 블로터 본문/);assert.match(await page.locator('#icDetail').innerText(),/2026-10-23/);
  await page.evaluate(async()=>{window.__resolveNaverList({ok:true,items:[{id:'late-naver',title:'늦은 네이버 목록'}]});await window.__oldNaverList;});assert.doesNotMatch(await page.locator('#icList').innerText(),/늦은 네이버 목록/);
  await page.evaluate(async()=>{window.electronAPI.fetchNewsArticle=async()=>({ok:false});await icSelect(1);});assert.doesNotMatch(await page.locator('#icDetail').innerText(),/수신 요약/);
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
  assert.deepEqual(await page.evaluate(()=>window.__chartWindows.at(-1)),{code:'005930',name:'검증 종목',period:'3m',viewRange:'3m',barCycle:'day',indicatorCycle:'day'});assert.deepEqual(errors,[]);
  await page.locator('#sbChartCycle').selectOption('week');await page.locator('#sbChartPeriod').selectOption('all');
  await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.barCycle==='week'&&document.getElementById('sbEmbeddedChart').chartEvidence?.displayed===215);
  const weekly=await page.locator('#sbEmbeddedChart').evaluate(h=>h.chartEvidence);
  assert.deepEqual(weekly.periods,[4,12,24,46,73]);assert.deepEqual(weekly.cloudPeriods,[1,4]);assert.deepEqual(weekly.cloudLast,[220250,244062.5]);assert.ok(weekly.cloudCount>0);
  assert.equal(await page.locator('#sbEmbeddedChart .ma').count(),5);assert.equal(await page.locator('#sbEmbeddedChart .bb-shift').count(),0);assert.equal(await page.locator('#sbEmbeddedChart .pressure-volume').count(),0);assert.equal(await page.locator('#sbEmbeddedChart .sb-obv-line').count(),2);assert.equal(weekly.obv.count,215);
  assert.equal(await page.locator('#sbEmbeddedChart .ma[data-period="46"]').getAttribute('stroke-width'),'3');
  await page.locator('#sbChartDetail').click();assert.equal(await page.evaluate(()=>window.__chartWindows.at(-1).barCycle),'week');assert.equal(await page.evaluate(()=>window.__chartWindows.at(-1).viewRange),'all');
  await page.locator('#sbChartCycle').selectOption('month');await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.barCycle==='month');
  const monthly=await page.locator('#sbEmbeddedChart').evaluate(h=>h.chartEvidence);
  assert.deepEqual(monthly.periods,[1,5,19,6,9]);assert.equal(monthly.count,50);assert.equal(monthly.cloudCount,0);assert.equal(monthly.cloudPeriods,null);
  assert.equal(await page.locator('#sbEmbeddedChart .ma-cloud').count(),0);assert.equal(await page.locator('#sbEmbeddedChart .pressure-volume').count(),50);
  assert.match((await page.locator('#sbEmbeddedChart .ma[data-period="19"]').getAttribute('points')),/[^ ]/);
  await page.evaluate(()=>{state.watchlist=[];window._dockSel=null;dockCtxRender();});assert.equal(await page.locator('#sbEmbeddedChart .candle').count(),0);
  await page.addInitScript(()=>{window.stockBookChart={onContext:fn=>{window.__chartContext=fn;},setFollow:async value=>{window.__follow=value;return {ok:true};}};});
  await page.goto(base+'/chart.html');
  await page.evaluate(()=>window.__chartContext({code:'005930',name:'검증 종목',period:'3m',follow:true}));
  assert.match(await page.locator('#chartName').innerText(),/검증 종목/);assert.equal(await page.locator('#chartPeriod').inputValue(),'3m');
  await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.displayed===66);
  assert.equal(await page.locator('#chartViewport .ma').count(),8);
  assert.equal(await page.locator('#chartViewport .investor-line').count(),3);
  assert.equal(await page.locator('#chartViewport .investor-point').count(),15);
  assert.equal(await page.locator('#chartViewport .sb-proof-money').getAttribute('open'),null);
  const evidence=await page.locator('#chartViewport').evaluate(host=>host.chartEvidence);
  assert.equal(evidence.investors.totals.foreign,-1275121);assert.equal(evidence.investors.totals.institution,-1546172);assert.equal(evidence.investors.totals.individual,2316914);
  assert.equal(evidence.bbShift,25);
  await page.evaluate(()=>window.__chartContext({code:'005930',name:'검증 종목',period:'all',barCycle:'week',indicatorCycle:'week',viewRange:'all',follow:true}));
  await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='week');
  assert.equal(await page.locator('#chartCycle').inputValue(),'week');assert.equal(await page.locator('#chartPeriod').inputValue(),'all');
  assert.equal(await page.locator('#chartViewport .candle').count(),215);assert.equal(await page.locator('#chartViewport .sb-proof-options').isVisible(),false);
  await page.evaluate(()=>window.__chartContext({code:'005930',name:'검증 종목',period:'1y',barCycle:'month',viewRange:'1y',follow:true}));
  await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='month');
  assert.equal(await page.locator('#chartCycle').inputValue(),'month');assert.match(await page.locator('#chartViewport .sb-proof-legend').innerText(),/피보나치 구름/);
  assert.equal(await page.locator('#chartViewport .ma-cloud').count(),0);
  await page.evaluate(()=>window.__chartContext({code:'005930',name:'검증 종목',period:'3m',follow:true}));
  await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='day');
  assert.equal(await page.locator('#chartViewport .bb-shift').count(),1);assert.equal(await page.locator('#chartViewport .ma').count(),8);
  await page.locator('#chartFollow').selectOption('pin');assert.equal(await page.evaluate(()=>window.__follow),false);
  await page.evaluate(()=>window.__chartContext({code:'005930',name:'검증 종목',period:'3m',follow:false}));assert.match(await page.locator('#chartStatus').innerText(),/고정/);
  await page.evaluate(()=>window.__chartContext({code:'000660',name:'다른 종목',period:'3m',follow:true}));
  await page.waitForFunction(()=>!document.querySelector('#chartViewport .candle'));
  assert.match(await page.locator('#chartViewport').innerText(),/아직 연결되지/);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});

test('original-page controls keep the native view in the reader and hide it for overlays, tabs and failed loads',async()=>{
 const root=path.resolve(__dirname,'..');const server=createServer(async(req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/, '')||'index.html',target=path.resolve(root,rel);if(!target.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',target.endsWith('.html')?'text/html; charset=utf-8':target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'application/octet-stream');res.end(await fs.readFile(target));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base+'/index.html');
  await page.evaluate(async()=>{
   window.__opens=[];window.__bounds=[];window.__closes=0;
   window.electronAPI={
    openNewsPage:async value=>{window.__opens.push(value);return {ok:true,url:'https://www.publisher.example/article'};},
    closeNewsPage:async()=>{window.__closes++;return {ok:true};},setNewsPageBounds:value=>window.__bounds.push(value),
    fetchNewsArticle:async()=>({ok:true,body:'합성 본문 — 실제 원문 페이지와 별도의 텍스트 폴백',publisherUrl:'https://www.publisher.example/article'})
   };
   _ic.updated=new Date();_ic.tab='market';window._MDI.show('news');
   _ic.items=[{id:'original',title:'원문 페이지 영역 검증',source:'합성 언론사',url:'https://n.news.naver.com/mnews/article/469/0001234567'}];await icSelect(0);
  });
  await page.waitForFunction(()=>window.__bounds.at(-1)?.bounds?.width>200);
  assert.equal(await page.locator('#icPageHost').count(),1);assert.equal(await page.locator('.ic-article-body').count(),0);
  assert.equal(await page.locator('#icPageStatus').innerText(),'www.publisher.example');
  assert.equal(await page.evaluate(()=>window.__opens.length),1);assert.equal(await page.evaluate(()=>window.__opens[0].source),'publisher');
  const initial=await page.evaluate(()=>window.__bounds.at(-1).bounds);assert.ok(initial.height>150);
  await page.evaluate(()=>document.getElementById('sellModal').classList.add('open'));
  await page.waitForFunction(()=>window.__bounds.at(-1)?.bounds===null);
  await page.evaluate(()=>document.getElementById('sellModal').classList.remove('open'));
  await page.waitForFunction(()=>window.__bounds.at(-1)?.bounds?.width>200);
  await page.setViewportSize({width:1300,height:820});
  await page.waitForFunction(old=>window.__bounds.at(-1)?.bounds?.width!==old,initial.width);
  assert.ok((await page.evaluate(()=>window.__bounds.at(-1).bounds)).height>80);
  await page.evaluate(()=>window._MDI.show('journal'));
  await page.waitForFunction(()=>window.__bounds.at(-1)?.bounds===null);
  await page.evaluate(()=>window._MDI.show('news'));
  await page.waitForFunction(()=>window.__bounds.at(-1)?.bounds?.width>200);
  await page.getByRole('button',{name:'본문만 보기',exact:true}).click();
  assert.equal(await page.locator('#icPageHost').count(),0);assert.match(await page.locator('.ic-article-body').innerText(),/합성 본문/);
  assert.equal(await page.evaluate(()=>window.__closes),1);
  await page.getByRole('button',{name:'네이버 기사',exact:true}).click();
  await page.waitForFunction(()=>window.__opens.length===2);
  assert.equal(await page.evaluate(()=>window.__opens.at(-1).source),'naver');
  await page.evaluate(()=>{window.electronAPI.openNewsPage=async()=>({ok:false,error:'합성 연결 실패'});});
  await page.getByRole('button',{name:'언론사 원문',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('icPageStatus')?.textContent==='합성 연결 실패');
  assert.match(await page.locator('#icPageHost').innerText(),/본문만 보기/);
  await page.getByRole('button',{name:'본문만 보기',exact:true}).click();assert.match(await page.locator('.ic-article-body').innerText(),/합성 본문/);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});

test('unregistered catalog, header search and holding selections drive chart data without changing watchlist',async()=>{
 const root=path.resolve(__dirname,'..');const server=createServer(async(req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/, '')||'index.html',target=path.resolve(root,rel);if(!target.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',target.endsWith('.html')?'text/html; charset=utf-8':target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'application/octet-stream');res.end(await fs.readFile(target));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base);
  await page.evaluate(()=>{
   window.__requests=[];window.__windows=[];
   window.__syntheticData=code=>{
    const candles=[];let day=new Date('2024-01-02T00:00:00Z');while(candles.length<520){if(day.getUTCDay()!==0&&day.getUTCDay()!==6){const n=candles.length;candles.push({date:day.toISOString().slice(0,10),open:1000+n,high:1020+n,low:990+n,close:1005+n,volume:100+n});}day.setUTCDate(day.getUTCDate()+1);}
    return {ok:true,candles,investors:null,metadata:{stockCode:code,name:'합성 '+code,sourceType:'naver-daily',snapshotDate:candles.at(-1).date,fetchedAt:'2026-10-26T03:00:00Z',lastBarComplete:null}};
   };
   window.electronAPI={getChartData:async code=>{window.__requests.push(code);return window.__syntheticData(code);},fetchQuote:async()=>({price:1510,prevClose:1500,source:'합성 시세'}),setChartContext:async()=>({ok:true}),openChartWindow:async value=>{window.__windows.push(value);return {ok:true};},fetchHoga:async()=>({ok:false})};
   state.watchlist=[];state.portfolio=[{ticker:'010130',name:'고려아연',currentPrice:1510,avgPrice:1000,qty:1}];window._dockSel=null;
   _allStockRaw.KOSPI=[{code:'000660',name:'SK하이닉스',price:1510},{code:'010130',name:'고려아연',price:1510}];_allMkt='KOSPI';
   window._MDI.show('watchlist');window._MDIPanelTab('watchlist','as');filterAndRenderAll();
  });
  await page.locator('#asr-000660 td').nth(1).click();
  await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.stockCode==='000660');
  assert.equal(await page.locator('#dockCtxName').innerText(),'SK하이닉스');assert.equal(await page.evaluate(()=>state.watchlist.length),0);
  await page.evaluate(()=>{dockCtxRender();renderWatchlist();});assert.equal(await page.evaluate(()=>window._dockSel),'000660');
  await page.locator('#sbChartCycle').selectOption('week');await page.locator('#sbChartPeriod').selectOption('all');
  await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.barCycle==='week');assert.deepEqual(await page.locator('#sbEmbeddedChart').evaluate(h=>h.chartEvidence.cloudPeriods),[1,4]);
  await page.locator('#sbChartDetail').click();assert.equal(await page.evaluate(()=>window.__windows.at(-1).code),'000660');
  await page.locator('#sbDesktopSearch').fill('고려아연');await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.stockCode==='010130');
  assert.equal(await page.locator('#dockCtxName').innerText(),'고려아연');assert.equal(await page.evaluate(()=>state.watchlist.length),0);
  await page.locator('#sbChartCycle').selectOption('month');await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.barCycle==='month');assert.equal(await page.locator('#sbEmbeddedChart .ma-cloud').count(),0);
  await page.evaluate(()=>{connectToHoga('000660','SK하이닉스');connectStockFromPortfolio(0);});await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.stockCode==='010130');
  await page.evaluate(()=>{handleRealtimePrice({ticker:'010130',price:1550,change:50,changePct:3.33});dockCtxRender();});assert.equal(await page.locator('#dockCtxPrice').innerText(),'1,550');
  await page.evaluate(()=>{window.electronAPI.getChartData=code=>code==='000660'?new Promise(resolve=>window.__lateChart=resolve):Promise.resolve(window.__syntheticData(code));});
  await page.locator('#sbDesktopSearch').fill('SK하이닉스');await page.waitForFunction(()=>typeof window.__lateChart==='function');
  await page.locator('#sbDesktopSearch').fill('고려아연');await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.stockCode==='010130');
  await page.evaluate(()=>window.__lateChart({ok:false,error:'늦은 이전 종목 실패'}));assert.equal(await page.locator('#sbEmbeddedChart .candle').count()>0,true);assert.doesNotMatch(await page.locator('#sbEmbeddedChart').innerText(),/늦은 이전 종목/);
  await page.evaluate(()=>{window.electronAPI.getChartData=async()=>({ok:false,error:'합성 수신 실패'});});await page.locator('#sbDesktopSearch').fill('123456');await page.waitForFunction(()=>document.querySelector('#sbEmbeddedChart > span')?.textContent==='합성 수신 실패');assert.equal(await page.locator('#sbEmbeddedChart .candle').count(),0);assert.equal(await page.getByRole('button',{name:'차트 다시 시도',exact:true}).isVisible(),true);
  await page.evaluate(()=>{window.electronAPI.getChartData=async code=>window.__syntheticData(code);});await page.getByRole('button',{name:'차트 다시 시도',exact:true}).click();await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.stockCode==='123456');
  assert.equal(await page.evaluate(()=>state.watchlist.length),0);assert.equal(await page.evaluate(()=>window.__requests.includes('005930')),false);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});

test('stock news prioritizes current and searched instruments over holdings, retains explicit scope and rejects stale results',async()=>{
 const root=path.resolve(__dirname,'..');const server=createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+new URL(req.url,'http://x').pathname);if(!target.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',target.endsWith('.html')?'text/html; charset=utf-8':target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'application/octet-stream');res.end(await fs.readFile(target));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base+'/index.html');
  await page.evaluate(()=>{
   state.portfolio=[{ticker:'005930',name:'삼성전자',qty:1,avgPrice:100}];state.watchlist=[{ticker:'000660',name:'SK하이닉스'}];
   _allStockRaw={KOSPI:[{code:'229640',name:'LS에코에너지'},{code:'010130',name:'고려아연'}]};window._dockSel='229640';window.__newsRequests=[];
   window.electronAPI={fetchNews:async opts=>{window.__newsRequests.push(opts);return {ok:true,items:opts.code?[{id:opts.code,title:opts.code+' 기사',code:opts.code,source:'검증 매체',time:'2026-10-27T09:00:00+09:00'}]:[]};}};
   window._MDI.show('news');icSetTab('stock');
  });
  await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.code==='229640');
  assert.match(await page.locator('#icStockSearch').inputValue(),/LS에코에너지 229640/);
  assert.equal(await page.evaluate(()=>_ic.scope),'sel');
  assert.deepEqual(await page.evaluate(()=>window.__newsRequests.filter(r=>r.kind==='stock').map(r=>r.code)),['229640']);
  await page.locator('#icStockSearch').fill('SK하이닉스');await page.locator('#icStockSearch').press('Enter');
  await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.code==='000660');
  await page.evaluate(()=>icRefresh());assert.equal(await page.evaluate(()=>_ic.items[0].code),'000660');
  await page.evaluate(()=>icSetScope('port'));await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.code==='005930');
  await page.evaluate(()=>{icSetTab('market');icSetTab('stock');});await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.code==='000660');
  await page.locator('#sbDesktopSearch').fill('고려아연');await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.code==='010130');
  assert.match(await page.locator('#icSearchStatus').innerText(),/고려아연 종목뉴스/);
  await page.evaluate(()=>{window._MDI.show('watchlist');dockSelectStock('229640');window._MDI.show('news');});
  await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.code==='229640');
  await page.evaluate(()=>icSetScope('port'));await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.code==='005930');
  await page.evaluate(()=>{window._MDI.show('watchlist');dockSelectStock('229640');window._MDI.show('news');});
  await page.waitForFunction(()=>!_ic.loading&&_ic.scope==='sel'&&_ic.items[0]?.code==='229640');
  await page.evaluate(()=>{const fetch=window.electronAPI.fetchNews;window.electronAPI.fetchNews=opts=>opts.code==='000660'?new Promise(resolve=>window.__lateNews=resolve):fetch(opts);icSelectStock('000660');icSelectStock('010130');});
  await page.waitForFunction(()=>!_ic.loading&&_ic.items[0]?.code==='010130');
  await page.evaluate(()=>window.__lateNews({ok:true,items:[{id:'late',title:'이전 종목 지연 기사',code:'000660'}]}));
  assert.equal(await page.evaluate(()=>_ic.items[0].code),'010130');assert.doesNotMatch(await page.locator('#icList').innerText(),/지연 기사/);
  assert.equal(await page.evaluate(()=>state.portfolio[0].ticker),'005930');assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
