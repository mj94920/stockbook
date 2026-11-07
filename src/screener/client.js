(function(root){
 'use strict';
 const engine=root.StockBookScreener,expressions=root.StockBookScreenExpression;
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 const button=(text,fn)=>{const node=el('button',text,'sb-btn sb-btn--sm');node.type='button';node.onclick=fn;return node;};
 const select=(label,entries)=>{const node=el('select',undefined,'sb-select');node.setAttribute('aria-label',label);for(const [value,text]of entries){const item=el('option',text);item.value=value;node.append(item);}return node;};
 const input=(label,value)=>{const node=el('input',undefined,'sb-input');node.type='number';node.min='0';node.value=value;node.setAttribute('aria-label',label);return node;};
 const field=(label,node)=>{const wrap=el('label',undefined,'sb-screen-field');wrap.append(el('span',label),node);return wrap;};
 const number=value=>Number.isFinite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:2}):'없음';
 const description=c=>{
  const op=({crossUp:'상향 돌파',crossDown:'하향 돌파',above:'현재 위',below:'현재 아래',gte:'이상',enter:'아래→양운 내부 진입',breakout:'양운 상단 돌파',bullish:'현재 양운'})[c.op];
  return c.id==='sma'?`단순 ${c.fast}·${c.slow}봉 · ${op}`:c.id==='rsi'?`Wilder · ${c.period}봉 · 기준선 ${c.level} · ${op}`:c.id==='bb'?`${c.period}봉 · ${c.multiplier}배 · 표시 이동 ${c.shift}봉 · ${op}`:c.id==='ichimoku'?`${c.conversion}·${c.base}·${c.span}봉 · 선행 ${c.displacement}봉 · ${op}`:`${number(c.threshold)}${c.id==='volume'?'주':'원'} ${op}`;
 };
 function windowView(window,pointState){
  const config=window.config,details=el('details'),label=({gte:'이상',lte:'이하',eq:'같음'})[config.operator];
  details.append(el('summary',config.kind==='count'?`평가 기준봉 포함 ${config.span}봉 중 ${config.threshold}회 ${label}`:`평가 기준봉 포함 최근 ${config.span}봉 연속 충족`));
  details.append(el('p',`충족 ${window.matched}봉 · 미충족 ${window.unmatched}봉 · 판정 불가 ${window.unknown}봉 · 가능한 충족 횟수 ${window.lowerBound}~${window.upperBound}회`),el('p','기준봉 자체 판정: '+({match:'충족','no-match':'미충족',unknown:'판정 불가'})[pointState]));
  let rendered=false;details.ontoggle=()=>{if(!details.open||rendered)return;rendered=true;for(const sample of window.samples)details.append(el('p',`기준에서 ${sample.ago}봉 전 · ${sample.date||'이력 없음'} · `+({match:'충족','no-match':'미충족',unknown:'판정 불가'})[sample.state]+` · 값 ${number(sample.value)} / 기준 ${number(sample.reference)} · ${sample.reason}`));if(window.omittedSamples)details.append(el('small',`전체 ${config.span}봉을 계산했습니다. 표본 표시는 ${window.samples.length}봉이며 ${window.omittedSamples}봉의 개별 표시는 생략했습니다.`));};
  return details;
 }
 let dialog,sequence=0;
 function open(){
  if(!engine||!expressions)return;
  if(dialog?.open){dialog.focus();return;}
  dialog?.remove();dialog=el('dialog',undefined,'sb-screen-dialog');dialog.setAttribute('aria-label','지표 조건검색');
  const header=el('header');header.append(el('h2','지표 조건검색'),button('닫기',()=>dialog.close()));dialog.append(header);
  dialog.append(el('p','차트와 같은 계산식으로 수신 자료를 검색합니다. 결과는 투자 후보이며 매매 신호가 아닙니다.','sb-screen-note'));
  const scope=select('검색 대상',[['watch','관심종목'],['loaded','불러온 KOSPI·KOSDAQ 목록']]),join=select('조건 조합',[['all','모두 충족 (AND)'],['any','하나 이상 (OR)']]),mode=select('봉 기준',[['closed','완성 봉 · 마지막 봉 미확정 시 직전 봉'],['latest','최신 봉 · 미확정 가능']]);
  const cycle=select('봉 주기',[['day','일봉'],['week','주봉'],['month','월봉'],['year','연봉']]);
  const options=el('div',undefined,'sb-screen-options');options.append(field('검색 대상',scope),field('봉 주기',cycle),field('조건 조합',join),field('봉 기준',mode));dialog.append(options,el('p','지표 기간의 단위는 선택한 봉입니다. RSI 기본은 Wilder 14봉·기준선 50입니다. BB는 현재 차트와 같은 일봉 설정만 지원합니다. 일목 기본은 9·26·52, 선행 이동 26봉이며 조정 가능합니다. 일목은 우물·산 및 기존 MA 구름과 별개입니다. 주·월·연봉은 마지막 봉을 미확정으로 취급합니다.','sb-screen-note'));
  const rules=el('div',undefined,'sb-screen-rules'),editors=[];dialog.append(rules);
  const logic=el('input',undefined,'sb-input');logic.type='text';logic.maxLength=500;logic.setAttribute('aria-label','중첩 논리식');logic.placeholder='예: (A AND B) OR NOT C';dialog.append(field('중첩 논리식 · 비우면 위의 AND/OR 조합 사용',logic));
  dialog.append(el('p','NOT은 판정 불가를 그대로 유지합니다. 조건별 봉전은 선택한 최신/완성 기준봉에서 뒤로 셉니다. 완성 0봉전은 마지막 봉이 미확정이면 최신 1봉전입니다. 기간 판정은 그 평가 봉을 포함해 뒤로 셉니다. 횟수는 충족한 봉의 수이고 연속 조건과 다릅니다.','sb-screen-note'));
  function add(){if(editors.length>=12)return;const key=[...'ABCDEFGHIJKL'].find(k=>!editors.some(e=>e.key===k));const row=el('div',undefined,'sb-screen-rule'),id=select('지표',Object.entries(engine.registry).map(([key,value])=>[key,value.label])),op=select('판정',[]),params=el('div',undefined,'sb-screen-params');id.value='volume';let fields={};const leafCycle=select(key+' 조건 주기',[['','공통 주기'],['day','일봉'],['week','주봉'],['month','월봉'],['year','연봉']]),leafMode=select(key+' 평가 기준',[['','공통 기준'],['closed','완성 봉'],['latest','최신 봉']]),barsAgo=input(key+' 봉전',0);barsAgo.max='1200';
   const windowKind=select(key+' 기간 판정',[['point','선택 봉 하나'],['count','기간 내 충족 횟수'],['streak','최근 연속 충족']]),span=input(key+' 평가 구간',20),countOp=select(key+' 횟수 비교',[['gte','이상'],['lte','이하'],['eq','같음']]),count=input(key+' 충족 횟수',1),windowBox=el('div',undefined,'sb-screen-window');span.min='1';span.max='1200';count.max='1200';
   const countOpField=field('횟수 비교',countOp),countField=field('충족 횟수',count);windowBox.append(field('구간 길이 (봉)',span),countOpField,countField);windowBox.hidden=true;
   windowKind.onchange=()=>{windowBox.hidden=windowKind.value==='point';countOpField.hidden=countField.hidden=windowKind.value!=='count';};
   const editor={key,window(){if(windowKind.value==='point')return undefined;const config={kind:windowKind.value,span:span.value.trim()===''?NaN:Number(span.value)};if(config.kind==='count'){config.operator=countOp.value;config.threshold=count.value.trim()===''?NaN:Number(count.value);}return config;},time(cycle,mode){return {cycle:leafCycle.value||cycle,mode:leafMode.value||mode,barsAgo:barsAgo.value.trim()===''?NaN:Number(barsAgo.value)};},read(){const value={id:id.value,op:op.value};for(const [key,node]of Object.entries(fields))value[key]=node.value.trim()===''?NaN:Number(node.value);if(id.value==='rsi')value.method='wilder';return engine.validate(value);}};
   const remove=button('삭제',()=>{if((logic.value.toUpperCase().match(/\b[A-L]\b/g)||[]).includes(key)){status.textContent=key+'를 참조하는 논리식을 먼저 수정하세요.';return;}editors.splice(editors.indexOf(editor),1);row.remove();});
   function render(){params.replaceChildren();op.replaceChildren();fields={};const crossing=['sma','bb','rsi'].includes(id.value);for(const [key,text]of id.value==='ichimoku'?[['enter','아래→양운 내부 진입'],['breakout','양운 상단 상향 돌파'],['bullish','현재 양운']]:crossing?[['crossUp','상향 돌파'],['crossDown','하향 돌파'],['above','현재 위'],['below','현재 아래']]:[['gte','이상']]){const item=el('option',text);item.value=key;op.append(item);}
    const specs=id.value==='sma'?[['fast','단기 기간',5],['slow','장기 기간',10]]:id.value==='ichimoku'?[['conversion','전환 기간 (봉)',9],['base','기준 기간 (봉)',26],['span','스팬B 기간 (봉)',52],['displacement','선행 표시 이동 (봉)',26]]:id.value==='rsi'?[['period','RSI 기간 (봉)',14],['level','RSI 기준선',50]]:id.value==='bb'?[['period','BB 기간',40],['multiplier','표준편차 배수',1.9],['shift','표시 이동 봉수',25]]:[['threshold',id.value==='volume'?'거래량 기준 (주)':'거래대금 기준 (원)',1000000]];
    for(const [key,label,value]of specs){const node=input(label,value);if(key==='multiplier')node.step='0.1';fields[key]=node;params.append(field(label,node));}
   }
   id.onchange=render;row.dataset.conditionKey=key;row.append(el('strong',key),field('지표',id),field('판정',op),params,field('조건 주기',leafCycle),field('조건 기준',leafMode),field('봉전',barsAgo),field('기간 판정',windowKind),remove,windowBox);rules.append(row);editors.push(editor);render();
  }
  add();const actions=el('div',undefined,'sb-screen-actions'),run=button('검색 실행',scan),stop=button('검색 중단',cancel);stop.disabled=true;actions.append(button('조건 추가',add),run,stop);dialog.append(actions);
  const pending=el('details');pending.append(el('summary','계산식 확정이 필요한 지표'));for(const item of engine.pending)pending.append(el('p',item.label+' · '+item.reason));dialog.append(pending);
  const status=el('p','실행 전 · 최신 자료 여부와 거래일은 결과에서 확인하세요.','sb-screen-note');status.setAttribute('role','status');dialog.append(status);
  const resultFilter=select('결과 표시',[['match','충족 종목만'],['all','전체 검사 결과'],['unknown','판정 불가만']]);dialog.append(field('결과 표시',resultFilter));
  const output=el('div',undefined,'sb-screen-results');dialog.append(output);resultFilter.onchange=()=>{for(const item of output.children)item.hidden=resultFilter.value!=='all'&&item.dataset.state!==resultFilter.value;};
  let running=false;
  function cancel(){if(!running)return;sequence++;running=false;run.disabled=false;stop.disabled=true;status.textContent='중단했습니다. 진행 중인 자료 요청은 종료될 수 있으나 추가 결과는 반영하지 않습니다.';}
  dialog.addEventListener('close',cancel);
  async function scan(){
   if(running)return;let conditions,document,active;try{conditions=editors.map(e=>e.read());if(!conditions.length)throw Error('조건을 추가하세요.');document=expressions.migrateLegacy(conditions,{join:join.value,cycle:cycle.value,mode:mode.value});document.conditions.forEach((r,i)=>{r.key=editors[i].key;r.time=editors[i].time(cycle.value,mode.value);const window=editors[i].window();if(window)r.window=window;});document.root={type:join.value,children:document.conditions.map(r=>({type:'ref',key:r.key}))};if(logic.value.trim())document.root=expressions.parseLogic(logic.value,editors.map(e=>e.key));document=expressions.validateDocument(document);const used=expressions.usedKeys(document);active=document.conditions.filter(r=>used.includes(r.key));}catch(error){status.textContent=error.message;return;}
   if(!root.electronAPI?.getChartData&&!root.electronAPI?.getChartSnapshot){status.textContent='종목 일봉 조회가 가능한 데스크톱 연결이 필요합니다.';return;}
   const raw=scope.value==='watch'?(root.state?.watchlist||typeof state!=='undefined'&&state.watchlist||[]):typeof _allStockRaw!=='undefined'?[...(_allStockRaw.KOSPI||[]),...(_allStockRaw.KOSDAQ||[])]:[];
   const stocks=[...new Map(raw.filter(s=>/^\d{6}$/.test(s.ticker||s.code||'')).map(s=>[s.ticker||s.code,{code:s.ticker||s.code,name:s.name||s.ticker||s.code}])).values()];
   if(!stocks.length){status.textContent='검색할 6자리 종목 목록이 없습니다. 관심종목을 추가하거나 시장 목록을 먼저 불러오세요.';return;}
   if(stocks.length>3000){status.textContent='검색 대상은 한 번에 최대 3,000종목입니다. 관심종목으로 범위를 줄이세요.';return;}
   const token=++sequence;running=true;run.disabled=true;stop.disabled=false;output.replaceChildren();
   let next=0,done=0,matches=0,unknown=0,misses=0;const needMoney=active.some(r=>r.condition.id==='turnover');const sourceCycle=active.some(r=>r.time.cycle==='year')?'year':active[0].time.cycle;
   function progress(){status.textContent=`검사 ${done}/${stocks.length} · 충족 ${matches} · 미충족 ${misses} · 판정 불가 ${unknown} · 6자리 코드의 선택 목록 범위이며 시장 전체·실시간 전수 검색이 아닙니다.`;}
   function show(stock,result,error){const item=el('article',undefined,'sb-screen-result'),head=el('div');head.append(el('strong',stock.name+' '+stock.code),el('span',result?({match:'충족','no-match':'미충족',unknown:'판정 불가'})[result.state]:'자료 조회 실패'));item.append(head);
    if(result){item.append(el('p',(result.date||'조건별 기준일 확인')+' · '+({day:'일봉',week:'주봉',month:'월봉',year:'연봉',mixed:'조건별 주기'})[result.cycle]+' · '+(result.mode==='mixed'?'조건별 봉 기준':result.provisional?'미확정 봉':'완성 봉')+' · '+result.source+' · 수집 '+(result.fetchedAt||'시각 미제공'),'sb-screen-note'));const details=el('details');details.append(el('summary','조건별 실제 값·계산식'));
     for(const row of result.results){const text=el('p',(row.key?row.key+' · ':'')+engine.registry[row.condition.id].label+' · '+(row.time?({day:'일봉',week:'주봉',month:'월봉',year:'연봉'})[row.time.cycle]+' / '+(row.time.mode==='closed'?'완성':'최신')+' '+row.time.barsAgo+'봉전 / '+(row.date||'이력 없음')+' · ':'')+row.reason+' · 값 '+number(row.value)+' / 기준 '+number(row.reference)+' '+row.unit+' · 직전 '+number(row.previousValue)+' / '+number(row.previousReference));if(row.cloud)text.append(el('span',' · 전환 '+number(row.cloud.conversion)+' / 기준 '+number(row.cloud.base)+' / 선행A '+number(row.cloud.spanA)+' / 선행B '+number(row.cloud.spanB)));details.append(text,el('small',row.formula+' · '+description(row.condition)));if(row.window)details.append(windowView(row.window,row.pointState));}item.append(details,button('차트 보기',()=>{root.sbSelectInstrument?.(stock.code,stock.name);dialog.close();}),button('기업 리서치',()=>{dialog.close();root.openStockDrawer?.(stock.code,stock.name);}));
    }else item.append(el('p',error,'sb-screen-note'));item.dataset.state=result?.state||'unknown';item.hidden=resultFilter.value!=='all'&&item.dataset.state!==resultFilter.value;output.append(item);
   }
   async function worker(){while(next<stocks.length&&token===sequence){const stock=stocks[next++];let result,error;try{const api=root.electronAPI,data=api.getChartData?await api.getChartData(stock.code,sourceCycle):await api.getChartSnapshot(stock.code);if(!data?.ok||data.metadata?.stockCode!==stock.code)throw Error();let turnover=null;if(needMoney&&api.getChartTradingValues)try{turnover=await api.getChartTradingValues(stock.code);}catch{}result=expressions.evaluateExpression(data,document,{turnover});}catch{error='일봉을 받지 못했거나 종목·자료 검증에 실패했습니다.';}
    if(token!==sequence)return;done++;if(!result||result.state==='unknown')unknown++;else if(result.state==='match')matches++;else misses++;show(stock,result,error);progress();await new Promise(resolve=>setTimeout(resolve,150));}}
   progress();try{await Promise.all([worker(),worker()]);}finally{if(token===sequence){running=false;run.disabled=false;stop.disabled=true;progress();}}
  }
  document.body.append(dialog);dialog.showModal();
 }
 function mount(){const target=document.getElementById('allStockSearch')?.parentElement;if(target&&!document.getElementById('sbScreenOpen')){const node=button('조건검색',open);node.id='sbScreenOpen';target.append(node);}}
 root.StockBookScreen={open};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})(window);
