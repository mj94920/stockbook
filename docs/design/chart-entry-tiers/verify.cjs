'use strict';
// Synthetic OHLCV and money are deliberately labeled; no authenticated API calls.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
(async()=>{
 const server=http.createServer((req,res)=>{try{const file=path.resolve(root,new URL(req.url,'http://x').pathname.slice(1)||'chart.html');if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1500,height:1050}}),base='http://127.0.0.1:'+server.address().port,errors=[];
 try{
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.addInitScript(mock=>{window.stockBookChart={onContext:fn=>window.__context=fn,getData:async()=>mock.data,getTradingValues:async()=>mock.money,setView:async()=>({ok:true}),setFollow:async()=>({ok:true})};},require('./fixture.cjs').createFixture());
  await page.goto(base+'/chart.html');await page.evaluate(()=>window.__context({code:'000002',name:'기호·조건 합성 검증 (실수신 아님)',barCycle:'day',period:'6m',follow:false}));await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.stockCode==='000002');
  const initialStatus=await page.locator('.sb-chart-entry-status').innerText();assert.match(initialStatus,/작은형님 150억 · 큰형님 5,000억/);
  await page.locator('#chartIndicatorSettings').click();await page.locator('#chartNewLowPeriod').fill('3');await page.locator('#chartRSIPeriod').fill('2');await page.locator('#chartRSILevel').fill('60');await page.locator('#chartRSIMethod').selectOption('simple');await page.getByRole('button',{name:'적용',exact:true}).click();
  await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).setView(70,240));
  const result={scope:'Synthetic OHLCV and synthetic KIS-shaped amounts. Production chart HTML with mock IPC; not live, not a Windows/HTS match. Formula amount is fixed to hundred-million won as confirmed by the user; monetary inputs here remain synthetic.',verifiedAt:new Date().toISOString(),initialStatus,views:[]};
  for(const [name,width,height,light] of [['dark-wide',1500,1050,false],['light-wide',1500,1050,true],['dark-tablet',840,1000,false]]){
   await page.setViewportSize({width,height});await page.locator('#chartViewport').evaluate((h,light)=>{document.body.classList.toggle('light-mode',light);StockBookCharts.controller(h).updateTheme(light);},light);
   await page.waitForFunction(()=>[...document.querySelectorAll('.sb-chart-signal')].every(e=>{const r=e.getBoundingClientRect();return r.width>9.9&&r.width<16.1&&r.height>9.9&&r.height<16.1;}));
   const signals=await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.signals);assert.ok(signals.entrySmallDates.length>0);assert.ok(signals.entryBigDates.length>0);assert.equal(await page.locator('.sb-chart-signal[data-kind="entry-big"]').count(),signals.entryBigDates.length);
   const markers=await page.locator('.sb-chart-signal').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {kind:e.dataset.kind,date:e.dataset.date,width:r.width,height:r.height,fill:getComputedStyle(e).fill};}));result.views.push({name,width,height,signals,markers});await page.screenshot({path:path.join(__dirname,name+'.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(__dirname,'result.json'),JSON.stringify({...result,errors},null,2)+'\n');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
