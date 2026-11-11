(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../chart/series.js'):root.StockBookChartSeries);if(typeof module==='object'&&module.exports)module.exports=api;else root.StockBookScreener=api;})(typeof window==='object'?window:globalThis,function(series){
 'use strict';
 const registry=Object.freeze({
  sma:{label:'단순이평',formula:'종가 단순평균',version:'close-sma-v1',unit:'원'},
  bb:{label:'BB 상단',formula:'종가 평균 + 배수 × 모집단 표준편차 · 표시 이동 적용',version:'close-population-bb-v1',unit:'원'},
  ichimoku:{label:'일목균형표',formula:'고저 중간값 전환·기준선 → 선행스팬 A/B · 지정 봉수 선행 표시',version:'ichimoku-midpoint-displaced-v1',unit:'원'},
  rsi:{label:'RSI · Wilder',formula:'최초 N개 등락의 단순평균으로 초기화 후 Wilder 평활',version:'wilder-rsi-v1',unit:'RSI'},
  volume:{label:'봉 거래량',formula:'공급자 KRX 일봉 거래량',version:'krx-volume-v1',unit:'주'},
  turnover:{label:'봉 거래대금',formula:'일자·거래량 일치 KIS 원화 실제 거래대금',version:'kis-krw-turnover-v1',unit:'원'}
 });
 const pending=Object.freeze([{id:'di',label:'DI',reason:'계산·평활 방식과 돌파 대상 미확정'},{id:'macd',label:'MACD',reason:'계산 기간·평활·초기값 계약 미확정'},{id:'wellMountain',label:'우물·산',reason:'일목균형표와 별개 · 사용자 수식·판정 규칙 미확정'}]);
 const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
 function validate(condition){
  if(!condition||!Object.hasOwn(registry,condition.id))throw Error('미지원 또는 계산식 미확정 조건');
  const allowed={sma:['id','op','fast','slow'],bb:['id','op','period','multiplier','shift'],ichimoku:['id','op','conversion','base','span','displacement'],rsi:['id','op','period','method','level'],volume:['id','op','threshold'],turnover:['id','op','threshold']}[condition.id];
  if(Object.keys(condition).some(k=>!allowed.includes(k)))throw Error('조건 매개변수 오류');
  if(['sma','bb','rsi'].includes(condition.id)&&!['crossUp','crossDown','above','below'].includes(condition.op))throw Error('돌파·유지 판정 오류');
  if(condition.id==='sma'&&(!integer(condition.fast,1,1200)||!integer(condition.slow,2,1200)||condition.fast>=condition.slow))throw Error('단기·장기 이평 기간 오류');
  if(condition.id==='bb'&&(!integer(condition.period,2,500)||!Number.isFinite(condition.multiplier)||condition.multiplier<0||condition.multiplier>10||!integer(condition.shift,0,120)))throw Error('BB 기간·배수·이동 오류');
  if(condition.id==='ichimoku'&&(!['enter','breakout','bullish'].includes(condition.op)||![condition.conversion,condition.base,condition.span].every(n=>integer(n,1,1200))||condition.conversion>condition.base||condition.base>condition.span||!integer(condition.displacement,0,120)))throw Error('일목 기간·선행 이동·조건 오류');
  if(condition.id==='rsi'&&(!integer(condition.period,1,500)||condition.method!=='wilder'||!Number.isFinite(condition.level)||condition.level<0||condition.level>100))throw Error('RSI 기간·Wilder 방식·기준선 오류');
  if(['volume','turnover'].includes(condition.id)&&(condition.op!=='gte'||!Number.isSafeInteger(condition.threshold)||condition.threshold<0))throw Error('거래량·거래대금 기준값 오류');
  return {...condition};
 }
 function evaluate(dataset,conditions,{join='all',mode='closed',cycle='day',turnover=null}={}){
  if(!['all','any'].includes(join)||!['closed','latest'].includes(mode)||!Array.isArray(conditions)||conditions.length<1||conditions.length>12)throw Error('검색 조합·봉 기준·조건 개수 오류');
  conditions=conditions.map(validate);
  if(!dataset?.ok||!/^\d{6}$/.test(dataset.metadata?.stockCode||''))throw Error('종목 일봉 자료 없음');
  const bars=series.aggregate(dataset.candles,cycle,dataset.metadata);
  // Only the final provider bar has uncertain completion; never call it confirmed by clock inference.
  const index=bars.length-1-(mode==='closed'&&bars.at(-1).incompleteEnd?1:0);
  const date=bars[index]?.date||null,provisional=!!bars[index]?.incompleteEnd;
  let amounts=null;if(turnover)try{amounts=series.tradingValues(bars,dataset.candles,turnover).amounts;}catch{}
  const results=conditions.map(condition=>{
   const base={condition,formula:registry[condition.id].formula,version:registry[condition.id].version,unit:registry[condition.id].unit,date,provisional,value:null,reference:null,previousValue:null,previousReference:null};
   const unknown=reason=>({...base,state:'unknown',reason});
   if(index<0)return unknown('완성 봉 이력 없음');
   if(bars[index].incompleteStart)return unknown('첫 봉의 시작 이력 부족');
   if(condition.id==='bb'&&cycle!=='day')return unknown('현재 차트 BB는 일봉 전용 · 다른 주기의 BB 계약 미연결');
   if(condition.id==='ichimoku'){
    const cloud=series.ichimokuSeries(bars,condition),now=cloud[index],before=cloud[index-1];
    if(!Number.isFinite(now.spanA)||!Number.isFinite(now.spanB))return unknown('일목 선행스팬 이력 부족');
    const top=Math.max(now.spanA,now.spanB),bottom=Math.min(now.spanA,now.spanB),bullish=now.spanA>now.spanB;
    Object.assign(base,{value:bars[index].close,reference:top,cloud:now,previousValue:bars[index-1]?.close??null,previousReference:before&&Number.isFinite(before.spanA)&&Number.isFinite(before.spanB)?Math.max(before.spanA,before.spanB):null});
    if(condition.op!=='bullish'&&(!before||!Number.isFinite(before.spanA)||!Number.isFinite(before.spanB)))return {...base,state:'unknown',reason:'일목 진입·돌파용 직전 구름 이력 부족'};
    const match=bullish&&(condition.op==='bullish'||condition.op==='enter'&&bars[index-1].close<Math.min(before.spanA,before.spanB)&&bars[index].close>=bottom&&bars[index].close<=top||condition.op==='breakout'&&bars[index-1].close<=base.previousReference&&bars[index].close>top);
    return {...base,state:match?'match':'no-match',reason:match?'조건 충족':'조건 미충족'};
   }
   let left,right;
   if(condition.id==='sma'){left=series.average(bars,condition.fast,{includePartialStart:cycle==='year'});right=series.average(bars,condition.slow,{includePartialStart:cycle==='year'});}
   else if(condition.id==='rsi'){left=series.rsiSeries(bars,condition.period,condition.method);right=bars.map(()=>condition.level);}
   else if(condition.id==='bb'){const upper=series.bbUpperSeries(bars,condition.period,condition.multiplier);left=bars.map(b=>b.close);right=bars.map((_,i)=>upper[i-condition.shift]??null);}
   else{left=condition.id==='volume'?bars.map(b=>b.volume):amounts;if(!left)return unknown('실제 거래대금 미수신 · 종가×거래량 대체 금지');right=bars.map(()=>condition.threshold);}
   const value=left[index],reference=right[index],previousValue=left[index-1]??null,previousReference=right[index-1]??null;
   if(!Number.isFinite(value)||!Number.isFinite(reference))return unknown('지표 이력 부족 또는 일자·거래량 일치 자료 없음');
   Object.assign(base,{value,reference,previousValue,previousReference});
   const crossing=condition.op==='crossUp'||condition.op==='crossDown';
   if(crossing&&(!Number.isFinite(previousValue)||!Number.isFinite(previousReference)))return {...base,state:'unknown',reason:'돌파 판정용 직전 봉 이력 부족'};
   const match=condition.op==='gte'?value>=reference:condition.op==='above'?value>reference:condition.op==='below'?value<reference:condition.op==='crossUp'?previousValue<=previousReference&&value>reference:previousValue>=previousReference&&value<reference;
   return {...base,state:match?'match':'no-match',reason:match?'조건 충족':'조건 미충족'};
  });
  const states=results.map(r=>r.state);
  const state=join==='all'?(states.includes('no-match')?'no-match':states.includes('unknown')?'unknown':'match'):(states.includes('match')?'match':states.includes('unknown')?'unknown':'no-match');
  return {code:dataset.metadata.stockCode,date,mode,cycle,provisional,historyStartPartial:!!bars[0].incompleteStart,state,join,source:dataset.metadata.source||'공급자 미표시',fetchedAt:dataset.metadata.fetchedAt||null,results};
 }
 return Object.freeze({registry,pending,validate,evaluate});
});
