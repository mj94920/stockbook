(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockBookMarketQuotes=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const symbols=Object.freeze({kospi:'^KS11',kosdaq:'^KQ11',nasdaq:'^IXIC',sox:'^SOX',nasdaqFuture:'NQ=F',us10y:'^TNX',nikkei:'^N225',wti:'CL=F'});
 function parse(key,data,fetchedAt){
  if(!Object.hasOwn(symbols,key)||data?.chart?.error)throw Error('시장 지표 응답 오류');
  const meta=data?.chart?.result?.[0]?.meta;
  if(meta?.symbol!==symbols[key]||!Number.isFinite(meta.regularMarketPrice)||meta.regularMarketPrice<0||(key!=='us10y'&&meta.regularMarketPrice===0)||key==='us10y'&&meta.regularMarketPrice>100)throw Error('시장 지표 식별자/값 오류');
  const previous=[meta.previousClose,meta.chartPreviousClose].find(v=>Number.isFinite(v)&&v>0)??null;
  return {regularMarketPrice:meta.regularMarketPrice,previousClose:previous,chartPreviousClose:previous,symbol:meta.symbol,source:'Yahoo Finance',unit:key==='us10y'?'percent':key==='wti'?'USD':'point',asOf:Number.isFinite(meta.regularMarketTime)&&meta.regularMarketTime>0?new Date(meta.regularMarketTime*1000).toISOString():null,fetchedAt,delayedMinutes:Number.isFinite(meta.exchangeDataDelayedBy)?meta.exchangeDataDelayedBy:null};
 }
 function display(key,meta){
  const p=meta?.regularMarketPrice,previous=meta?.previousClose??meta?.chartPreviousClose;
  if(!Number.isFinite(p)||p<0)return {value:'미수신',change:'',absolute:'',direction:''};
  const fmt=n=>n.toLocaleString('ko-KR',{minimumFractionDigits:key==='us10y'?3:0,maximumFractionDigits:key==='us10y'?3:2});
  const valid=Number.isFinite(previous)&&previous>0,d=valid?p-previous:null,up=d!==null&&d>=0;
  return {value:fmt(p)+(key==='us10y'?'%':''),change:d===null?'':(up?'▲':'▼')+(key==='us10y'?(Math.abs(d)*100).toFixed(1)+'bp':(Math.abs(d)/previous*100).toFixed(2)+'%'),absolute:d===null?'':(up?'+':'−')+fmt(Math.abs(d))+(key==='us10y'?'%p':''),direction:d===null?'':up?'up':'dn'};
 }
 return Object.freeze({symbols,parse,display});
});
