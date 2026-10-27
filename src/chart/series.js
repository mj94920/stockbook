(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockBookChartSeries=api;
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const cycles=Object.freeze({
  day:{label:'일봉',unit:'일',periods:[5,10,20,60,120,200,350,480],colors:[0,1,2,3,4,5,6,7],cloud:[5,10],bold:[20,200]},
  week:{label:'주봉',unit:'주',periods:[4,12,24,46,73],colors:[3,1,5,2,7],cloud:[1,4],bold:[46]},
  year:{label:'연봉',unit:'년',periods:[1,5,10],colors:[1,2,5],cloud:null,bold:[]},
  month:{label:'월봉',unit:'개월',periods:[1,5,19,6,9],colors:[1,2,7,3,5],cloud:null,bold:[9]},
 });
 const ranges=Object.freeze(['1m','3m','6m','1y','all']);
 function cycleConfig(cycle='day'){
  if(!Object.hasOwn(cycles,cycle))throw Error('지원하지 않는 봉 주기');
  const value=cycles[cycle];return {...value,periods:[...value.periods],colors:[...value.colors],cloud:value.cloud?[...value.cloud]:null,bold:[...value.bold]};
 }
 function dateValue(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('거래일 형식 오류');
  const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw Error('거래일 오류');return time;
 }
 function bucket(date,cycle){
  const time=dateValue(date);
  if(cycle==='day')return date;
  if(cycle==='year')return date.slice(0,4);
  if(cycle==='month')return date.slice(0,7);
  const weekday=new Date(time).getUTCDay();return new Date(time-((weekday+6)%7)*86400000).toISOString().slice(0,10);
 }
 // Dates are the provider's KRX trading dates, not UTC timestamps. Never fill holidays.
 function aggregate(candles,cycle='day',{lastBarComplete=false}={}){
  cycleConfig(cycle);
  if(!Array.isArray(candles)||!candles.length)throw Error('일봉 자료 없음');
  const result=[];let previous='';
  for(const candle of candles){
   dateValue(candle.date);
   if(candle.date<=previous)throw Error('거래일 중복 또는 정렬 오류');previous=candle.date;
   if(!['open','high','low','close'].every(k=>Number.isFinite(candle[k])&&candle[k]>0)||!Number.isFinite(candle.volume)||candle.volume<0||candle.high<Math.max(candle.open,candle.close)||candle.low>Math.min(candle.open,candle.close)||candle.high<candle.low)throw Error('OHLCV 자료 오류');
   const key=bucket(candle.date,cycle);let bar=result.at(-1);
   if(!bar||bar.bucket!==key){bar={bucket:key,date:candle.date,firstDate:candle.date,open:candle.open,high:candle.high,low:candle.low,close:candle.close,volume:candle.volume,sourceCount:1};result.push(bar);}
   else{bar.date=candle.date;bar.high=Math.max(bar.high,candle.high);bar.low=Math.min(bar.low,candle.low);bar.close=candle.close;bar.volume+=candle.volume;bar.sourceCount++;}
  }
  // There may be unavailable history before the first received day; do not call it a full week/month.
  if(cycle!=='day')result[0].incompleteStart=true;
  result.at(-1).incompleteEnd=lastBarComplete!==true || (cycle!=='day');
  return result;
 }
 function average(bars,n,{includePartialStart=false}={}){
  if(!Number.isInteger(n)||n<1)throw Error('이평 기간 오류');
  return bars.map((_,i)=>{
   if(i<n-1)return null;const window=bars.slice(i-n+1,i+1);
   return (!includePartialStart&&window.some(c=>c.incompleteStart))?null:window.reduce((sum,c)=>sum+c.close,0)/n;
  });
 }
 function visibleOffset(bars,range='6m',cycle='day'){
  cycleConfig(cycle);if(!ranges.includes(range))throw Error('조회 범위 오류');
  if(range==='all')return 0;
  // Preserve the existing day view. Weekly/monthly windows use calendar dates.
  if(cycle==='day')return Math.max(0,bars.length-({'1m':22,'3m':66,'6m':132,'1y':260})[range]);
  const months=({'1m':1,'3m':3,'6m':6,'1y':12})[range],last=bars.at(-1).date;
  const y=Number(last.slice(0,4)),m=Number(last.slice(5,7))-1,d=Number(last.slice(8));
  const endOfMonth=new Date(Date.UTC(y,m-months+1,0)).getUTCDate();
  const cutoff=new Date(Date.UTC(y,m-months,Math.min(d,endOfMonth))).toISOString().slice(0,10);
  const offset=bars.findIndex(bar=>bar.date>=cutoff);return offset<0?Math.max(0,bars.length-1):offset;
 }
 function indicatorSettings(cycle,input={}){
  const defaults=cycleConfig(cycle),periods=input.periods??defaults.periods,cloud=defaults.cloud?(input.cloud??defaults.cloud):null,bb={period:40,multiplier:1.9,shift:25,...input.bb};
  if(!Array.isArray(periods)||periods.length<1||periods.length>8||periods.some(n=>!Number.isInteger(n)||n<1||n>1200))throw Error('이평 기간은 1~1200, 최대 8개입니다.');
  if(cloud&&(!Array.isArray(cloud)||cloud.length!==2||cloud.some(n=>!Number.isInteger(n)||n<1||n>1200)))throw Error('구름 기간 두 개를 확인하세요.');
  if(!Number.isInteger(bb.period)||bb.period<2||bb.period>500||!Number.isFinite(bb.multiplier)||bb.multiplier<0||bb.multiplier>10||!Number.isInteger(bb.shift)||bb.shift<0||bb.shift>120)throw Error('BB 기간·배수·이동값을 확인하세요.');
  return {periods:[...periods],cloud:cloud?[...cloud]:null,bb};
 }
 return Object.freeze({cycleConfig,aggregate,average,visibleOffset,ranges,indicatorSettings});
});
