(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockBookChartSeries=api;
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const cycles=Object.freeze({
  day:{label:'일봉',unit:'일',defaultType:'candle',periods:[5,10,20,60,120,200,450,350],colors:[0,1,2,3,4,5,6,7],cloud:[5,10],bold:[20,200],panels:{pressure:true,money:true,investors:true,obv:false,signals:true}},
  week:{label:'주봉',unit:'주',defaultType:'profile',profileBins:10,periods:[4,12,24,46,73],colors:[3,1,5,2,7],cloud:[1,4],bold:[46],panels:{pressure:false,money:false,investors:false,obv:true,signals:true}},
  year:{label:'연봉',unit:'년',defaultType:'candle',periods:[1,3,5,6,10],colors:[0,1,2,5,4],cloud:null,bold:[],panels:{volume:true,pressure:false,money:false,investors:false,obv:false,signals:false}},
  month:{label:'월봉',unit:'개월',defaultType:'candle',periods:[1,5,19,6,9],colors:[1,2,7,3,5],cloud:null,bold:[9],panels:{pressure:true,money:false,investors:false,obv:false,signals:false}},
 });
 const ranges=Object.freeze(['1m','3m','6m','1y','all']);
 function cycleConfig(cycle='day'){
  if(!Object.hasOwn(cycles,cycle))throw Error('지원하지 않는 봉 주기');
  const value=cycles[cycle];return {...value,periods:[...value.periods],colors:[...value.colors],cloud:value.cloud?[...value.cloud]:null,bold:[...value.bold],panels:{...value.panels}};
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
  const defaults=cycleConfig(cycle),periods=input.periods??defaults.periods,cloud=defaults.cloud?(input.cloud??defaults.cloud):null,bb={period:40,multiplier:1.9,shift:25,...input.bb},obv={period:9,method:'sma',...(cycle==='week'?input.obv:{})},signals=['day','week'].includes(cycle)?{newLowPeriod:cycle==='day'?40:null,rsiPeriod:14,rsiLevel:30,rsiMethod:null,...input.signals,...(cycle==='week'?{newLowPeriod:null}:{})}:{newLowPeriod:null,rsiPeriod:null,rsiLevel:null,rsiMethod:null};
  if(!Array.isArray(periods)||periods.length<1||periods.length>8||periods.some(n=>!Number.isInteger(n)||n<1||n>1200))throw Error('이평 기간은 1~1200, 최대 8개입니다.');
  if(cloud&&(!Array.isArray(cloud)||cloud.length!==2||cloud.some(n=>!Number.isInteger(n)||n<1||n>1200)))throw Error('구름 기간 두 개를 확인하세요.');
  if(!Number.isInteger(bb.period)||bb.period<2||bb.period>500||!Number.isFinite(bb.multiplier)||bb.multiplier<0||bb.multiplier>10||!Number.isInteger(bb.shift)||bb.shift<0||bb.shift>120)throw Error('BB 기간·배수·이동값을 확인하세요.');
  if(!Number.isInteger(obv.period)||obv.period<1||obv.period>500||!['sma','ema'].includes(obv.method))throw Error('OBV 시그널 기간은 1~500, 방식은 단순/지수입니다.');
  if(signals.newLowPeriod!==null&&(!Number.isInteger(signals.newLowPeriod)||signals.newLowPeriod<1||signals.newLowPeriod>1200))throw Error('신저가 기간은 1~1200봉입니다. 비우면 표시하지 않습니다.');
  const rsi=[signals.rsiPeriod,signals.rsiLevel,signals.rsiMethod];
  if(rsi.some(value=>value!==null)&&(!Number.isInteger(signals.rsiPeriod)||signals.rsiPeriod<1||signals.rsiPeriod>500||!Number.isFinite(signals.rsiLevel)||signals.rsiLevel<0||signals.rsiLevel>100||(signals.rsiMethod!==null&&!['simple','wilder'].includes(signals.rsiMethod))))throw Error('RSI 기간(1~500)과 하단값(0~100)을 함께 입력하고 계산방식을 확인하세요.');
  return {periods:[...periods],cloud:cloud?[...cloud]:null,bb,obv,signals};
 }
 // Zero at the first received close: no volume can be signed without its prior close.
 // Compute on all received bars before slicing the viewport; never restart on pan.
 function obvSeries(bars,{period=9,method='sma'}={}){
  if(!Number.isInteger(period)||period<1||period>500||!['sma','ema'].includes(method))throw Error('OBV 시그널 설정 오류');
  if(!Array.isArray(bars)||!bars.length)throw Error('OBV 자료 없음');
  let total=0,previousDate='';const values=bars.map((bar,i)=>{
   dateValue(bar.date);if(bar.date<=previousDate||!Number.isFinite(bar.close)||bar.close<=0||!Number.isSafeInteger(bar.volume)||bar.volume<0)throw Error('OBV 종가/거래량 오류');previousDate=bar.date;
   if(i)total+=Math.sign(bar.close-bars[i-1].close)*bar.volume;
   if(!Number.isSafeInteger(total))throw Error('OBV 누적 범위 오류');return total;
  });
  const signal=[];let sum=0,ema=null;
  for(let i=0;i<values.length;i++){
   sum+=values[i];if(i>=period)sum-=values[i-period];
   if(i<period-1){signal.push(null);continue;}
   if(method==='sma')signal.push(sum/period);
   else{ema=ema===null?sum/period:ema+(values[i]-ema)*2/(period+1);signal.push(ema);}
  }
  return {values,signal};
 }
 function closes(bars){
  if(!Array.isArray(bars)||!bars.length)throw Error('종가 자료 없음');let previous='';
  return bars.map(bar=>{dateValue(bar.date);if(bar.date<=previous||!Number.isFinite(bar.close)||bar.close<=0)throw Error('종가 자료 오류');previous=bar.date;return bar.close;});
 }
 // lowest(C(1), Period) > C: exclude the current close and require all prior N bars.
 function newLowSignals(bars,period){
  if(!Number.isInteger(period)||period<1||period>1200)throw Error('신저가 기간 오류');const values=closes(bars);
  return values.map((value,i)=>i>=period&&Math.min(...values.slice(i-period,i))>value);
 }
 // Explicit alternatives because the supplied RSI formula does not specify smoothing.
 // Both methods need N close-to-close changes. Wilder seeds with their simple average.
 function rsiSeries(bars,period,method){
  if(!Number.isInteger(period)||period<1||period>500||!['simple','wilder'].includes(method))throw Error('RSI 설정 오류');
  const values=closes(bars),result=values.map(()=>null);let gain=0,loss=0;
  for(let i=1;i<values.length;i++){
   const change=values[i]-values[i-1],up=Math.max(0,change),down=Math.max(0,-change);
   if(i<=period){gain+=up/period;loss+=down/period;}
   else if(method==='wilder'){gain+=(up-gain)/period;loss+=(down-loss)/period;}
   else{const old=values[i-period]-values[i-period-1];gain+=(up-Math.max(0,old))/period;loss+=(down-Math.max(0,-old))/period;gain=Math.max(0,gain);loss=Math.max(0,loss);}
   if(i>=period)result[i]=gain===0&&loss===0?50:loss===0?100:gain===0?0:100*(gain/(gain+loss));
  }
  return result;
 }
 function crossdown(values,level){
  if(!Array.isArray(values)||!Number.isFinite(level)||values.some(value=>value!==null&&!Number.isFinite(value)))throw Error('하향 돌파 자료 오류');
  return values.map((value,i)=>i>0&&value!==null&&values[i-1]!==null&&values[i-1]>=level&&value<level);
 }
 // User's price-only entry formula. Each A(25)/B(25) is a historical value,
 // distinct from the chart's future-shifted BB display and its editable periods.
 function entrySignalSeries(candles){
  const bars=aggregate(candles,'day'),ma=average(bars,226),range=n=>bars.map((_,i)=>i<n-1?null:{high:Math.max(...bars.slice(i-n+1,i+1).map(c=>c.high)),low:Math.min(...bars.slice(i-n+1,i+1).map(c=>c.low))}),r9=range(9),r26=range(26),r52=range(52);
  const a=bars.map((_,i)=>r26[i]?(r9[i].high+r9[i].low+r26[i].high+r26[i].low)/4:null),b=bars.map((_,i)=>r52[i]?(r52[i].high+r52[i].low)/2:null);
  const upper=bars.map((_,i)=>{if(i<19)return null;const values=bars.slice(i-19,i+1).map(c=>c.close),mean=values.reduce((s,v)=>s+v,0)/20;return mean+2*Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/20);});
  const cross=(value,line,priorValue,priorLine)=>line!==null&&priorLine!==null&&value>line&&priorValue<=priorLine;
  return bars.map((c,i)=>{
   const lineA=a[i-25]??null,lineB=b[i-25]??null;
   if([lineA,lineB,ma[i],upper[i]].some(v=>v===null))return {signal:null,lineA,lineB,ma226:ma[i],bbUpper:upper[i]};
   if(![lineA,lineB,ma[i],upper[i]].every(Number.isFinite))throw Error('세력 입장 계산 범위 오류');
   const previous=bars[i-1],cloudCross=cross(c.close,lineA,previous.close,a[i-26]??null)&&cross(c.close,lineB,previous.close,b[i-26]??null),cloudAbove=c.high>lineA&&c.high>lineB;
   const maCross=cross(c.close,ma[i],previous.close,ma[i-1]??null),aboveMA=c.close>ma[i],bandCross=cross(c.high,upper[i],previous.high,upper[i-1]??null),openAboveBand=c.open>upper[i];
   return {signal:(cloudCross||cloudAbove)&&(maCross||aboveMA)&&(bandCross||openAboveBand),lineA,lineB,ma226:ma[i],bbUpper:upper[i],cloudCross,cloudAbove,maCross,aboveMA,bandCross,openAboveBand};
  });
 }
 function investorSeries(input){
  if(!Array.isArray(input)||!input.length||input.length>100)throw Error('수급 자료 없음');const seen=new Set(),sums={foreign:0,institution:0,individual:0};
  return input.map(row=>{dateValue(row.date);if(seen.has(row.date)||['foreign','institution','individual'].some(k=>!Number.isSafeInteger(row[k])))throw Error('수급 날짜/수량 오류');seen.add(row.date);return {date:row.date,foreign:row.foreign,institution:row.institution,individual:row.individual};}).sort((a,b)=>a.date.localeCompare(b.date)).map(row=>{const cumulative={};for(const k of Object.keys(sums)){sums[k]+=row[k];if(!Number.isSafeInteger(sums[k]))throw Error('누적 수량 범위 오류');cumulative[k]=sums[k];}return {...row,cumulative};});
 }
 // Exact daily values are joined only when date and KRX volume match. A group with
 // even one missing/mismatched day has no amount, rather than a partial sum.
 function tradingValues(bars,candles,data){
  if(!data?.ok||data.source!=='KIS'||data.market!=='KRX'||data.currency!=='KRW'||data.unit!=='원'||!Array.isArray(data.rows)||data.rows.length>100)throw Error('거래대금 자료 오류');
  const values=new Map();for(const row of data.rows){dateValue(row.date);if(values.has(row.date)||!Number.isSafeInteger(row.value)||row.value<0||!Number.isSafeInteger(row.volume)||row.volume<0)throw Error('거래대금 값 오류');values.set(row.date,row);}
  const joined=new Map();let mismatched=0,matched=0;
  for(const candle of candles){const row=values.get(candle.date);if(row&&row.volume===candle.volume){joined.set(candle.date,row.value);matched++;}else if(row)mismatched++;}
  const amounts=bars.map(bar=>{let total=0,count=0;for(const c of candles){if(c.date<bar.firstDate||c.date>bar.date)continue;if(!joined.has(c.date))return null;total+=joined.get(c.date);count++;}return count===bar.sourceCount&&Number.isSafeInteger(total)&&!bar.incompleteStart?total:null;});
  return {amounts,matched,mismatched,received:data.rows.length};
 }
 const tradingValueThresholds=Object.freeze([300,500,1000,3000,5000,10000]);
 function tradingValueBand(value){if(value===null||!Number.isFinite(value)||value<300*1e8)return null;return tradingValueThresholds.findLast(n=>value>=n*1e8);}
 const chartTypes=Object.freeze(['candle','hollow','volume','profile']);
 function barLayout(rows,futureCount=0,weighted=false){
  if(!rows.length||!Number.isInteger(futureCount)||futureCount<0||futureCount>120)throw Error('봉 배치 범위 오류');
  const floor=Math.max(1,...rows.map(r=>r.volume))*.01,weights=rows.map(r=>weighted?Math.max(r.volume,floor):1),mean=weights.reduce((a,b)=>a+b,0)/weights.length;
  weights.push(...Array(futureCount).fill(mean));const total=weights.reduce((a,b)=>a+b,0),step=1140/weights.length,edges=[25],widths=weights.map(weight=>1140*weight/total);
  for(const width of widths)edges.push(edges.at(-1)+width);
  const x=i=>i<0?25+(i+.5)*step:i>=weights.length?1165+(i-weights.length+.5)*step:edges[i]+widths[i]/2;
  const indexForX=value=>{if(value<25)return Math.floor((value-25)/step);if(value>=1165)return weights.length+Math.floor((value-1165)/step);let lo=0,hi=weights.length;while(lo<hi){const mid=(lo+hi)>>1;if(edges[mid+1]<=value)lo=mid+1;else hi=mid;}return lo;};
  return {x,indexForX,step,width:i=>widths[i]??step};
 }
 // OHLCV does not contain executions by price. Allocate each received day's volume
 // uniformly across its low/high range; this is an estimate, never actual holdings.
 function volumeProfile(candles,count=12){
  if(!Number.isInteger(count)||count<2||count>50)throw Error('매물대 구간 수 오류');
  if(!candles.length)return {bins:[],total:0};
  if(candles.some(c=>![c.low,c.high,c.close,c.volume].every(Number.isFinite)||c.high<c.low||c.close<c.low||c.close>c.high||c.volume<0))throw Error('매물대 자료 오류');
  const low=Math.min(...candles.map(c=>c.low)),high=Math.max(...candles.map(c=>c.high)),total=candles.reduce((sum,c)=>sum+c.volume,0);
  if(low===high)return {bins:[{low,high,volume:total}],total};
  const step=(high-low)/count,bins=Array.from({length:count},(_,i)=>({low:low+i*step,high:i===count-1?high:low+(i+1)*step,volume:0}));
  for(const c of candles){
   if(c.high===c.low){bins[Math.min(count-1,Math.floor((c.close-low)/step))].volume+=c.volume;continue;}
   for(const bin of bins){const overlap=Math.max(0,Math.min(c.high,bin.high)-Math.max(c.low,bin.low));bin.volume+=c.volume*overlap/(c.high-c.low);}
  }
  return {bins,total};
 }
 return Object.freeze({cycleConfig,aggregate,average,visibleOffset,ranges,indicatorSettings,obvSeries,newLowSignals,rsiSeries,crossdown,entrySignalSeries,chartTypes,barLayout,volumeProfile,investorSeries,tradingValues,tradingValueBand,tradingValueThresholds});
});
