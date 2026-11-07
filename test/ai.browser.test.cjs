const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const {createServer}=require('node:http');const {chromium}=require('playwright');
async function app(run){const root=path.resolve(__dirname,'..'),server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://x').pathname);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1400,height:1000}}),base='http://127.0.0.1:'+server.address().port,errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());await page.goto(base+'/index.html');await page.evaluate(()=>{
 window.__aiCalls=[];window.__researchCalls=[];
 window.__bundle=(code='005930',name='검증 기업')=>({code,name,period:'3m',since:'2026-08-01',collectedAt:'2026-11-07T00:00:00Z',missing:[],evidence:[
  {id:'profile',title:'기업 기본정보',status:'received',asOf:'2026-11-06',fetchedAt:'2026-11-07',url:'https://m.stock.naver.com/',data:{name,market:'코스피'}},
  {id:'finance',title:'공시 재무',status:'received',asOf:'2025',fetchedAt:'2026-11-07',url:'https://m.stock.naver.com/',data:{rows:[{metric:'매출액',unit:'억원',values:[{period:'2025',value:'100',estimate:false}]}]}},
  {id:'news',title:'종목 뉴스',status:'received',asOf:'2026-11-06',fetchedAt:'2026-11-07',url:'https://m.stock.naver.com/',data:{rows:[{title:'검증 뉴스',url:'https://n.news.naver.com/mnews/article/001/123456789',time:'2026-11-06',source:'검증 언론',summary:'받은 요약'}]}}
 ]});
 window.__answer=code=>({ok:true,provider:'claude',pattern:'stock',createdAt:'2026-11-07T00:00:00Z',bundle:window.__bundle(code),result:{summary:'검증 분석 <img src=x onerror="window.BAD_AI=true">',interpretations:[{text:'공시와 뉴스를 비교한 해석',evidenceIds:['finance']}],risks:[{text:'자료 한계',evidenceIds:['news']}],options:[{title:'관찰',reason:'추가 자료 확인',risk:'변동성',reviewWhen:'다음 공시',evidenceIds:['finance']}],missing:['treasury10y'],questions:['오늘 계획은?']}});
 window.electronAPI={aiStatus:async()=>({ok:true,configured:true,providers:[{id:'codex',connected:true},{id:'claude',connected:true}]}),aiResearch:async value=>{window.__researchCalls.push(value);return {ok:true,bundle:window.__bundle(value.code)};},aiAnalyze:async value=>{window.__aiCalls.push(value);return window.__answer(value.code);},aiCancel:async()=>({ok:true,requested:true,confirmed:false})};
 state.watchlist=[{ticker:'005930',name:'검증 기업',quoteAt:Date.now()},{ticker:'000660',name:'다른 기업',quoteAt:Date.now()}];window._dockSel='005930';dockCtxRender();
 });await run(page,errors);assert.deepEqual(errors,[]);}finally{await browser?.close();await new Promise(r=>server.close(r));}}

