'use strict';
// Real HTTPS through the configured proxy + production provider + browser/mock preload.
// Store metadata and cropped chart screenshots only; no account data or full history copies.
const https=require('node:https'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright'),{createChartProvider}=require('../../../src/chart/provider.cjs');
const root=path.resolve(__dirname,'../../..'),calls=[];let agent;
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY){const proxy=require('https-proxy-agent');agent=new (proxy.HttpsProxyAgent||proxy)(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);}
const read=(url,timeout,headers)=>new Promise((resolve,reject)=>{
 const req=https.get(url,{agent,headers:{'User-Agent':'Mozilla/5.0',...headers}},res=>{const chunks=[];let size=0;
  res.on('data',b=>{size+=b.length;if(size>4000000)req.destroy(Error('Response too large'));else chunks.push(b);});res.on('error',reject);
  res.on('end',()=>{const body=Buffer.concat(chunks);calls.push({url,status:res.statusCode,bytes:size,sha256:crypto.createHash('sha256').update(body).digest('hex')});if(res.statusCode!==200)return reject(Error('HTTP '+res.statusCode));resolve(new (require('node:util').TextDecoder)('euc-kr').decode(body));});
 });req.on('error',reject);req.setTimeout(timeout,()=>req.destroy(Error('Timeout')));
});
(async()=>{
 const provider=createChartProvider({httpsGet:read}),codes=['005930','000660','010130'],received=[];
 for(const code of codes){const data=await provider.get(code);assert.equal(data.ok,true);received.push({code,name:data.metadata.name,count:data.candles.length,lastDate:data.metadata.snapshotDate,lastClose:data.candles.at(-1).close,omitted:data.metadata.omittedRows});}
 const server=http.createServer((req,res)=>{try{const rel=new URL(req.url,'http://x').pathname.replace(/^\/+/, '')||'index.html',target=path.resolve(root,rel);if(!target.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',target.endsWith('.html')?'text/html; charset=utf-8':target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(target));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHART_CHROMIUM_PATH||undefined});const page=await browser.newPage({viewport:{width:1500,height:960}}),errors=[],base='http://127.0.0.1:'+server.address().port;
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.exposeFunction('__daily',code=>provider.get(code));await page.goto(base);
  await page.evaluate(items=>{
   window.electronAPI={getChartData:code=>window.__daily(code),fetchQuote:async()=>null,setChartContext:async()=>({ok:true}),fetchHoga:async()=>({ok:false})};
   state.watchlist=[];state.portfolio=[];window._dockSel=null;_allMkt='KOSPI';_allStockRaw.KOSPI=items.map(s=>({code:s.code,name:s.name,price:s.lastClose,change:0,changePct:0}));
   window._MDI.show('watchlist');window._MDIPanelTab('watchlist','as');filterAndRenderAll();
  },received);
  const displayed=[];
  for(const code of ['000660','010130']){
   await page.locator('#sbDesktopSearch').fill(received.find(s=>s.code===code).name);
   await page.waitForFunction(code=>document.getElementById('sbEmbeddedChart').chartEvidence?.stockCode===code,code,{timeout:20000});
   assert.equal(await page.evaluate(()=>state.watchlist.length),0);await page.locator('#sbChartCycle').selectOption('week');await page.locator('#sbChartPeriod').selectOption('all');
   await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.barCycle==='week');
   const weekly=await page.locator('#sbEmbeddedChart').evaluate(h=>h.chartEvidence);assert.equal(weekly.stockCode,code);assert.deepEqual(weekly.cloudPeriods,[1,4]);assert.equal(weekly.investors,undefined);
   await page.locator('[data-context-pane="chart"]').screenshot({path:path.join(__dirname,'live-chart-'+code+'-week.png')});
   await page.locator('#sbChartCycle').selectOption('month');await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.barCycle==='month');const monthly=await page.locator('#sbEmbeddedChart').evaluate(h=>h.chartEvidence);
   assert.equal(monthly.stockCode,code);assert.equal(monthly.cloudCount,0);assert.deepEqual(monthly.periods,[1,5,19,6,9]);
   await page.locator('[data-context-pane="chart"]').screenshot({path:path.join(__dirname,'live-chart-'+code+'-month.png')});
   displayed.push({code,weeklyCount:weekly.count,monthlyCount:monthly.count,lastWeeklyAverages:weekly.lastAverages,lastMonthlyAverages:monthly.lastAverages});
  }
  await page.evaluate(()=>dockCtxRender());assert.equal(await page.evaluate(()=>window._dockSel),'010130');assert.equal(await page.evaluate(()=>state.watchlist.length),0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(__dirname,'live-chart-result.json'),JSON.stringify({passed:true,verifiedAt:new Date().toISOString(),scope:'Actual provider HTTPS + production parser/cache + app HTML/browser with mock preload. Not Windows Electron/NSIS or a proof of every listed symbol.',received,displayed,calls,checks:['non-Samsung source identity','watchlist remains empty','header search selects current instrument','weekly/monthly actual data','no Samsung investor data attached','periodic render retains selection'],browserErrors:errors},null,2)+'\n');
  console.log(JSON.stringify({passed:true,received,displayed:displayed.map(({code,weeklyCount,monthlyCount})=>({code,weeklyCount,monthlyCount})),errors}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
