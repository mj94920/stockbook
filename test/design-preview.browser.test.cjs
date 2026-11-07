const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createServer}=require('node:http');
const {chromium}=require('playwright');

test('standalone PC preview keeps its aspect ratio on tall phone viewports and renders its embedded chart offline',async()=>{
 const html=await fs.readFile(path.resolve(__dirname,'../docs/design/data-research-ai/preview.html'));
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:412,height:915}}),base='http://127.0.0.1:'+server.address().port,errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{if(route.request().url().startsWith(base))return route.continue();external.push(route.request().url());return route.abort();});
  await page.goto(base);
  const app=page.frames().find(frame=>frame!==page.mainFrame());assert.ok(app);
  await app.waitForFunction(()=>window.designPreviewReady&&document.querySelector('#sbEmbeddedChart svg[data-chart-id="chart"] .candle'));
  await app.evaluate(()=>closeAnalysisDrawer());
  for(const viewport of [{width:412,height:915},{width:980,height:2120}]){
   await page.setViewportSize(viewport);
   await page.waitForFunction(()=>document.querySelector('iframe').style.width==='1600px');
   assert.deepEqual(await app.evaluate(()=>({width:innerWidth,height:innerHeight})),{width:1600,height:1000});
   const bounds=await page.locator('iframe').boundingBox();
   assert.ok(Math.abs(bounds.width-viewport.width)<1);
   assert.ok(Math.abs(bounds.height/bounds.width-1000/1600)<0.01);
   assert.equal(await app.locator('#sbEmbeddedChart').getByRole('button',{name:'차트 다시 시도'}).count(),0);
  }
  await page.setViewportSize({width:1600,height:1000});
  await page.waitForFunction(()=>document.querySelector('iframe').style.height==='1000px');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
