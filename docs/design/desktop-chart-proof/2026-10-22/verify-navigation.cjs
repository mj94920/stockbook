const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'playground.html')));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHART_CHROMIUM_PATH||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.renderDone&&window.investorReady);
  async function point(index,y){await page.locator('#chart').scrollIntoViewIfNeeded();return page.evaluate(({index,y})=>{const p=new DOMPoint(toolModel().x(index),y).matrixTransform(toolSvg.getScreenCTM());return {x:p.x,y:p.y};},{index,y});}
  async function drag(a,b){await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();}
  // Zooming the latest window must keep the final candle, even at maximum scale.
  const latest=await page.evaluate(()=>toolModel().all.at(-1).date);
  for(let i=0;i<8;i++){
   await page.click('#zoomIn');
   assert.equal(await page.evaluate(()=>toolModel().rows.at(-1).date),latest,'zoom must not drop the newest candles');
  }
  assert.equal(await page.evaluate(()=>toolModel().rows.length),30);
  await page.locator('#chart').scrollIntoViewIfNeeded();
  const visible=await page.evaluate(()=>{const chart=toolSvg.getBoundingClientRect(),bar=Array.from(toolSvg.querySelectorAll('.candle')).at(-1).getBoundingClientRect();return bar.left>=chart.left&&bar.right<=chart.right&&bar.top>=chart.top&&bar.bottom<=chart.bottom;});assert.equal(visible,true,'entire last candle must remain inside the chart');
  await page.screenshot({path:path.join(__dirname,'max-zoom-preview.png'),fullPage:true});
  await page.click('#zoomOut');assert.equal(await page.evaluate(()=>toolModel().rows.at(-1).date),latest);
  await page.click('#viewReset');
  const start=await point(80,70);await drag(start,{x:start.x+120,y:start.y});assert.ok(await page.evaluate(()=>toolModel().rows.length<160));assert.equal(await page.evaluate(()=>toolModel().end),1000);
  const zoomed=await page.evaluate(()=>toolModel().rows.length);const left=await point(45,70);await drag(left,{x:left.x-120,y:left.y});assert.ok((await page.evaluate(()=>toolModel().rows.length))>zoomed);
  await page.click('#viewReset');assert.equal(await page.evaluate(()=>toolModel().rows.length),160);
  await page.click('[data-chart-tool="trend"]');let a=await point(30,200);await page.mouse.click(a.x,a.y);a=await point(60,250);await page.mouse.click(a.x,a.y);
  const anchors=await page.evaluate(()=>JSON.parse(JSON.stringify(drawings[0].points)));
  await page.locator('#chartScale').focus();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>toolModel().rows.length),480);
  await page.keyboard.press('End');assert.equal(await page.evaluate(()=>toolModel().rows.length),30);assert.equal(await page.locator('#scaleReadout').innerText(),'30봉');
  assert.equal(await page.evaluate(()=>toolModel().rows.at(-1).date),latest,'scale slider must keep the latest candle');
  await page.click('#viewReset');
  const scroll=page.locator('#chartScroll');await scroll.scrollIntoViewIfNeeded();const box=await scroll.boundingBox();await page.mouse.click(box.x+box.width*.3,box.y+box.height/2);
  assert.ok((await page.evaluate(()=>toolModel().offset))<500);assert.equal(await page.evaluate(()=>toolModel().rows.length),160);
  // Zooming a manually selected historical window must not jump back to today.
  const historicalEnd=await page.evaluate(()=>toolModel().end);
  await page.click('#zoomIn');assert.equal(await page.evaluate(()=>toolModel().end),historicalEnd);
  await page.click('#zoomOut');assert.equal(await page.evaluate(()=>toolModel().end),historicalEnd);
  // The selected date window must drive prices, averages and volume together.
  assert.equal(await page.locator('.candle').count(),160);assert.equal(await page.locator('.pressure-volume').count(),160);
  const aligned=await page.evaluate(()=>{const m=toolModel(),ma5=average(m.all,5);return m.averages[0].every((v,i)=>v===ma5[m.offset+i])&&m.rows[0].date===m.all[m.offset].date&&m.rows.at(-1).date===m.all[m.end-1].date;});assert.equal(aligned,true);
  await scroll.focus();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>toolModel().offset),0);
  await page.locator('#zoomOut').click();assert.equal(await page.evaluate(()=>toolModel().offset),0);assert.ok(await page.evaluate(()=>toolModel().rows.every(r=>Number.isFinite(r.close))));
  await scroll.focus();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>toolModel().end),1000);
  assert.deepEqual(await page.evaluate(()=>drawings[0].points),anchors);
  await page.click('#drawingSave');await page.reload();await page.waitForFunction(()=>window.renderDone);await page.click('#drawingLoad');assert.deepEqual(await page.evaluate(()=>drawings[0].points),anchors);
  await page.click('#viewReset');await page.click('[data-chart-tool="pan"]');const panStart=await point(60,70);await drag(panStart,{x:panStart.x+130,y:panStart.y});assert.ok((await page.evaluate(()=>toolModel().end))<1000);
  await page.click('#viewReset');await page.click('[data-chart-tool="view"]');a=await point(80,200);await page.mouse.move(a.x,a.y);await page.mouse.wheel(0,-120);await page.waitForFunction(()=>toolModel().rows.length<160);
  assert.equal(await page.evaluate(()=>toolModel().rows.at(-1).date),latest,'wheel zoom must keep the latest candle');
  await page.click('#viewReset');await page.mouse.move(0,0);await page.locator('#chart').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,'navigation-preview.png'),fullPage:true});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(__dirname,'navigation-result.json'),JSON.stringify({passed:true,checks:['max zoom retains latest candle across buttons, scale and wheel','desktop drag right zooms in','desktop drag left zooms out','scale slider bounds 30..480','scrollbar mouse click and oldest/latest bounds','price/MA/volume window alignment','annotations keep dates/prices through zoom/pan/reload','explicit pan mode','wheel zoom','reset to latest 160'],browserErrors:errors},null,2));console.log('PASS: desktop drag zoom, scrollbar, scale, aligned data, persistent annotations, pan and wheel');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
