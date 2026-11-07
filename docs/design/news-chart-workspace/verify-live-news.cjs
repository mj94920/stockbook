'use strict';
// Actual provider HTTPS + production news service + browser with a mock preload.
// No account credentials and no saved copies of article bodies/screenshots.
const https=require('node:https'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const {registerNews}=require('../../../src/news/service.cjs');
const root=path.resolve(__dirname,'../../..'),calls=[];
let agent;
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY){const proxy=require('https-proxy-agent');agent=new (proxy.HttpsProxyAgent||proxy)(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);}
function read(url,timeoutMs,headers){return new Promise((resolve,reject)=>{
 const req=https.get(url,{agent,headers:{'User-Agent':'Mozilla/5.0',...headers}},res=>{
  const chunks=[];let size=0;res.on('error',reject);
  res.on('data',b=>{size+=b.length;if(size>4000000)req.destroy(Error('Response too large'));else chunks.push(b);});
  res.on('end',()=>{const body=Buffer.concat(chunks);calls.push({url,status:res.statusCode,bytes:size,sha256:crypto.createHash('sha256').update(body).digest('hex')});if(res.statusCode!==200)return reject(Error('HTTP '+res.statusCode));resolve(body.toString('utf8'));});
 });req.on('error',reject);req.setTimeout(timeoutMs,()=>req.destroy(Error('Timeout')));
});}
(async()=>{
 const handlers=new Map(),main={webContents:{}};
 registerNews({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},getMainWindow:()=>main,httpsGet:read,headers:{Referer:'https://m.stock.naver.com/'}});
 const invoke=(channel,value)=>handlers.get(channel)({sender:main.webContents},value);
 const server=http.createServer((req,res)=>{try{const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/+/, '')||'index.html',file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHART_CHROMIUM_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1400,height:900},timezoneId:'Asia/Seoul'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));const base='http://127.0.0.1:'+server.address().port;
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.exposeFunction('__liveList',value=>invoke('fetch-news',value));await page.exposeFunction('__liveArticle',value=>invoke('fetch-news-article',value));
  await page.goto(base+'/index.html');
  await page.evaluate(async()=>{window.electronAPI={fetchNews:opts=>window.__liveList(opts),fetchNewsArticle:url=>window.__liveArticle(url)};_ic.updated=new Date();window._MDI.show('news');await icRefresh();});
  const marketCount=await page.locator('#icList .ic-row').count();assert.ok(marketCount>0);
  await page.evaluate(()=>icSelect(0));assert.ok((await page.locator('.ic-article-body').innerText()).length>100);
  const naver=await page.evaluate(()=>({url:_ic.items[_ic.sel].url,publisher:_ic.items[_ic.sel].source,publisherUrl:_ic.items[_ic.sel].publisherUrl,bodyLength:_ic.items[_ic.sel].articleBody.length}));
  assert.match(naver.publisherUrl,/^https?:\/\//);assert.equal(await page.getByRole('button',{name:'언론사 원문 ↗',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'네이버 기사 ↗',exact:true}).count(),1);
  await page.locator('[data-ic-tab="bloter"]').click();await page.waitForFunction(()=>!_ic.loading&&_ic.tab==='bloter'&&_ic.items.length>0,{},{timeout:20000});
  const bloterCount=await page.locator('#icList .ic-row').count();await page.evaluate(()=>icSelect(0));
  assert.ok((await page.locator('.ic-article-body').innerText()).length>100);
  const bloter=await page.evaluate(()=>({url:_ic.items[_ic.sel].url,publisher:_ic.items[_ic.sel].source,time:_ic.items[_ic.sel].time,bodyLength:_ic.items[_ic.sel].articleBody.length}));
  assert.equal(bloter.publisher,'블로터');assert.match(bloter.time,/^\d{4}-\d{2}-\d{2}T/);
  assert.equal(await page.locator('#icDetail').evaluate(el=>{el.scrollTop=el.scrollHeight;return el.scrollTop>0;}),true);
  await page.evaluate(async()=>{window.electronAPI.fetchNewsArticle=async()=>({ok:false});await icSelect(1);});assert.equal(await page.locator('.ic-article-body').count(),0);assert.doesNotMatch(await page.locator('#icDetail').innerText(),/수신 요약/);
  const stock=await invoke('fetch-news',{kind:'stock',code:'005930'});assert.equal(stock.ok,true);assert.ok(stock.items.length>0);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(__dirname,'live-reader-result.json'),JSON.stringify({passed:true,verifiedAt:new Date().toISOString(),scope:'Actual HTTPS through session proxy + production news service + browser mock preload. Windows Electron/NSIS not verified. Article bodies are not stored.',marketCount,stockCount:stock.items.length,bloterCount,naver,bloter,calls,checks:['real Naver body and publisher origin link','real Bloter list and body','provided full publication timestamp','reader internal scrolling','failed body does not invent summary'],browserErrors:errors},null,2)+'\n');
  console.log(JSON.stringify({passed:true,marketCount,stockCount:stock.items.length,bloterCount,naverBodyLength:naver.bodyLength,bloterBodyLength:bloter.bodyLength,browserErrors:errors}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
