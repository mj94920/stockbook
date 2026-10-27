'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
async function setup(touch=false){
 const server=http.createServer((req,res)=>{try{const file=path.resolve(root,new URL(req.url,'http://x').pathname.slice(1)||'chart.html');if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1280,height:1100},hasTouch:touch,timezoneId:'Asia/Seoul'}),errors=[],base='http://127.0.0.1:'+server.address().port;
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await page.addInitScript(()=>{
  const candles=[];let date=new Date('2013-01-02T00:00:00Z');while(candles.length<3200){if(date.getUTCDay()!==0&&date.getUTCDay()!==6){const i=candles.length,open=1000+i*.2+Math.sin(i/7)*10,close=open+Math.sin(i)*5;candles.push({date:date.toISOString().slice(0,10),open,high:Math.max(open,close)+3,low:Math.min(open,close)-3,close,volume:100+i%17*20});}date.setUTCDate(date.getUTCDate()+1);}
  window.__chartFetches=[];window.stockBookChart={onContext:fn=>window.__context=fn,getData:async(code,cycle)=>{window.__chartFetches.push({code,cycle});return {ok:true,candles:cycle==='year'?candles:candles.slice(-1000),investors:null,metadata:{stockCode:code,name:'합성 검증 종목',sourceType:'naver-daily',snapshotDate:candles.at(-1).date,fetchedAt:'2026-10-27T01:00:00Z',lastBarComplete:null}};},setFollow:async value=>{window.__follow=value;return {ok:true};},setView:async value=>{window.__view=value;return {ok:true};}};
 });
 await page.goto(base+'/chart.html');await page.evaluate(()=>window.__context({code:'000001',name:'합성 검증 종목',period:'6m',barCycle:'month',follow:true}));await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='month');
 return {page,browser,errors,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
async function point(page,index,y){return page.evaluate(({index,y})=>{const host=document.getElementById('chartViewport'),m=StockBookCharts.controller(host).getModel(),svg=host.querySelector('[data-chart-id="chart"]'),p=new DOMPoint(m.x(index),y).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};},{index,y});}
async function clickPoint(page,index,y){const p=await point(page,index,y);await page.mouse.click(p.x,p.y);return p;}
test('detail controls, indicator settings, annual defaults and monthly bar geometry remain correct on resize',async()=>{
 const h=await setup(),{page}=h;
 try{
  await page.locator('#chartPeriod').selectOption('all');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.viewRange==='all');assert.equal(await page.locator('#chartFollow').inputValue(),'pin');
  await page.locator('#chartIndicatorSettings').click();await page.locator('#chartMAPeriods').fill('2,6,12');await page.getByRole('button',{name:'적용',exact:true}).click();assert.deepEqual(await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.periods),[2,6,12]);
  await page.locator('#chartIndicatorSettings').click();await page.locator('#chartMAPeriods').fill('0,5');await page.getByRole('button',{name:'적용',exact:true}).click();assert.equal(await page.locator('#chartSettings').isVisible(),true);assert.match(await page.locator('#chartSettingsError').innerText(),/1~1200/);await page.locator('#chartSettingsClose').click();
  await page.locator('#chartPeriod').selectOption('6m');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.viewRange==='6m');
  async function geometry(){return page.evaluate(()=>{const host=document.getElementById('chartViewport'),vol=[...host.querySelectorAll('.pressure-volume')],inside=[...host.querySelectorAll('.pressure-estimate')],candles=[...host.querySelectorAll('.candle')],panel=host.querySelector('[data-chart-id="pressureChart"]').getBoundingClientRect();return {height:panel.height,rows:vol.map((v,i)=>{const a=v.getBoundingClientRect(),b=inside[i].getBoundingClientRect(),c=candles[i].getBoundingClientRect();return {width:a.width,height:a.height,insideHeight:b.height,centerDiff:Math.abs(a.x+a.width/2-(b.x+b.width/2)),candleDiff:Math.abs(a.x+a.width/2-(c.x+c.width/2)),bottom:a.bottom-panel.y};})};});}
  for(const width of [1280,840,1500]){await page.setViewportSize({width,height:1100});await page.waitForFunction(()=>{const h=document.getElementById('chartViewport'),svg=h.querySelector('[data-chart-id="pressureChart"]'),rect=h.querySelector('.pressure-volume')?.getBoundingClientRect();return !!rect&&rect.width<=24.5&&svg.clientHeight===80;});const g=await geometry();assert.equal(g.height,80);for(const row of g.rows){assert.ok(row.width<=24.5);assert.ok(row.height<=g.height);assert.ok(row.insideHeight<=row.height+.5);assert.ok(row.centerDiff<.6);assert.ok(row.candleDiff<1.2);assert.ok(row.bottom<=80);}}
  await page.locator('#chartCycle').selectOption('year');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='year');
  const annual=await page.locator('#chartViewport').evaluate(h=>h.chartEvidence);assert.equal(annual.viewRange,'all');assert.deepEqual(annual.periods,[1,5,10]);assert.equal(annual.cloudCount,0);assert.equal(annual.bbPeriod,null);assert.equal(await page.locator('[data-chart-id="pressureChart"]').isVisible(),false);assert.equal(await page.locator('#chartViewport .sb-proof-extended').isVisible(),false);assert.ok(annual.lastAverages.every(a=>a.value>0));
  await page.locator('#chartCycle').selectOption('day');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='day');await page.locator('#chartIndicatorSettings').click();await page.locator('#chartBBPeriod').fill('20');await page.locator('#chartBBMultiplier').fill('2');await page.locator('#chartBBShift').fill('5');await page.getByRole('button',{name:'적용',exact:true}).click();assert.equal(await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.bbShift),5);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
