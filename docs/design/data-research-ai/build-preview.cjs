'use strict';
// Bundle the real renderer with explicitly simulated IPC; no network or model calls.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const snapshot=require(path.join(root,'src/chart/snapshot.cjs')).readSnapshot('005930',root);
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<head>','<head><script>window.fetch=async()=>{throw Error("디자인 미리보기: 외부 요청 없음");};</script>');
html=html.replace(/<link\b[^>]*href="https:\/\/[^>]*>\s*/g,'');
const icon='data:image/png;base64,'+fs.readFileSync(path.join(root,'icon-192.png')).toString('base64');
html=html.replaceAll('./icon-192.png',icon);
html=html.replace(/<link\b[^>]*href="(src\/[^\"]+\.css)"[^>]*>/g,(_,file)=>'<style>'+fs.readFileSync(path.join(root,file),'utf8')+'</style>');
html=html.replace(/<script src="(src\/[^\"]+\.js)"><\/script>/g,(_,file)=>'<script>\n'+fs.readFileSync(path.join(root,file),'utf8').replace(/<\/script/gi,'<\\/script')+'\n</script>');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{
 const snapshot=${JSON.stringify(snapshot).replaceAll('<','\\u003c')};
 let exampleResponse=false;
 const source='https://m.stock.naver.com/domestic/stock/005930/total';
 const bundle=period=>({code:'005930',name:'삼성전자',period,since:period==='1m'?'2026-10-07':period==='1y'?'2025-11-07':'2026-08-07',collectedAt:'2026-11-07T00:00:00Z',missing:['portfolioStructure','decisionJournal'],evidence:[
  {id:'profile',title:'기업 기본정보',status:'received',asOf:'2026-11-06',fetchedAt:'2026-11-07',url:source,data:{name:'삼성전자',market:'KOSPI',note:'이 페이지는 디자인용 예시 자료입니다. 실시간 기업정보 조회가 아닙니다.'}},
  {id:'industry',title:'업종 분류',status:'received',asOf:null,fetchedAt:'2026-11-07',url:source,data:{industry:'반도체와 반도체장비 · 예시',note:'기준일 미제공 상태의 표시 예시 · 테마와 별도 분류'}},
  {id:'finance',title:'공시 재무',status:'received',asOf:'2025',fetchedAt:'2026-11-07',url:'https://m.stock.naver.com/api/stock/005930/finance/annual',data:{rows:[{metric:'매출액 · 화면 검토용 가상 값',unit:null,values:[{period:'2024',value:'100',estimate:false},{period:'2025',value:'110',estimate:false}]},{metric:'영업이익률 · 화면 검토용 가상 값',unit:'%',values:[{period:'2024',value:'8.0',estimate:false},{period:'2025',value:'9.0',estimate:false}]}],note:'금액 단위가 없는 자료를 임의로 억원으로 표시하지 않습니다. 숫자는 UI 검토용이며 투자 근거가 아닙니다.'}},
  {id:'news',title:'종목 뉴스',status:'received',asOf:'2026-11-07',fetchedAt:'2026-11-07',url:source,data:{rows:[{title:'[기사 표시 예시] 실적·사업 관련 원문을 확인합니다',source:'출처 표시 예시',time:'2026-11-07',url:source,summary:'실제 기사 본문이 아닙니다. 받은 요약과 원문 이동 경로를 구분하는 디자인 예시입니다.'}]}},
 ]});
 window.electronAPI={
  aiStatus:async()=>exampleResponse?{ok:true,configured:true,providers:[{id:'claude',connected:true}]}:{ok:true,configured:false,providers:[],message:'HOME 연동 경로 확인 필요 · 미리보기에서는 연결하지 않습니다.'},
  aiResearch:async opts=>opts.code==='005930'?{ok:true,bundle:bundle(opts.period)}:{ok:false,error:'디자인 예시는 삼성전자에만 준비되어 있습니다.'},
  aiAnalyze:async opts=>({ok:true,provider:'claude',pattern:opts.pattern,createdAt:'2026-11-07T00:00:00Z',bundle:bundle(opts.period),result:{summary:'[응답 형식 예시 · 모델 호출 없음] 자료의 범위와 단위를 확인한 뒤 판단합니다.',interpretations:[{text:'재무와 뉴스를 함께 비교하는 해석 영역입니다. 예시 숫자로 기업 전망을 판단하지 않습니다.',evidenceIds:['finance','news']}],risks:[{text:'재무 금액 단위와 업종 기준일이 빠져 있습니다. 개인 포트폴리오와 판단 기록도 포함되지 않았습니다.',evidenceIds:['finance','industry']}],options:[{title:'자료를 보완하며 관찰',reason:'단위와 기준일 확인이 먼저입니다.',risk:'누락된 자료로 전체 상황을 설명할 수 없습니다.',reviewWhen:'원문 단위 확인 또는 새 공시 수신 시',evidenceIds:['finance']}],missing:['portfolioStructure','decisionJournal'],questions:['나의 기존 투자 원칙과 일치하는가?']}}),
  aiCancel:async()=>({ok:true,requested:true,confirmed:true}),getChartSnapshot:async code=>code==='005930'?snapshot:{ok:false},
  fetchQuote:async()=>null,fetchMarketTickers:async()=>null,fetchNaverStocks:async()=>({ok:false}),fetchNews:async()=>({ok:true,items:[]}),
  loadState:async()=>null,saveState:async()=>{},checkApiKey:async()=>false,loadApiKey:async()=>null,setChartContext:async()=>({ok:true}),openChartWindow:async()=>({ok:false}),onRealtimePrice:()=>{},onWsStatus:()=>{}
 };
 state.watchlist=[{ticker:'005930',name:'삼성전자',price:snapshot.candles.at(-1).close,quoteAt:0}];
 state.portfolio=[];window._dockSel='005930';dockCtxRender();setTheme('light');
 const bar=document.createElement('div');bar.className='sb-preview-tools';
 const note=document.createElement('span');note.textContent='디자인 검토용 · 예시 자료 · 실제 HOME/모델 호출 없음';bar.append(note);
 const add=(label,fn)=>{const b=document.createElement('button');b.className='sb-btn sb-btn--sm';b.textContent=label;b.onclick=fn;bar.append(b);};
 add('리서치 화면',()=>openStockDrawer('005930','삼성전자'));
 add('HOME 미연결',async()=>{exampleResponse=false;closeAnalysisDrawer();StockBookAI.select(null);StockBookAI.select({code:'005930',name:'삼성전자'});await StockBookAI.checkHome();document.getElementById('sbAnalysis').scrollIntoView({block:'nearest'});});
 add('응답 형식 예시',async()=>{exampleResponse=true;closeAnalysisDrawer();await StockBookAI.checkHome();document.getElementById('sbAIRun').click();document.getElementById('sbAnalysis').scrollIntoView({block:'nearest'});});
 add('테마 전환',()=>setTheme(document.body.classList.contains('light-mode')?'dark':'light'));
 document.body.append(bar);await openStockDrawer('005930','삼성전자');await new Promise(resolve=>setTimeout(resolve,80));_allStockRaw.KOSPI=[{code:'005930',name:'삼성전자',price:snapshot.candles.at(-1).close,industry:'보존 자료 · 실시간 아님'}];filterAndRenderAll();document.getElementById('allStockStatus').textContent='디자인 예시 · 보존 자료 · 실시간 아님';window.designPreviewReady=true;
});`;
html=html.replace('</head>','<style>.sb-preview-tools{position:fixed;bottom:0;left:0;right:0;z-index:100000;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px;background:var(--sb-panel);color:var(--sb-text-2);border-top:1px solid var(--sb-border);font-size:11px}.sb-preview-tools>span{margin-right:auto}#analysisDrawerBody{padding-bottom:80px}</style></head>');
html=html.replace('</body>','<script>'+boot.replace(/<\/script/gi,'<\\/script')+'</script></body>');
if(/<script src=|href="src\//.test(html))throw Error('Unbundled resource');
html=html.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'');
fs.writeFileSync(path.join(__dirname,'preview.html'),html);
console.log('Built standalone design preview',Buffer.byteLength(html),'bytes');
