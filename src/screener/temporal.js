(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockBookScreenTemporal=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const states=['match','no-match','unknown'];
 function validate(config){
  if(!config||typeof config!=='object'||Array.isArray(config)||!['count','streak'].includes(config.kind))throw Error('기간 판정 종류 오류');
  const keys=config.kind==='count'?['kind','span','operator','threshold']:['kind','span'];
  if(Object.keys(config).some(k=>!keys.includes(k))||!Number.isInteger(config.span)||config.span<1||config.span>1200)throw Error('평가 구간은 1~1200봉입니다.');
  if(config.kind==='count'&&(!['gte','lte','eq'].includes(config.operator)||!Number.isInteger(config.threshold)||config.threshold<0||config.threshold>config.span))throw Error('기간 내 횟수는 0~구간 봉수의 정수이며 이상·이하·같음을 선택하세요.');
  return config.kind==='count'?{kind:'count',span:config.span,operator:config.operator,threshold:config.threshold}:{kind:'streak',span:config.span};
 }
 function evaluate(input,read){
  const config=validate(input);let matched=0,unmatched=0,unknown=0;const samples=[];
  for(let ago=0;ago<config.span;ago++){
   const point=read(ago);if(!point||!states.includes(point.state))throw Error('기간 판정 표본 오류');
   if(point.state==='match')matched++;else if(point.state==='no-match')unmatched++;else unknown++;
   if(ago<16||ago>=config.span-16)samples.push({ago,date:point.date??null,state:point.state,reason:point.reason??'',value:point.value??null,reference:point.reference??null});
  }
  const lowerBound=matched,upperBound=matched+unknown;let state;
  if(config.kind==='streak')state=unmatched?'no-match':unknown?'unknown':'match';
  else if(config.operator==='gte')state=lowerBound>=config.threshold?'match':upperBound<config.threshold?'no-match':'unknown';
  else if(config.operator==='lte')state=upperBound<=config.threshold?'match':lowerBound>config.threshold?'no-match':'unknown';
  else state=lowerBound===upperBound&&lowerBound===config.threshold?'match':config.threshold<lowerBound||config.threshold>upperBound?'no-match':'unknown';
  return {version:'temporal-bounds-v1',config,state,matched,unmatched,unknown,lowerBound,upperBound,samples,omittedSamples:config.span-samples.length};
 }
 return Object.freeze({validate,evaluate});
});