test('crosshair OHLC, pan/zoom/scroll and drawing tools work with data anchors and latest edge retained',async()=>{
 const h=await setup(),{page}=h;
 try{
  const p=await point(page,2,260);await page.mouse.move(p.x,p.y);assert.equal(await page.locator('.sb-chart-crosshair').count(),2);const expected=await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().rows[2]);assert.match(await page.locator('.sb-chart-tooltip').innerText(),new RegExp(expected.date));assert.match(await page.locator('.sb-chart-tooltip').innerText(),/시가|종가|거래량/);
  const before=await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().count);
  await page.mouse.down();await page.mouse.move(p.x+100,p.y,{steps:8});await page.mouse.up();let m=await page.locator('#chartViewport').evaluate(h=>{const m=StockBookCharts.controller(h).getModel();return {count:m.count,end:m.end,total:m.all.length};});assert.ok(m.count<before);assert.equal(m.end,m.total);
  await page.getByRole('button',{name:'처음 보기',exact:true}).click();await page.getByRole('button',{name:'이동',exact:true}).click();const pan=await point(page,3,260);await page.mouse.move(pan.x,pan.y);await page.mouse.down();await page.mouse.move(pan.x+100,pan.y,{steps:6});await page.mouse.up();assert.ok(await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().end<StockBookCharts.controller(h).getModel().all.length));
  await page.getByRole('slider',{name:'차트 가로 스크롤',exact:true}).press('Home');assert.equal(await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().offset),0);
  await page.getByRole('slider',{name:'차트 축척',exact:true}).press('End');assert.equal(await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().count),1);
  await page.getByRole('button',{name:'최신',exact:true}).click();await page.getByRole('button',{name:'처음 보기',exact:true}).click();
  for(const tool of ['horizontal','thirds','quarters','midpoint','rectangle','ellipse','triangle','arrow','trend','vertical','text']){await page.locator('[data-tool="'+tool+'"]').click();await clickPoint(page,1,280);if(!['horizontal','midpoint','vertical','text'].includes(tool))await clickPoint(page,4,380);}
  assert.equal(await page.locator('.sb-chart-drawing').count(),11);
  await page.locator('[data-tool="pen"]').click();const a=await point(page,2,330);await page.mouse.move(a.x,a.y);await page.mouse.down();for(let n=1;n<=4;n++)await page.mouse.move(a.x+n*12,a.y+(n%2?10:-10));await page.mouse.up();assert.equal(await page.locator('.sb-chart-drawing').count(),12);
  await page.getByRole('button',{name:'저장',exact:true}).click();const storedBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('stockbook:chart:drawings:v1:000001:월봉')).drawings.at(-1).points);
  const handle=page.locator('.sb-chart-drawing').last().locator('circle').first(),box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+15,{steps:5});await page.mouse.up();
  await page.getByRole('button',{name:'저장',exact:true}).click();const storedAfter=await page.evaluate(()=>JSON.parse(localStorage.getItem('stockbook:chart:drawings:v1:000001:월봉')).drawings.at(-1).points);assert.notDeepEqual(storedAfter,storedBefore);
  await page.getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('button',{name:'모두 지우기',exact:true}).click();assert.equal(await page.locator('.sb-chart-drawing').count(),0);await page.getByRole('button',{name:'불러오기',exact:true}).click();assert.equal(await page.locator('.sb-chart-drawing').count(),12);
  const shapesBefore=await page.locator('.sb-chart-drawing').count();await page.getByRole('button',{name:'+',exact:true}).click();assert.equal(await page.locator('.sb-chart-drawing').count(),shapesBefore);await page.setViewportSize({width:1024,height:1100});assert.equal(await page.locator('.sb-chart-drawing').count(),shapesBefore);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
