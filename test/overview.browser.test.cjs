const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
async function app(run){const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{try{const file=path.resolve(root,new URL(req.url,'http://x').pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}}),base='http://127.0.0.1:'+server.address().port,errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.addInitScript(()=>{localStorage.setItem('sbHdrIndices',JSON.stringify(['kospi','sp500','dow']));});await page.goto(base+'/index.html');assert.deepEqual(errors,[]);await page.evaluate(async()=>{window.electronAPI={fetchMarketTickers:async()=>({kospi:{regularMarketPrice:2500,previousClose:2490},sox:{symbol:'^SOX',regularMarketPrice:5200,previousClose:5100,source:'Yahoo Finance',asOf:'2026-11-06T21:00:00Z'},nasdaqFuture:{symbol:'NQ=F',regularMarketPrice:24000,previousClose:23900,source:'Yahoo Finance',asOf:'2026-11-06T22:00:00Z'},us10y:{symbol:'^TNX',regularMarketPrice:4.25,previousClose:4.23,source:'Yahoo Finance',asOf:'2026-11-06T21:00:00Z'}})};await fetchMarketTicker();});await run(page);assert.deepEqual(errors,[]);}finally{await browser?.close();await new Promise(r=>server.close(r));}}
test('overview reserves right column for AI and aligns compact chart with tasks at desktop widths',async()=>app(async page=>{
 for(const width of [1600,1400,1024]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>window._MDI.show('watchlist'));await page.waitForTimeout(150);const boxes=await page.evaluate(()=>{const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};return {chart:box('dockCtx'),work:box('mdi-panel-portfolio'),ai:box('sbAnalysis'),signalParent:document.getElementById('dockCtx').contains(document.getElementById('sbMarketRadar')) && !document.getElementById('sbAnalysis').contains(document.getElementById('sbMarketRadar'))};});assert.ok(Math.abs(boxes.chart.right-boxes.work.right)<2);assert.ok(Math.abs(boxes.chart.y-boxes.ai.y)<2);assert.ok(Math.abs(boxes.ai.bottom-boxes.work.bottom)<2,JSON.stringify({width,boxes}));assert.ok(boxes.ai.x>=boxes.chart.right);assert.ok(boxes.signalParent);}
 await page.setViewportSize({width:1600,height:1000});await page.evaluate(()=>{state.watchlist=[{ticker:'005930',name:'삼성전자',price:193500,change:-3.97}];window._dockSel='005930';dockCtxRender();});await page.screenshot({path:'/tmp/stockbook-overview-narrow-chart.png'});
}));
test('header replaces S&P/Dow, migrates preferences once and formats Treasury yield changes in basis points',async()=>app(async page=>{
 await page.waitForFunction(()=>document.getElementById('tkUs10y').textContent==='4.250%');const cards=await page.locator('#hdrIdxList').innerText();assert.match(cards,/필라델피아 반도체/);assert.match(cards,/나스닥100 선물/);assert.match(cards,/미 10년물 금리/);assert.doesNotMatch(cards,/S&P500|DOW/);assert.equal(await page.locator('#tkUs10yChg').textContent(),'▲2.0bp');assert.match(await page.locator('#hdrIdxList').innerHTML(),/실시간 보장 아님/);
 await page.evaluate(()=>setHdrIdxVisible('sox',false));assert.doesNotMatch(await page.locator('#hdrIdxList').innerText(),/필라델피아 반도체/);await page.evaluate(()=>renderHeaderIndexCards());assert.doesNotMatch(await page.locator('#hdrIdxList').innerText(),/필라델피아 반도체/);
 await page.evaluate(async()=>{electronAPI.fetchMarketTickers=async()=>({});await fetchMarketTicker();});assert.equal(await page.locator('#tkUs10y').textContent(),'미수신');assert.equal(await page.locator('#tkUs10yChg').textContent(),'');
}));

test('integrated settings preserve login, KRX history and an independent condition editor', async () => app(async page => {
 for (const width of [1024, 540]) {
  await page.setViewportSize({width, height:768});
  await page.evaluate(()=>openSettings('general'));
  assert.equal(await page.locator('#aiServiceLogin [data-ai-provider]').count(),2);
  assert.equal(await page.locator('#sbCodexCheck').count(),1);
  await page.evaluate(()=>settingsGo('account'));
  assert.equal(await page.locator('#krxHistory').count(),1);
  assert.equal(await page.locator('#krxHistory [data-history="cycle"]').count(),1);
  assert.ok(await page.evaluate(()=>document.querySelector('#settingsModal .sb-modal__foot').getBoundingClientRect().bottom<=innerHeight+1));
  await page.evaluate(()=>closeSettings());
  await page.evaluate(()=>{window._MDI.show('watchlist');window._MDIPanelTab('watchlist','as');});
  await page.locator('#sbScreenOpen').click();
  assert.equal(await page.locator('dialog.sb-screen-dialog[open]').count(),1);
  assert.equal(await page.locator('#sbMarketRadarDialog[open]').count(),0);
  await page.evaluate(()=>document.querySelector('dialog.sb-screen-dialog[open]').close());
 }
}));
test('short desktop shows a usable price plot alongside the work and AI panels by default', async () => app(async page => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.evaluate(() => {
    const candles = Array.from({ length: 132 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
      open: 100 + i, high: 103 + i, low: 99 + i, close: 101 + i, volume: 1000,
    }));
    window.electronAPI.getChartData = async code => ({
      ok: true, candles, investors: null,
      metadata: { stockCode: code, name: '삼성전자', sourceType: 'naver-daily',
        snapshotDate: candles.at(-1).date, fetchedAt: '2026-11-06T00:00:00Z' },
    });
    state.watchlist = [{ ticker: '005930', name: '삼성전자', price: 193500 }];
    window._dockSel = '005930';
    window._MDI.show('watchlist');
    dockCtxRender();
  });
  await page.locator('#sbEmbeddedChart [data-chart-id="chart"]').waitFor();
  const layout = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    const plot = box('#sbEmbeddedChart [data-chart-id="chart"]');
    const stage = box('.sb-market-stage');
    const work = box('#mdi-panel-portfolio');
    const ai = box('#sbAnalysis');
    return {
      visiblePlot: Math.min(plot.bottom, stage.bottom) - Math.max(plot.top, stage.top),
      work: work.height, ai: ai.height, bottom: Math.max(work.bottom, ai.bottom), viewport: innerHeight,
    };
  });
  assert.ok(layout.visiblePlot >= 48, JSON.stringify(layout));
  assert.ok(layout.work >= 180 && layout.ai >= layout.work && layout.bottom <= layout.viewport + 1, JSON.stringify(layout));
}));