test('AI HOME connection, manual analysis patterns and the source-only corporate research page stay separate',async()=>app(async(page)=>{
 assert.equal(await page.evaluate(()=>window.__aiCalls.length),0);
 await page.locator('#sbAnalysis').getByRole('button',{name:'홈 연결',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('sbAIHomeStatus').textContent.includes('Codex 연결됨'));
 assert.match(await page.locator('#sbAIHomeStatus').innerText(),/Claude 연결됨/);
 await page.evaluate(()=>closeSettings());await page.locator('#sbAIRun').click();
 await page.waitForFunction(()=>document.getElementById('sbAIResult').textContent.includes('검증 분석'));
 assert.equal(await page.locator('#sbAIResult img').count(),0);assert.equal(await page.evaluate(()=>window.BAD_AI),undefined);
 assert.match(await page.locator('#sbAIResult').innerText(),/미국 10년물 국채금리/);assert.match(await page.locator('#sbAIResult').innerText(),/다시 확인할 조건/);
 assert.deepEqual(await page.evaluate(()=>window.__aiCalls[0]),{code:'005930',period:'3m',pattern:'stock',provider:'auto'});
 await page.evaluate(()=>{_allStockRaw.KOSPI=[{code:'005930',name:'검증 기업',price:100}];window._MDIPanelTab('watchlist','as');filterAndRenderAll();});
 assert.equal(await page.locator('#asr-005930').getByRole('button',{name:'리서치',exact:true}).count(),1);
 await page.locator('#asr-005930').getByRole('button',{name:'리서치',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('analysisDrawerBody').textContent.includes('공시 재무'));
 assert.match(await page.locator('#analysisDrawerTitle').innerText(),/기업 리서치/);assert.doesNotMatch(await page.locator('#analysisDrawerBody').innerText(),/검증 분석/);
 assert.match(await page.locator('#analysisDrawerBody').innerText(),/출처 확인/);assert.match(await page.locator('#analysisDrawerBody').innerText(),/공시 기간/);
 await page.locator('#sbResearchPeriod').selectOption('1m');await page.waitForFunction(()=>window.__researchCalls.at(-1).period==='1m');
 await page.waitForTimeout(400);
 assert.equal(await page.locator('#analysisDrawer').evaluate(el=>el.getBoundingClientRect().right<=window.innerWidth+1),true);
 await page.screenshot({path:'/tmp/stockbook-ai-corporate-research.png'});
 await page.evaluate(()=>closeAnalysisDrawer());
 await page.locator('#sbAIPattern').selectOption('quarterly');await page.locator('#sbAIProvider').selectOption('codex');await page.locator('#sbAIRun').click();
 assert.equal(await page.evaluate(()=>window.__aiCalls.at(-1).pattern),'quarterly');assert.equal(await page.evaluate(()=>window.__aiCalls.at(-1).provider),'codex');
}));

test('AI selection changes discard late results and research changes never show a previous company',async()=>app(async(page)=>{
 await page.evaluate(()=>{window.electronAPI.aiAnalyze=opts=>new Promise(resolve=>window.__oldAnalysis=()=>resolve(window.__answer(opts.code)));});
 await page.locator('#sbAIRun').click();await page.waitForFunction(()=>typeof window.__oldAnalysis==='function');
 await page.evaluate(()=>{window._dockSel='000660';dockCtxRender();window.__oldAnalysis();});
 await page.waitForFunction(()=>document.getElementById('sbAIRun').disabled===false);
 assert.doesNotMatch(await page.locator('#sbAIResult').innerText(),/검증 분석/);
 await page.evaluate(()=>{window.electronAPI.aiResearch=opts=>opts.code==='005930'?new Promise(resolve=>window.__oldResearch=()=>resolve({ok:true,bundle:window.__bundle('005930','이전 기업')})):Promise.resolve({ok:true,bundle:window.__bundle('000660','현재 기업')});openStockDrawer('005930','이전 기업');});
 await page.waitForFunction(()=>typeof window.__oldResearch==='function');await page.evaluate(()=>openStockDrawer('000660','현재 기업'));
 await page.waitForFunction(()=>document.getElementById('analysisDrawerTitle').textContent.includes('현재 기업'));await page.evaluate(()=>window.__oldResearch());
 assert.match(await page.locator('#analysisDrawerTitle').innerText(),/현재 기업/);assert.doesNotMatch(await page.locator('#analysisDrawerBody').innerText(),/이전 기업/);
}));

test('unconfigured HOME is shown as a missing app connection, never as missing Claude or a successful login',async()=>app(async(page)=>{
 await page.evaluate(()=>{window.electronAPI.aiStatus=async()=>({ok:true,configured:false,providers:[],message:'홈 연동 경로가 아직 등록되지 않았습니다.'});});
 await page.locator('#sbAnalysis').getByRole('button',{name:'홈 연결',exact:true}).click();await page.waitForFunction(()=>document.getElementById('sbAIHomeStatus').textContent.includes('등록되지'));
 assert.doesNotMatch(await page.locator('#sbAIHomeStatus').innerText(),/Claude.*미설치|로그인 성공/);
}));

test('research design exposes missing dates and units, filters evidence and fits desktop viewports',async()=>app(async(page)=>{
 await page.evaluate(()=>{window.electronAPI.aiResearch=async value=>{const bundle=window.__bundle(value.code,'자료 검토 예시');bundle.missing=['portfolioStructure'];bundle.evidence[0].asOf=null;bundle.evidence[1].data.rows[0].unit=null;bundle.evidence[1].data.rows[0].values[0].value='0';return {ok:true,bundle};};openStockDrawer('005930','자료 검토 예시');});
 await page.waitForFunction(()=>document.querySelector('.sb-data-health'));
 assert.match(await page.locator('.sb-data-health').innerText(),/기준 확인 2/);assert.match(await page.locator('.sb-data-health').innerText(),/미수집 1/);
 assert.match(await page.locator('.sb-research-source[data-source="finance"]').innerText(),/단위 확인 필요/);
 assert.match(await page.locator('.sb-research-source[data-source="profile"]').innerText(),/기준일 확인/);
 await page.locator('.sb-research-nav').getByRole('button',{name:'공시 재무',exact:true}).click();assert.equal(await page.locator('.sb-research-source:visible').count(),1);assert.match(await page.locator('.sb-research-source:visible').innerText(),/2025: 0/);
 await page.locator('.sb-research-nav').getByRole('button',{name:'전체 자료',exact:true}).click();assert.equal(await page.locator('.sb-research-source:visible').count(),3);
 for(const viewport of [{width:1600,height:1000},{width:1024,height:768}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(300);
  const fit=await page.locator('#analysisDrawer').evaluate(drawer=>{const r=drawer.getBoundingClientRect(),body=document.getElementById('analysisDrawerBody');return r.x>=-1&&r.right<=innerWidth+1&&body.scrollWidth<=body.clientWidth+2;});assert.equal(fit,true);
 }
 assert.equal(await page.evaluate(()=>window.__aiCalls.length),0);
}));

test('HOME stays honest and research carries its stock and period into AI review without executing a model',async()=>app(async(page)=>{
 await page.evaluate(async()=>{window.electronAPI.aiStatus=async()=>({ok:true,configured:false,providers:[],message:'HOME 연동 경로 확인 필요'});await StockBookAI.checkHome();});
 assert.equal(await page.locator('#sbAIRun').isDisabled(),true);assert.match(await page.locator('#sbAIConnection').innerText(),/확인 필요/);
 await page.evaluate(()=>openStockDrawer('000660','다른 기업'));await page.waitForFunction(()=>document.querySelector('.sb-data-health'));
 await page.getByRole('button',{name:'이 종목 AI 검토',exact:true}).click();assert.equal(await page.evaluate(()=>window._dockSel),'000660');assert.equal(await page.evaluate(()=>window.__aiCalls.length),0);assert.match(await page.locator('#sbAIDataStatus').innerText(),/필요 자료 확인/);
 await page.locator('#sbAIPeriod').selectOption('1y');assert.match(await page.locator('#sbAIDataStatus').innerText(),/수집 범위가 다릅니다/);
 await page.evaluate(async()=>{window.electronAPI.aiStatus=async()=>({ok:true,configured:true,providers:[{id:'claude',connected:true}]});await StockBookAI.checkHome();});
 await page.locator('#sbAIRun').click();await page.waitForFunction(()=>document.querySelector('#sbAIResult .sb-ai-summary'));
 assert.match(await page.locator('#sbAIResult').innerText(),/AI 해석/);assert.match(await page.locator('#sbAIResult').innerText(),/해석과 가설/);assert.match(await page.locator('#sbAIResult').innerText(),/위험과 자료 한계/);assert.match(await page.locator('#sbAIResult').innerText(),/다시 확인할 조건/);
 assert.equal(await page.evaluate(()=>window.__aiCalls.length),1);
 await page.getByRole('button',{name:'내 판단 기록하기',exact:true}).click();assert.equal(await page.locator('#j_name').inputValue(),'다른 기업');
}));