test('tablet touch can draw a horizontal line and pinch zoom without losing the latest candle',async()=>{
 const h=await setup(true),{page}=h;
 try{
  await page.locator('[data-tool="horizontal"]').tap();const p=await point(page,2,260);await page.touchscreen.tap(p.x,p.y);assert.equal(await page.locator('.sb-chart-drawing').count(),1);
  const session=await page.context().newCDPSession(page),center=await point(page,3,300);const input=(type,d)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:d});
  await input('touchStart',[{x:center.x-35,y:center.y,id:1},{x:center.x+35,y:center.y,id:2}]);await input('touchMove',[{x:center.x-90,y:center.y,id:1},{x:center.x+90,y:center.y,id:2}]);await input('touchEnd',[]);
  const m=await page.locator('#chartViewport').evaluate(h=>{const m=StockBookCharts.controller(h).getModel();return {count:m.count,end:m.end,total:m.all.length};});assert.ok(m.count<7);assert.equal(m.end,m.total);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('range and day/week/month switches reuse received history; failed same-view retry restores indicator settings',async()=>{
 const h=await setup(),{page}=h;
 try{
  await page.locator('#chartPeriod').selectOption('all');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.viewRange==='all');
  for(const cycle of ['week','day','month']){await page.locator('#chartCycle').selectOption(cycle);await page.waitForFunction(c=>document.getElementById('chartViewport').chartEvidence?.barCycle===c,cycle);}
  assert.equal(await page.evaluate(()=>window.__chartFetches.length),1);
  await page.locator('#chartCycle').selectOption('year');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='year');assert.equal(await page.evaluate(()=>window.__chartFetches.length),2);
  await page.locator('#chartCycle').selectOption('month');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='month');assert.equal(await page.evaluate(()=>window.__chartFetches.length),2);
  await page.locator('#chartIndicatorSettings').click();await page.locator('#chartMAPeriods').fill('2,6');await page.getByRole('button',{name:'적용',exact:true}).click();
  await page.evaluate(async()=>{const read=stockBookChart.getData;let calls=0;stockBookChart.getData=(code,cycle)=>++calls===1?Promise.resolve({ok:false,error:'수신 실패 검증'}):read(code,cycle);await window.__context({code:'000002',name:'재시도 검증',barCycle:'month',period:'6m',follow:false});});
  assert.match(await page.locator('#chartViewport').innerText(),/수신 실패 검증/);await page.getByRole('button',{name:'차트 다시 시도',exact:true}).click();await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.stockCode==='000002'&&document.getElementById('chartViewport').chartEvidence?.periods[0]===2);
  assert.deepEqual(await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.periods),[2,6]);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('renderer stops waiting for stuck IPC, retries without restart and ignores the late response',async()=>{
 const h=await setup(),{page}=h;
 try{
  await page.clock.install();
  await page.evaluate(()=>{const read=stockBookChart.getData;let calls=0;stockBookChart.getData=(code,cycle)=>++calls===1?new Promise(resolve=>window.__lateChart=resolve):read(code,cycle);void window.__context({code:'000003',name:'대기 검증',barCycle:'month',period:'6m',follow:false});});
  assert.match(await page.locator('#chartViewport').innerText(),/불러오는 중/);await page.clock.fastForward(14001);assert.match(await page.locator('#chartViewport').innerText(),/응답이 지연/);
  await page.getByRole('button',{name:'차트 다시 시도',exact:true}).click();await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.stockCode==='000003');
  await page.evaluate(()=>{window.__lateChart({ok:false,error:'늦은 실패'});const controller=StockBookCharts.controller(document.getElementById('chartViewport')),update=controller.updateTheme;window.__themeUpdates=0;controller.updateTheme=value=>{window.__themeUpdates++;update(value);};document.body.classList.add('unrelated-class');});
  await page.evaluate(()=>Promise.resolve());assert.equal(await page.evaluate(()=>window.__themeUpdates),0);assert.equal(await page.locator('#chartViewport .candle').count()>0,true);assert.doesNotMatch(await page.locator('#chartViewport').innerText(),/늦은 실패/);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('embedded chart exposes crosshair labels, persistent bar data and foldable drawing tools',async()=>{
 const h=await setup(),{page}=h;
 try{
  await page.setViewportSize({width:1600,height:900});
  await page.goto(page.url().replace('/chart.html','/index.html'));
  await page.evaluate(()=>{state.watchlist=[{ticker:'000001',name:'합성 검증 종목',price:1000,quoteAt:Date.now()}];window._dockSel='000001';window._MDI.show('watchlist');});
  await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.stockCode==='000001');
  const host=page.locator('#sbEmbeddedChart');assert.match(await host.locator('.sb-chart-bar-info').innerText(),/시가.*고가.*저가.*종가.*거래량/);
  async function at(index,y){return host.evaluate((host,{index,y})=>{const m=StockBookCharts.controller(host).getModel(),svg=host.querySelector('[data-chart-id="chart"]'),p=new DOMPoint(m.x(index),y).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y,date:m.rows[index].date};},{index,y});}
  let p=await at(3,260);await page.mouse.move(p.x,p.y);
  assert.equal(await host.locator('.sb-chart-crosshair').count(),2);
  assert.match(await host.locator('.sb-chart-bar-info').innerText(),new RegExp(p.date));
  assert.equal(await host.locator('.sb-chart-axis-label:visible').count(),2);
  assert.equal(await host.locator('.sb-chart-axis-label').evaluateAll(es=>es.every(e=>getComputedStyle(e).fontSize==='12px'&&e.getBoundingClientRect().height>=18)),true);
  assert.equal(await host.locator('.sb-chart-tool-panel').getAttribute('open'),null);
  await host.locator('.sb-chart-tool-panel summary').click();
  await page.waitForFunction(()=>{const host=document.getElementById('sbEmbeddedChart'),panel=host.querySelector('.sb-chart-tool-panel-body').getBoundingClientRect();return panel.height>0&&panel.bottom<=host.getBoundingClientRect().bottom;});
  await host.locator('[data-tool="horizontal"]').click();
  assert.equal(await host.locator('.sb-chart-tool-panel').getAttribute('open'),null);
  p=await at(3,260);await page.mouse.click(p.x,p.y);assert.equal(await host.locator('.sb-chart-drawings > g').count(),1);
  const before=await host.evaluate(h=>StockBookCharts.controller(h).getModel().count);
  await host.locator('.sb-chart-tool-panel summary').click();await host.locator('.sb-chart-navigation').getByRole('button',{name:'+',exact:true}).click();
  assert.ok(await host.evaluate(h=>StockBookCharts.controller(h).getModel().count)<before);
  await host.locator('.sb-chart-tool-panel summary').click();
  await host.locator('.sb-chart-tool-panel summary').click();await host.getByRole('textbox',{name:'차트 메모'}).fill('종합 차트 메모');await host.locator('[data-tool="text"]').click();
  p=await at(4,220);await page.mouse.click(p.x,p.y);
  assert.equal(await host.locator('.sb-chart-drawings text').evaluateAll(es=>es.some(e=>e.textContent==='종합 차트 메모'&&getComputedStyle(e).display!=='none')),true);
  await page.locator('#sbChartCycle').selectOption('month');await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.barCycle==='month');
  assert.equal(await host.locator('.sb-chart-compact-controls').count(),1);assert.match(await host.locator('.sb-chart-bar-info').innerText(),/월봉/);
  p=await at(1,260);await page.mouse.move(p.x,p.y);assert.match(await host.locator('.sb-chart-tooltip').innerText(),new RegExp(p.date));
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('Space repeatedly zooms out during a held drag, retains the drag baseline and ignores typing',async()=>{
 const h=await setup(),{page}=h;
 try{
  const count=()=>page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().count);
  const start=await count(),p=await point(page,2,260);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+15,p.y);
  const dragged=await count();await page.keyboard.press('Space');const first=await count();assert.ok(first>dragged);
  await page.keyboard.press('Space');const second=await count();assert.ok(second>first);
  await page.mouse.move(p.x+16,p.y);assert.equal(await count(),second);await page.mouse.up();
  await page.getByRole('textbox',{name:'차트 메모'}).fill('차트');await page.getByRole('textbox',{name:'차트 메모'}).press('Space');assert.equal(await count(),second);assert.equal(await page.getByRole('textbox',{name:'차트 메모'}).inputValue(),'차트 ');
  await page.getByRole('button',{name:'처음 보기',exact:true}).click();assert.equal(await count(),start);
  await page.getByRole('button',{name:'이동',exact:true}).click();const q=await point(page,2,260);await page.mouse.move(q.x,q.y);await page.mouse.down();await page.keyboard.press('Space');assert.ok(await count()>start);await page.mouse.up();
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
