'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const folder=__dirname,html=fs.readFileSync(path.join(folder,'chart-cycles-preview.html'));
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHART_CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port;await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base);
  const weekly=await page.locator('#chart').evaluate(h=>h.chartEvidence);assert.equal(weekly.count,215);assert.deepEqual(weekly.cloudLast,[220250,244062.5]);
  assert.equal(await page.locator('.pressure-volume').count(),215);assert.ok(await page.locator('.ma-cloud').count()>0);
  await page.screenshot({path:path.join(folder,'weekly.png'),fullPage:true});
  await page.locator('#cycle').selectOption('month');const monthly=await page.locator('#chart').evaluate(h=>h.chartEvidence);
  assert.equal(monthly.count,50);assert.deepEqual(monthly.periods,[1,5,19,6,9]);assert.equal(await page.locator('.ma-cloud').count(),0);assert.equal(await page.locator('.bb-shift').count(),0);
  await page.screenshot({path:path.join(folder,'monthly.png'),fullPage:true});
  await page.locator('#range').selectOption('1y');const restricted=await page.locator('#chart').evaluate(h=>h.chartEvidence);assert.ok(restricted.displayed<monthly.displayed);assert.deepEqual(restricted.lastAverages,monthly.lastAverages);
  await page.locator('#theme').click();assert.equal(await page.locator('.ma[data-period="19"]').getAttribute('stroke'),'#763cb5');
  await page.setViewportSize({width:1024,height:768});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#cycle').selectOption('day');assert.equal(await page.locator('.bb-shift').count(),1);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(folder,'cycle-result.json'),JSON.stringify({passed:true,verifiedAt:new Date().toISOString(),scope:'Recorded Samsung daily data grouped locally; browser renderer, UI/IPC mocks. Not a new live provider or a Windows Electron chart verification.',weekly,monthly,checks:['weekly OHLCV and 1/4 cloud','monthly MA 1/5/19/6/9 without invented Fibonacci','range-independent MA prehistory','light/dark palette','1024px viewport','daily BB retained'],browserErrors:errors},null,2)+'\n');
  console.log('PASS: weekly/monthly preview and cycle controls');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
