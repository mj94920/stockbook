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
 return {page,browser,errors,base,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
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
  async function geometry(){return page.evaluate(()=>{const host=document.getElementById('chartViewport'),vol=[...host.querySelectorAll('.pressure-volume')],inside=[...host.querySelectorAll('.pressure-estimate')],candles=[...host.querySelectorAll('.candle')],panel=host.querySelector('[data-chart-id="pressureChart"]').getBoundingClientRect();return {height:panel.height,priceHeight:host.querySelector('[data-chart-id="chart"]').getBoundingClientRect().height,rows:vol.map((v,i)=>{const a=v.getBoundingClientRect(),b=inside[i].getBoundingClientRect(),c=candles[i].getBoundingClientRect();return {width:a.width,height:a.height,insideHeight:b.height,centerDiff:Math.abs(a.x+a.width/2-(b.x+b.width/2)),candleDiff:Math.abs(a.x+a.width/2-(c.x+c.width/2)),bottom:a.bottom-panel.y};})};});}
  for(const width of [1280,840,1500]){await page.setViewportSize({width,height:1100});await page.waitForFunction(()=>{const h=document.getElementById('chartViewport'),svg=h.querySelector('[data-chart-id="pressureChart"]'),rect=h.querySelector('.pressure-volume')?.getBoundingClientRect();return !!rect&&rect.width<=24.5&&Math.abs(svg.viewBox.baseVal.height-svg.getBoundingClientRect().height)<1;});const g=await geometry();assert.ok(g.height>100);assert.ok(Math.abs(g.height/(g.height+g.priceHeight)-.3)<.01);for(const row of g.rows){assert.ok(row.width<=24.5);assert.ok(row.height<=g.height);assert.ok(row.insideHeight<=row.height+.5);assert.ok(row.centerDiff<.6);assert.ok(row.candleDiff<1.2);assert.ok(row.bottom<=g.height+.5);}}
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
  await page.getByRole('button',{name:'처음 보기',exact:true}).click();const pan=await point(page,3,40);await page.mouse.move(pan.x,pan.y);await page.mouse.wheel(0,-120);assert.ok(await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().end<StockBookCharts.controller(h).getModel().all.length));assert.equal(await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().count),before);
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
  const drag=await point(page,2,40);await input('touchStart',[{x:drag.x,y:drag.y,id:1}]);await input('touchMove',[{x:drag.x+80,y:drag.y,id:1}]);await input('touchEnd',[]);assert.ok(await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().count)<7);await page.getByRole('button',{name:'처음 보기',exact:true}).click();
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
  await host.locator('.sb-chart-tool-panel > summary').click();
  await page.waitForFunction(()=>{const host=document.getElementById('sbEmbeddedChart'),panel=host.querySelector('.sb-chart-tool-panel-body').getBoundingClientRect();return panel.height>0&&panel.bottom<=host.getBoundingClientRect().bottom;});
  await host.locator('[data-tool="horizontal"]').click();
  assert.equal(await host.locator('.sb-chart-tool-panel').getAttribute('open'),null);
  p=await at(3,260);await page.mouse.click(p.x,p.y);assert.equal(await host.locator('.sb-chart-drawings > g').count(),1);await page.keyboard.press('Delete');assert.equal(await host.locator('.sb-chart-drawings > g').count(),0);
  const before=await host.evaluate(h=>StockBookCharts.controller(h).getModel().count);
  await host.locator('.sb-chart-tool-panel > summary').click();await host.locator('.sb-chart-navigation').getByRole('button',{name:'+',exact:true}).click();
  assert.ok(await host.evaluate(h=>StockBookCharts.controller(h).getModel().count)<before);
  await page.keyboard.press('Escape');assert.equal(await host.locator('.sb-chart-tool-panel').getAttribute('open'),null);assert.equal(await page.locator('#mdiWorkspace').getAttribute('data-dock-screen'),'watchlist');
  await host.locator('.sb-chart-tool-panel > summary').click();await host.locator('.sb-chart-indicator-controls [data-chart-indicator="ma:20"]').click();await page.keyboard.press('Delete');assert.equal(await host.locator('.ma[data-period="20"]').count(),0);await host.getByRole('button',{name:'지표 복원',exact:true}).click();assert.equal(await host.locator('.ma[data-period="20"]').count(),1);
  await host.getByRole('textbox',{name:'차트 메모'}).fill('종합 차트 메모');await host.locator('[data-tool="text"]').click();
  p=await at(4,220);await page.mouse.click(p.x,p.y);
  assert.equal(await host.locator('.sb-chart-drawings text').evaluateAll(es=>es.some(e=>e.textContent==='종합 차트 메모'&&getComputedStyle(e).display!=='none')),true);
  await page.locator('#sbChartCycle').selectOption('month');await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.barCycle==='month');
  assert.equal(await host.locator('.sb-chart-compact-controls').count(),1);assert.match(await host.locator('.sb-chart-bar-info').innerText(),/월봉/);
  p=await at(1,260);await page.mouse.move(p.x,p.y);assert.match(await host.locator('.sb-chart-tooltip').innerText(),new RegExp(p.date));
  await page.locator('#sbChartCycle').selectOption('day');await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.barCycle==='day');await host.getByRole('combobox',{name:'차트 유형',exact:true}).selectOption('volume');await host.locator('.sb-chart-tool-panel > summary').click();await host.getByRole('button',{name:'차트 설정 초기화',exact:true}).click();assert.equal(await host.getByRole('combobox',{name:'차트 유형',exact:true}).inputValue(),'candle');assert.deepEqual(await host.evaluate(h=>h.chartEvidence.periods),[5,10,20,60]);
  const countBeforeWheel=await host.evaluate(h=>StockBookCharts.controller(h).getModel().count),wheelPoint=await at(2,40);await page.mouse.move(wheelPoint.x,wheelPoint.y);await page.mouse.wheel(0,-120);await page.waitForFunction(()=>StockBookCharts.controller(document.getElementById('sbEmbeddedChart')).getModel().offset<StockBookCharts.controller(document.getElementById('sbEmbeddedChart')).getModel().all.length-StockBookCharts.controller(document.getElementById('sbEmbeddedChart')).getModel().count);assert.equal(await host.evaluate(h=>StockBookCharts.controller(h).getModel().count),countBeforeWheel);
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
  await page.getByRole('slider',{name:'차트 가로 스크롤',exact:true}).focus();await page.keyboard.press('Space');assert.equal(await count(),start);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('Delete removes the selected indicator or drawing, protects editing and restores indicators; Escape closes one detail panel',async()=>{
 const h=await setup(),{page}=h;
 try{
  const indicator=id=>page.locator('.sb-chart-indicator[data-chart-indicator="'+id+'"]');
  await indicator('ma:5').click();await page.keyboard.press('Delete');assert.equal(await page.locator('.ma[data-period="5"]').count(),0);assert.ok(await page.locator('.candle').count()>0);
  await page.getByRole('button',{name:'+',exact:true}).click();assert.equal(await page.locator('.ma[data-period="5"]').count(),0);
  await page.getByRole('button',{name:'실행 취소',exact:true}).click();assert.equal(await page.locator('.ma[data-period="5"]').count(),1);
  for(const period of [1,5,19,6,9]){await indicator('ma:'+period).click();await page.keyboard.press('Delete');}assert.equal(await page.locator('.ma').count(),0);assert.ok(await page.locator('.candle').count()>0);
  await page.getByRole('button',{name:'지표 복원',exact:true}).click();assert.equal(await page.locator('.ma').count(),5);
  const linePoint=await page.locator('.ma[data-period="19"]').evaluate(line=>{const [x,y]=line.getAttribute('points').split(' ').at(-2).split(',').map(Number),p=new DOMPoint(x,y).matrixTransform(line.ownerSVGElement.getScreenCTM());return {x:p.x,y:p.y};});await page.mouse.click(linePoint.x,linePoint.y);assert.equal(await indicator('ma:19').getAttribute('aria-pressed'),'true');await page.keyboard.press('Delete');assert.equal(await page.locator('.ma[data-period="19"]').count(),0);
  await page.locator('#chartPeriod').selectOption('3m');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.viewRange==='3m');assert.equal(await page.locator('.ma[data-period="19"]').count(),0);await page.getByRole('button',{name:'지표 복원',exact:true}).click();
  await indicator('pressure').click();await page.keyboard.press('Delete');assert.equal(await page.locator('[data-chart-id="pressureChart"]').isVisible(),false);await page.getByRole('button',{name:'지표 복원',exact:true}).click();assert.equal(await page.locator('[data-chart-id="pressureChart"]').isVisible(),true);
  await page.locator('[data-tool="horizontal"]').click();await clickPoint(page,1,300);await page.keyboard.press('Delete');assert.equal(await page.locator('.sb-chart-drawing').count(),0);
  await page.locator('[data-tool="horizontal"]').click();await clickPoint(page,1,300);const memo=page.getByRole('textbox',{name:'차트 메모',exact:true});await memo.fill('memo');await memo.press('Home');await memo.press('Delete');assert.equal(await memo.inputValue(),'emo');assert.equal(await page.locator('.sb-chart-drawing').count(),1);
  await indicator('ma:5').click();await page.locator('#chartIndicatorSettings').click();await page.locator('#chartSettingsClose').focus();await page.keyboard.press('Delete');assert.equal(await page.locator('.ma[data-period="5"]').count(),1);
  await page.evaluate(()=>{for(const el of document.querySelectorAll('#chartViewport details'))el.open=true;});await page.keyboard.press('Escape');assert.equal(await page.locator('#chartSettings').isVisible(),false);assert.ok(await page.locator('#chartViewport details[open]').count()>0);
  const before=await page.locator('#chartViewport details[open]').count();await page.keyboard.press('Escape');assert.equal(await page.locator('#chartViewport details[open]').count(),before-1);
  await page.locator('#chartCycle').selectOption('day');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='day');await indicator('bb').click();await page.keyboard.press('Delete');assert.equal(await page.locator('.bb-shift').count(),0);assert.equal(await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().futureCount),0);
  await indicator('cloud').click();await page.keyboard.press('Delete');assert.equal(await page.locator('.ma-cloud').count(),0);assert.equal(await page.locator('.ma').count(),8);
  await page.getByRole('button',{name:'지표 복원',exact:true}).click();assert.equal(await page.locator('.bb-shift').count(),1);assert.ok(await page.locator('.ma-cloud').count()>0);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('Escape closes the top native/custom modal or drawer once, including focused inputs, before the main panel',async()=>{
 const h=await setup(),{page}=h;
 try{
  await page.goto(h.base+'/index.html');await page.evaluate(()=>{window._MDI.show('news');openAccountPanel();});await page.waitForFunction(()=>document.getElementById('accountPanel').classList.contains('open'));
  await page.evaluate(()=>sbWatchAddOpen());await page.locator('#sbWatchAddSearch').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#sbWatchAddDialog').isVisible(),false);assert.equal(await page.locator('#accountPanel').evaluate(el=>el.classList.contains('open')),true);
  await page.evaluate(()=>wlAddGroup());await page.locator('#_wlGroupInput').fill('취소 검증');await page.keyboard.press('Escape');assert.equal(await page.locator('#_wlGroupModal').count(),0);assert.equal(await page.locator('#accountPanel').evaluate(el=>el.classList.contains('open')),true);
  await page.locator('#accountPanel .acct-panel-close-btn').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#accountPanel').evaluate(el=>el.classList.contains('open')),false);assert.equal(await page.locator('#mdiWorkspace').getAttribute('data-dock-screen'),'news');
  await page.evaluate(()=>{openCalendarPanel();openSettings();document.getElementById('settingsModal').style.zIndex='1000000';});await page.keyboard.press('Escape');assert.equal(await page.locator('#settingsModal').evaluate(el=>el.classList.contains('open')),false);assert.equal(await page.locator('#calPanel').evaluate(el=>el.classList.contains('open')),true);assert.equal(await page.locator('#mdiWorkspace').getAttribute('data-dock-screen'),'news');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#calPanel').evaluate(el=>el.classList.contains('open')),false);assert.equal(await page.locator('#mdiWorkspace').getAttribute('data-dock-screen'),'news');
  await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.press('Escape');assert.equal(await page.locator('#mdiWorkspace').getAttribute('data-dock-screen'),'watchlist');assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('individual indicator switches remain available after Delete and reopening; object cursors show grab and grabbing',async()=>{
 const h=await setup(),{page}=h;
 try{
  const panel=page.locator('.sb-chart-indicator-panel'),toggle=id=>panel.locator('[data-indicator-toggle="'+id+'"]');
  await panel.locator('summary').click();await toggle('ma:19').uncheck();assert.equal(await page.locator('.ma[data-period="19"]').count(),0);assert.equal(await toggle('ma:19').isVisible(),true);
  await page.locator('.sb-proof-legend [data-chart-indicator="ma:5"]').click();await page.keyboard.press('Delete');assert.equal(await toggle('ma:5').isChecked(),false);await toggle('ma:5').check();assert.equal(await page.locator('.ma[data-period="5"]').count(),1);assert.equal(await page.locator('.ma[data-period="19"]').count(),0);
  assert.equal(await page.locator('.sb-chart-indicator-hit[data-chart-indicator="ma:5"]').evaluate(el=>getComputedStyle(el).cursor),'grab');
  await toggle('pressure').uncheck();assert.equal(await page.locator('[data-chart-id="pressureChart"]').isVisible(),false);await toggle('pressure').check();assert.equal(await toggle('investors').isDisabled(),true);
  await page.reload();await page.evaluate(()=>window.__context({code:'000001',name:'표시 복원 검증',barCycle:'month',period:'6m',follow:false}));await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='month');assert.equal(await page.locator('.ma[data-period="19"]').count(),0);
  await panel.locator('summary').click();await toggle('ma:19').check();assert.equal(await page.locator('.ma[data-period="19"]').count(),1);
  await page.locator('[data-tool="horizontal"]').click();await clickPoint(page,2,300);const handle=page.locator('.sb-chart-drawing circle').first();assert.equal(await handle.evaluate(el=>getComputedStyle(el).cursor),'grab');const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();assert.equal(await handle.evaluate(el=>getComputedStyle(el).cursor),'grabbing');await page.mouse.up();assert.equal(await handle.evaluate(el=>getComputedStyle(el).cursor),'grab');assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('four chart types preserve OHLC and data anchors, use volume widths and label the estimated daily price profile',async()=>{
 const h=await setup(),{page}=h;
 try{
  const type=page.getByRole('combobox',{name:'차트 유형',exact:true});const original=await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().rows.map(r=>[r.date,r.open,r.high,r.low,r.close,r.volume]));
  await type.selectOption('hollow');const hollow=await page.locator('#chartViewport').evaluate(h=>{const m=StockBookCharts.controller(h).getModel();return [...h.querySelectorAll('.candle')].map((el,i)=>({fill:el.getAttribute('fill'),up:m.rows[i].close>=m.rows[i].open}));});assert.ok(hollow.some(r=>r.fill==='none'));assert.ok(hollow.every(r=>r.fill==='none'));
  await type.selectOption('volume');const widths=await page.locator('.candle').evaluateAll(es=>es.map(el=>Number(el.getAttribute('width'))));assert.ok(Math.max(...widths)>Math.min(...widths));
  for(const index of [0,2,5]){const p=await point(page,index,300);await page.mouse.move(p.x,p.y);const date=await page.locator('#chartViewport').evaluate((h,i)=>StockBookCharts.controller(h).getModel().rows[i].date,index);assert.match(await page.locator('.sb-chart-tooltip').innerText(),new RegExp(date));}
  const geometry=await page.locator('#chartViewport').evaluate(h=>{const a=[...h.querySelectorAll('.candle')],b=[...h.querySelectorAll('.pressure-volume')];return a.map((el,i)=>{const x=el.getBoundingClientRect(),v=b[i].getBoundingClientRect();return Math.abs(x.x+x.width/2-v.x-v.width/2);});});assert.ok(geometry.every(value=>value<1));
  await page.locator('[data-tool="vertical"]').click();await clickPoint(page,2,300);await type.selectOption('candle');assert.equal(await page.locator('.sb-chart-drawing line').first().getAttribute('x1'),String(await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().x(2))));
  await type.selectOption('profile');const profile=await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.profile),total=await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().rows.reduce((sum,r)=>sum+r.volume,0));assert.equal(profile.method,'uniform-daily-range');assert.equal(profile.totalVolume,total);assert.ok(Math.abs(profile.bins.reduce((sum,b)=>sum+b.volume,0)-total)<total*1e-12);assert.ok(await page.locator('.sb-chart-profile-bin').count()>0);assert.match(await page.locator('[data-chart-id="notice"]').innerText(),/매물대 추정/);
  await page.locator('.sb-chart-indicator-panel > summary').click();await page.locator('[data-indicator-toggle="profile"]').uncheck();assert.equal(await page.locator('.sb-chart-profile-bin').count(),0);await page.locator('[data-indicator-toggle="profile"]').check();assert.ok(await page.locator('.sb-chart-profile-bin').count()>0);
  assert.deepEqual(await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().rows.map(r=>[r.date,r.open,r.high,r.low,r.close,r.volume])),original);
  await page.locator('#chartCycle').selectOption('day');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='day');await type.selectOption('volume');const count=await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().count),future=await point(page,count+3,300);await page.mouse.move(future.x,future.y);assert.match(await page.locator('.sb-chart-tooltip').innerText(),/가격 자료 없음/);
  await page.reload();await page.evaluate(()=>window.__context({code:'000001',name:'유형 복원 검증',barCycle:'day',period:'6m',follow:false}));await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.chartType==='volume');assert.equal(await type.inputValue(),'volume');assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('chart reset restores current-cycle defaults and saved display preferences without deleting drawings or other data',async()=>{
 const h=await setup(),{page}=h;
 try{
  await page.locator('#chartCycle').selectOption('day');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='day');
  await page.locator('#chartIndicatorSettings').click();await page.locator('#chartMAPeriods').fill('3,7');await page.locator('#chartBBPeriod').fill('20');await page.locator('#chartBBShift').fill('5');await page.getByRole('button',{name:'적용',exact:true}).click();
  await page.locator('#chartCycle').selectOption('month');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='month');const initialCount=await page.locator('#chartViewport').evaluate(h=>StockBookCharts.controller(h).getModel().count);
  await page.locator('#chartIndicatorSettings').click();await page.locator('#chartMAPeriods').fill('2,6,12');await page.getByRole('button',{name:'적용',exact:true}).click();
  await page.locator('[data-tool="horizontal"]').click();await clickPoint(page,2,300);await page.getByRole('textbox',{name:'차트 메모',exact:true}).fill('보존 메모');await page.locator('[data-tool="text"]').click();await clickPoint(page,3,360);await page.getByRole('button',{name:'저장',exact:true}).click();
  const saved=await page.evaluate(()=>localStorage.getItem('stockbook:chart:drawings:v1:000001:월봉'));await page.evaluate(()=>{localStorage.setItem('unrelated-app-data','keep');localStorage.setItem('stockbook:chart:visibility:v1:000002:월봉','["ma:5"]');});
  await page.locator('.sb-proof-legend [data-chart-indicator="ma:6"]').click();await page.keyboard.press('Delete');await page.getByRole('combobox',{name:'차트 유형',exact:true}).selectOption('profile');await page.getByRole('button',{name:'+',exact:true}).click();await page.getByRole('slider',{name:'차트 가로 스크롤',exact:true}).press('Home');const calls=await page.evaluate(()=>window.__chartFetches.length);
  await page.getByRole('button',{name:'차트 설정 초기화',exact:true}).click();
  const state=await page.locator('#chartViewport').evaluate(h=>{const c=StockBookCharts.controller(h),m=c.getModel();return {periods:h.chartEvidence.periods,hidden:c.getHiddenIndicators(),type:c.getType(),count:m.count,end:m.end,total:m.all.length};});assert.deepEqual(state.periods,[1,5,19,6,9]);assert.deepEqual(state.hidden,[]);assert.equal(state.type,'candle');assert.equal(state.count,initialCount);assert.equal(state.end,state.total);assert.equal(await page.locator('.sb-chart-drawing').count(),2);assert.match(await page.locator('.sb-chart-drawing text').first().textContent(),/보존 메모/);
  assert.equal(await page.evaluate(()=>window.__chartFetches.length),calls);assert.equal(await page.evaluate(()=>localStorage.getItem('stockbook:chart:drawings:v1:000001:월봉')),saved);assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-app-data')),'keep');assert.equal(await page.evaluate(()=>localStorage.getItem('stockbook:chart:visibility:v1:000002:월봉')),'["ma:5"]');const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem('stockbook:chart:settings:v1')));assert.equal(settings.month,undefined);assert.deepEqual(settings.day.periods,[3,7]);
  await page.locator('#chartPeriod').selectOption('3m');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.viewRange==='3m');assert.deepEqual(await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.periods),[1,5,19,6,9]);
  await page.locator('#chartCycle').selectOption('day');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='day'&&document.getElementById('chartViewport').chartEvidence?.periods.length===2);assert.equal(await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.bbPeriod),20);
  await page.getByRole('button',{name:'차트 설정 초기화',exact:true}).click();const daily=await page.locator('#chartViewport').evaluate(h=>h.chartEvidence);assert.deepEqual(daily.periods,[5,10,20,60,120,200,350,480]);assert.equal(daily.bbPeriod,40);assert.equal(daily.bbMultiplier,1.9);assert.equal(daily.bbShift,25);assert.deepEqual(daily.cloudPeriods,[5,10]);
  await page.reload();await page.evaluate(()=>window.__context({code:'000001',name:'초기화 복원 검증',barCycle:'month',period:'6m',follow:false}));await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='month');assert.equal(await page.getByRole('combobox',{name:'차트 유형',exact:true}).inputValue(),'candle');assert.deepEqual(await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.periods),[1,5,19,6,9]);await page.getByRole('button',{name:'불러오기',exact:true}).click();assert.equal(await page.locator('.sb-chart-drawing').count(),2);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('hollow bodies are empty for both directions and scrolling stays separate from drag/scale zoom in every chart type',async()=>{
 const h=await setup(),{page}=h;
 try{
  await page.locator('#chartCycle').selectOption('day');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='day');
  const scroll=page.getByRole('slider',{name:'차트 가로 스크롤',exact:true}),scale=page.getByRole('slider',{name:'차트 축척',exact:true}),type=page.getByRole('combobox',{name:'차트 유형',exact:true});
  const state=()=>page.locator('#chartViewport').evaluate(h=>{const m=StockBookCharts.controller(h).getModel();return {count:m.count,offset:m.offset,end:m.end,total:m.all.length,position:m.scrollPosition,scroll:h.querySelector('[aria-label="차트 가로 스크롤"]').value,scale:h.querySelector('[aria-label="차트 축척"]').value};});
  for(const kind of ['candle','hollow','volume','profile']){
   await type.selectOption(kind);await page.getByRole('button',{name:'처음 보기',exact:true}).click();const initial=await state();
   if(kind==='hollow'){const bars=await page.locator('#chartViewport').evaluate(h=>{const rows=StockBookCharts.controller(h).getModel().rows;return [...h.querySelectorAll('.candle')].map((el,i)=>({empty:el.getAttribute('fill')==='none',up:rows[i].close>=rows[i].open}));});assert.ok(bars.some(b=>b.up));assert.ok(bars.some(b=>!b.up));assert.ok(bars.every(b=>b.empty));}
   await scroll.scrollIntoViewIfNeeded();const box=await scroll.boundingBox();await scroll.click({position:{x:box.width/2,y:box.height/2}});const middle=await state();assert.equal(middle.count,initial.count);assert.equal(middle.scale,initial.scale);assert.ok(middle.position>.4&&middle.position<.6);
   await scale.press('ArrowRight');let zoomed=await state();assert.ok(zoomed.count<middle.count);assert.equal(zoomed.scroll,middle.scroll);assert.equal(zoomed.position,middle.position);
   const p=await point(page,2,40);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+100,p.y,{steps:5});const dragged=await state();assert.ok(dragged.count<zoomed.count);assert.equal(dragged.scroll,middle.scroll);await page.mouse.wheel(0,-120);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual(await state(),dragged);await page.mouse.up();
   await page.mouse.wheel(0,-120);await page.waitForFunction(offset=>StockBookCharts.controller(document.getElementById('chartViewport')).getModel().offset<offset,dragged.offset);let moved=await state();assert.equal(moved.count,dragged.count);assert.equal(moved.scale,dragged.scale);
   const prior=moved;await page.mouse.wheel(120,0);await page.waitForFunction(offset=>StockBookCharts.controller(document.getElementById('chartViewport')).getModel().offset>offset,prior.offset);moved=await state();assert.equal(moved.scale,prior.scale);assert.equal(moved.count,prior.count);
   await scale.hover();await page.mouse.wheel(0,-120);await page.waitForFunction(offset=>StockBookCharts.controller(document.getElementById('chartViewport')).getModel().offset<offset,moved.offset);const overScale=await state();assert.equal(overScale.count,moved.count);assert.equal(overScale.scale,moved.scale);
   await scroll.hover();await page.mouse.wheel(0,120);await page.waitForFunction(offset=>StockBookCharts.controller(document.getElementById('chartViewport')).getModel().offset>offset,overScale.offset);const beforeFull=await state();assert.equal(beforeFull.count,overScale.count);assert.equal(beforeFull.scale,overScale.scale);
   await scale.press('Home');assert.equal(await scroll.isDisabled(),true);assert.equal((await state()).scroll,beforeFull.scroll);await scale.press('End');assert.equal((await state()).count,1);assert.equal((await state()).scroll,beforeFull.scroll);await page.getByRole('button',{name:'최신',exact:true}).click();assert.equal((await state()).end,initial.total);
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('indicator heights drag independently, resize proportionally, persist and reset without changing data',async()=>{
 const h=await setup(),{page}=h;
 try{
  const host=page.locator('#chartViewport'),price=host.locator('[data-chart-id="chart"]'),volume=host.locator('[data-chart-id="pressureChart"]');
  async function height(el){return (await el.boundingBox()).height;}
  async function drag(handle,dy){await handle.scrollIntoViewIfNeeded();const b=await handle.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2+dy,{steps:6});await page.mouse.up();}
  const before=await height(price),volBefore=await height(volume),evidence=await host.evaluate(h=>({stock:h.chartEvidence.stockCode,count:h.chartEvidence.displayed}));
  await drag(host.getByRole('separator',{name:'가격 차트 높이',exact:true}),90);
  assert.ok(await height(price)>before+70);assert.equal(await height(volume),volBefore);
  await drag(host.getByRole('separator',{name:'거래량 구간 높이',exact:true}),35);assert.ok(await height(volume)>volBefore+25);
  const ratio=await host.evaluate(h=>h.querySelector('[data-chart-id="chart"]').clientHeight/h.clientHeight);
  await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(120);
  const resized=await host.evaluate(h=>h.querySelector('[data-chart-id="chart"]').clientHeight/h.clientHeight);assert.ok(Math.abs(resized-ratio)<.02);
  assert.deepEqual(await host.evaluate(h=>({stock:h.chartEvidence.stockCode,count:h.chartEvidence.displayed})),evidence);
  await page.reload();await page.evaluate(()=>window.__context({code:'000001',name:'합성 검증 종목',period:'6m',barCycle:'month',follow:true}));await page.waitForFunction(()=>document.getElementById('chartViewport').querySelector('.sb-chart-resizers'));
  const restored=await host.evaluate(h=>h.querySelector('[data-chart-id="chart"]').clientHeight/h.clientHeight);assert.ok(Math.abs(restored-ratio)<.02);
  const handle=host.getByRole('separator',{name:'가격 차트 높이',exact:true});const current=await height(price);await handle.focus();await handle.press('ArrowUp');assert.ok(await height(price)<current-10);
  await handle.dblclick();await page.waitForFunction(()=>{const host=document.getElementById('chartViewport'),expected=Math.min(600,Math.max(240,host.clientHeight*.6))*.7;return Math.abs(host.querySelector('[data-chart-id="chart"]').getBoundingClientRect().height-expected)<1;});
  await page.locator('#chartCycle').selectOption('day');await page.waitForFunction(()=>document.getElementById('chartViewport').chartEvidence?.barCycle==='day');assert.equal(await host.locator('.sb-chart-resizers').count(),1);
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('workspace split keeps per-tab proportions, clamps small windows and compact indicator split preserves candle alignment',async()=>{
 const h=await setup(),{page}=h;
 try{
  await page.setViewportSize({width:1600,height:1000});await page.goto(page.url().replace('/chart.html','/index.html'));
  await page.evaluate(()=>{state.watchlist=[{ticker:'000001',name:'합성 검증 종목',price:1000,quoteAt:Date.now()}];window._dockSel='000001';window._MDI.show('watchlist');sbWorkTab('ord');});await page.waitForFunction(()=>document.getElementById('sbEmbeddedChart').chartEvidence?.stockCode==='000001');
  const split=page.getByRole('separator',{name:'차트와 하단 작업 패널 높이',exact:true}),ctx=page.locator('#dockCtx'),work=page.locator('#mdi-panel-trading');
  const before=(await ctx.boundingBox()).height,b=await split.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+5);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+75,{steps:6});await page.mouse.up();await page.waitForTimeout(100);
  const after=(await ctx.boundingBox()).height;assert.ok(after>before+50);assert.ok((await work.boundingBox()).height>=178);
  const fraction=await page.locator('#mdiWorkspace').evaluate(e=>Number(JSON.parse(localStorage.getItem('stockbook:workspace:heights:v1')).ord));assert.ok(fraction>0&&fraction<1);
  await page.evaluate(()=>sbWorkTab('cash'));await page.waitForFunction(()=>!document.getElementById('mdiWorkspace').classList.contains('sb-user-split'));assert.equal(await page.locator('#mdiWorkspace').evaluate(e=>e.classList.contains('sb-user-split')),false);
  await page.evaluate(()=>sbWorkTab('ord'));await page.waitForTimeout(80);assert.ok(Math.abs((await ctx.boundingBox()).height-after)<2);
  const host=page.locator('#sbEmbeddedChart'),volume=host.locator('[data-chart-id="pressureChart"]'),price=host.locator('[data-chart-id="chart"]'),vol=(await volume.boundingBox()).height;
  const divider=host.getByRole('separator',{name:'가격·거래량 구간 높이',exact:true}),d=await divider.boundingBox();await page.mouse.move(d.x+d.width/2,d.y+5);await page.mouse.down();await page.mouse.move(d.x+d.width/2,d.y-15,{steps:4});await page.mouse.up();assert.ok((await volume.boundingBox()).height>vol+10);assert.ok((await price.boundingBox()).height>=45);
  const aligned=await host.evaluate(h=>{const a=h.querySelector('.candle').getBoundingClientRect(),b=h.querySelector('.pressure-volume').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1.5;});assert.equal(aligned,true);
  const proportions=await host.evaluate(h=>{const ctx=document.getElementById('dockCtx').clientHeight,work=document.getElementById('mdi-panel-trading').clientHeight,p=h.querySelector('[data-chart-id="chart"]').clientHeight,v=h.querySelector('[data-chart-id="pressureChart"]').clientHeight;return {workspace:ctx/(ctx+work),volume:v/(v+p)};});
  await page.setViewportSize({width:1600,height:1200});await page.waitForTimeout(120);
  const grown=await host.evaluate(h=>{const ctx=document.getElementById('dockCtx').clientHeight,work=document.getElementById('mdi-panel-trading').clientHeight,p=h.querySelector('[data-chart-id="chart"]').clientHeight,v=h.querySelector('[data-chart-id="pressureChart"]').clientHeight;return {workspace:ctx/(ctx+work),volume:v/(v+p)};});
  assert.ok(Math.abs(proportions.workspace-grown.workspace)<.02);assert.ok(Math.abs(proportions.volume-grown.volume)<.02);
  await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(120);assert.ok((await work.boundingBox()).height>=175);assert.ok((await ctx.boundingBox()).height>=215);
  await split.dblclick();assert.equal(await page.locator('#mdiWorkspace').evaluate(e=>e.classList.contains('sb-user-split')),false);
  await page.evaluate(()=>window._MDI.show('news'));await page.waitForTimeout(50);assert.equal(await split.isVisible(),false);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('touch drags the price-height separator without zooming or panning candles',async()=>{
 const h=await setup(true),{page}=h;
 try{
  const handle=page.getByRole('separator',{name:'가격 차트 높이',exact:true});await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
  const before=await page.locator('[data-chart-id="chart"]').boundingBox(),count=await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.displayed),session=await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+5,id:1}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:box.y+65,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok((await page.locator('[data-chart-id="chart"]').boundingBox()).height>before.height+40);assert.equal(await page.locator('#chartViewport').evaluate(h=>h.chartEvidence.displayed),count);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('default lower pane takes thirty percent and expanded bars keep text size, bounds and time anchors',async()=>{
 const h=await setup(),{page}=h;
 try{
  const host=page.locator('#chartViewport');
  const geometry=()=>host.evaluate(h=>{const p=h.querySelector('[data-chart-id="chart"]').getBoundingClientRect(),svg=h.querySelector('[data-chart-id="pressureChart"]'),v=svg.getBoundingClientRect(),label=svg.querySelector('text'),m=StockBookCharts.controller(h).getModel();return {price:p.height,volume:v.height,share:v.height/(p.height+v.height),viewHeight:svg.viewBox.baseVal.height,font:label?Number(label.getAttribute('font-size'))*label.getScreenCTM().d:null,clipped:[...svg.querySelectorAll('.pressure-volume,.pressure-estimate')].some(r=>r.getBoundingClientRect().bottom>v.bottom+.5),count:m.count,end:m.end,position:m.scrollPosition};});
  await page.waitForFunction(()=>{const svg=document.querySelector('[data-chart-id="pressureChart"]');return Math.abs(svg.viewBox.baseVal.height-svg.getBoundingClientRect().height)<1;});
  const initial=await geometry();assert.ok(Math.abs(initial.share-.3)<.01);assert.ok(initial.volume>100);assert.ok(Math.abs(initial.font-12)<.1);
  await page.locator('[data-tool="horizontal"]').click();await clickPoint(page,2,300);const drawing=await host.locator('.sb-chart-drawing').innerHTML();
  const divider=host.getByRole('separator',{name:'거래량 구간 높이',exact:true});await divider.scrollIntoViewIfNeeded();await divider.press('ArrowDown');await divider.press('ArrowDown');await divider.press('ArrowDown');
  await page.waitForFunction(()=>{const svg=document.querySelector('[data-chart-id="pressureChart"]');return Math.abs(svg.viewBox.baseVal.height-svg.getBoundingClientRect().height)<1;});
  const expanded=await geometry();assert.ok(expanded.volume>initial.volume+40);assert.equal(expanded.price,initial.price);assert.ok(Math.abs(expanded.font-initial.font)<.1);assert.equal(expanded.clipped,false);for(const field of ['count','end','position'])assert.equal(expanded[field],initial[field]);assert.equal(await host.locator('.sb-chart-drawing').innerHTML(),drawing);
  await page.getByRole('button',{name:'차트 설정 초기화',exact:true}).click();await page.waitForFunction(()=>{const h=document.getElementById('chartViewport'),p=h.querySelector('[data-chart-id="chart"]').clientHeight,v=h.querySelector('[data-chart-id="pressureChart"]').clientHeight;return Math.abs(v/(p+v)-.3)<.01;});assert.equal(await host.locator('.sb-chart-drawing').count(),1);
  await page.setViewportSize({width:1600,height:1200});await page.goto(h.base+'/index.html');await page.evaluate(()=>{state.watchlist=[{ticker:'000001',name:'합성 검증 종목',price:1000,quoteAt:Date.now()}];window._dockSel='000001';window._MDI.show('watchlist');});await page.waitForFunction(()=>{const h=document.getElementById('sbEmbeddedChart'),p=h.querySelector('[data-chart-id="chart"]'),v=h.querySelector('[data-chart-id="pressureChart"]');return h.chartEvidence?.stockCode==='000001'&&Math.abs(v.clientHeight/(p.clientHeight+v.clientHeight)-.3)<.01&&Math.abs(v.viewBox.baseVal.height-v.clientHeight)<1;});
  const compact=page.locator('#sbEmbeddedChart'),before=await compact.evaluate(h=>{const m=StockBookCharts.controller(h).getModel();return {count:m.count,end:m.end,position:m.scrollPosition};});
  const split=compact.getByRole('separator',{name:'가격·거래량 구간 높이',exact:true});await split.press('ArrowUp');await split.press('ArrowUp');
  await page.waitForFunction(()=>{const h=document.getElementById('sbEmbeddedChart'),v=h.querySelector('[data-chart-id="pressureChart"]');return Math.abs(v.viewBox.baseVal.height-v.clientHeight)<1;});
  const after=await compact.evaluate(h=>{const m=StockBookCharts.controller(h).getModel(),v=h.querySelector('[data-chart-id="pressureChart"]'),p=h.querySelector('[data-chart-id="chart"]');return {state:{count:m.count,end:m.end,position:m.scrollPosition},share:v.clientHeight/(p.clientHeight+v.clientHeight),clipped:[...v.querySelectorAll('rect')].some(r=>r.getBoundingClientRect().bottom>v.getBoundingClientRect().bottom+.5)};});assert.ok(after.share>.33);assert.equal(after.clipped,false);assert.deepEqual(after.state,before);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
