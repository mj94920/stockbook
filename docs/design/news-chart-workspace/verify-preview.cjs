'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const html=fs.readFileSync(path.join(__dirname,'preview.html'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHART_CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900},timezoneId:'Asia/Seoul'}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  const url='http://127.0.0.1:'+server.address().port;await page.goto(url);await page.waitForFunction(()=>window.newsPreviewReady);
  assert.equal(await page.locator('#icList .ic-row').count(),3);assert.match(await page.locator('#icDetail').innerText(),/수신 요약/);
  assert.equal(await page.locator('.ic-article-body').count(),0);
  await page.screenshot({path:path.join(__dirname,'news.png'),fullPage:true});
  await page.locator('#icList .ic-row').nth(1).click();assert.match(await page.locator('#icDetail').innerText(),/헤럴드경제/);
  await page.locator('[data-ic-tab="bloter"]').click();await page.waitForFunction(()=>!_ic.loading&&_ic.tab==='bloter'&&_ic.items.length===20);
  await page.locator('#icList .ic-row').first().click();assert.match(await page.locator('#icDetail').innerText(),/블로터/);assert.equal(await page.locator('.ic-article-body').count(),0);
  await page.screenshot({path:path.join(__dirname,'bloter.png'),fullPage:true});
  await page.setViewportSize({width:1024,height:768});assert.equal(await page.locator('#icDetail').isVisible(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[url+'/']);
  fs.writeFileSync(path.join(__dirname,'preview-result.json'),JSON.stringify({passed:true,scope:'Self-contained list-snapshot HTML without article bodies, served internally; not a Windows Electron or direct-file launch test',checks:['received market list snapshot displays three publishers','missing body is labelled summary','article selection changes publisher','Bloter tab displays 20 received metadata snapshots','1024px reader visible','no runtime external requests'],errors},null,2)+'\n');
  console.log('PASS: news preview, received list snapshots, summary fallback, article selection, no external requests');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
