'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {aggregate,average,cycleConfig,visibleOffset,indicatorSettings}=require('../src/chart/series.js');
const {chartContext}=require('../src/chart/window.cjs');
const {barLayout,volumeProfile}=require('../src/chart/series.js');
const {obvSeries}=require('../src/chart/series.js');
const {newLowSignals,rsiSeries,crossdown}=require('../src/chart/series.js');
const {entrySignalSeries}=require('../src/chart/series.js');
const bar=(date,open,high,low,close,volume)=>({date,open,high,low,close,volume});
test('KRX trading dates group by Monday weeks across years and holidays without zero-filled sessions',()=>{
 const input=[bar('2023-12-28',10,14,8,12,100),bar('2023-12-29',12,15,11,14,200),bar('2024-01-02',20,30,18,25,300),bar('2024-01-05',25,28,17,19,400),bar('2024-01-08',19,21,16,20,500)];
 const rows=aggregate(input,'week');assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>r.bucket),['2023-12-25','2024-01-01','2024-01-08']);
 assert.deepEqual(rows.map(r=>[r.open,r.high,r.low,r.close,r.volume,r.sourceCount]),[[10,15,8,14,300,2],[20,30,17,19,700,2],[19,21,16,20,500,1]]);
 assert.equal(rows[0].incompleteStart,true);assert.equal(rows.at(-1).incompleteEnd,true);assert.equal(rows[1].firstDate,'2024-01-02');assert.equal(rows[1].date,'2024-01-05');
 assert.deepEqual(input[0],bar('2023-12-28',10,14,8,12,100));assert.equal(rows[1].amount,undefined);
});
test('month aggregation uses calendar months and sums received volume, including leap day',()=>{
 const rows=aggregate([bar('2024-01-31',10,12,9,11,10),bar('2024-02-01',11,15,10,14,20),bar('2024-02-29',14,20,12,18,30),bar('2024-03-04',18,21,16,20,40)],'month');
 assert.deepEqual(rows.map(r=>r.bucket),['2024-01','2024-02','2024-03']);assert.deepEqual([rows[1].open,rows[1].high,rows[1].low,rows[1].close,rows[1].volume],[11,20,10,18,50]);
});
test('weekly SMA uses weekly closes with full prehistory and excludes the uncertain first aggregated bucket',()=>{
 const rows=aggregate([bar('2024-01-05',8,12,7,10,1),bar('2024-01-08',10,16,9,12,2),bar('2024-01-09',12,22,11,20,3),bar('2024-01-15',20,32,19,30,4),bar('2024-01-19',30,42,29,40,5)],'week');
 assert.deepEqual(average(rows,2),[null,null,30]);assert.deepEqual(average(rows,1),[null,20,40]);assert.deepEqual(average(rows,4),[null,null,null]);
});
test('invalid OHLCV, duplicate or unordered dates and unsupported cycles are rejected',()=>{
 const valid=bar('2024-01-05',10,15,8,12,100);
 for(const input of [[],[valid,valid],[{...valid,date:'2024-02-30'}],[valid,{...valid,date:'2024-01-04'}],[{...valid,high:11}],[{...valid,volume:-1}],[{...valid,close:NaN}]])assert.throws(()=>aggregate(input,'week'));
 assert.throws(()=>aggregate([valid],'quarter'));assert.throws(()=>average([valid],0));
});
test('approved cycle settings keep weekly 1/4 clouds separate from MA 4/12 and leave monthly Fibonacci pending',()=>{
 assert.deepEqual(cycleConfig('week').periods,[4,12,24,46,73]);assert.deepEqual(cycleConfig('week').cloud,[1,4]);
 assert.deepEqual(cycleConfig('month').periods,[1,5,19,6,9]);assert.equal(cycleConfig('month').cloud,null);
 const copied=cycleConfig('week');copied.periods[0]=999;assert.equal(cycleConfig('week').periods[0],4);
});
test('view range, bar cycle and indicator cycle validate separately while legacy period remains compatible',()=>{
 const current=chartContext({code:'005930',viewRange:'all',barCycle:'week'});assert.equal(current.period,'all');assert.equal(current.viewRange,'all');assert.equal(current.indicatorCycle,'week');
 for(const input of [{code:'005930',period:'6m',viewRange:'1y'},{code:'005930',period:'6m',barCycle:'quarter'},{code:'005930',period:'6m',barCycle:'week',indicatorCycle:'day'}])assert.throws(()=>chartContext(input));
 const rows=[{date:'2024-01-31'},{date:'2024-02-29'},{date:'2024-03-31'}];assert.equal(visibleOffset(rows,'1m','month'),1);assert.equal(visibleOffset(rows,'all','month'),0);
 const snapshot=require('../src/chart/proof-data/long-candles.json');
 assert.equal(aggregate(snapshot,'week').length,215);assert.equal(aggregate(snapshot,'month').length,50);
 const full=aggregate(snapshot,'week'),before=average(full,73).at(-1);assert.ok(before>0);assert.ok(visibleOffset(full,'1m','week')>73);assert.ok(Math.abs(before-173803.42465753425)<1e-8);
});

test('year bars use calendar years and native close SMA 1/5/10 with insufficient history kept missing',()=>{
 const rows=[];for(let year=2012;year<=2026;year++){rows.push(bar(year+'-01-03',year,year+10,year-10,year+2,100));rows.push(bar(year+'-12-28',year+2,year+20,year-20,year+5,200));}
 const annual=aggregate(rows,'year');assert.equal(annual.length,15);assert.deepEqual(cycleConfig('year').periods,[1,3,5,6,10]);assert.equal(cycleConfig('year').cloud,null);
 assert.deepEqual([annual.at(-1).open,annual.at(-1).high,annual.at(-1).low,annual.at(-1).close,annual.at(-1).volume],[2026,2046,2006,2031,300]);
 assert.equal(average(annual,1,{includePartialStart:true})[0],2017);assert.equal(average(annual,5,{includePartialStart:true})[4],2019);assert.equal(average(annual,10,{includePartialStart:true})[9],2021.5);assert.equal(average(annual.slice(0,4),5).at(-1),null);
 assert.deepEqual(indicatorSettings('year').periods,[1,3,5,6,10]);assert.throws(()=>indicatorSettings('week',{periods:[0]}));assert.throws(()=>indicatorSettings('day',{bb:{shift:-1}}));
});

test('volume candle layout changes widths without losing bar/date hit mapping or reserved future slots',()=>{
 const rows=[{volume:10},{volume:20},{volume:40}],layout=barLayout(rows,2,true);
 assert.ok(Math.abs(layout.width(1)/layout.width(0)-2)<1e-12);assert.ok(Math.abs(layout.width(2)/layout.width(0)-4)<1e-12);
 for(let i=0;i<5;i++){assert.equal(layout.indexForX(layout.x(i)),i);if(i)assert.ok(layout.x(i)>layout.x(i-1));}
 assert.ok(Math.abs(Array.from({length:5},(_,i)=>layout.width(i)).reduce((a,b)=>a+b)-1140)<1e-9);
 assert.equal(barLayout(rows,0).width(0),380);assert.ok(barLayout([{volume:0},{volume:100}],0,true).width(0)>0);assert.deepEqual(rows,[{volume:10},{volume:20},{volume:40}]);
});

test('estimated price profile distributes daily volume by range overlap and conserves volume including flat-price days',()=>{
 const rows=[{low:0,high:10,close:9,volume:100},{low:10,high:20,close:18,volume:100},{low:5,high:5,close:5,volume:20}];
 const result=volumeProfile(rows,4);assert.deepEqual(result.bins.map(b=>b.volume),[50,70,50,50]);assert.equal(result.total,220);assert.equal(result.bins.reduce((sum,b)=>sum+b.volume,0),220);
 assert.deepEqual(volumeProfile([{low:10,high:10,close:10,volume:15}],12),{bins:[{low:10,high:10,volume:15}],total:15});assert.deepEqual(volumeProfile([],12),{bins:[],total:0});
 assert.throws(()=>volumeProfile(rows,0));assert.throws(()=>volumeProfile([{low:10,high:5,close:7,volume:1}]));assert.equal(rows[0].volume,100);
});

test('OBV starts at zero, signs current volume by prior close, preserves ties and seeds SMA/EMA after full periods',()=>{
 const rows=[10,12,12,9,11,13].map((close,i)=>({date:'2024-01-0'+(i+1),close,volume:(i+1)*10}));
 const before=structuredClone(rows),simple=obvSeries(rows,{period:3,method:'sma'}),exponential=obvSeries(rows,{period:3,method:'ema'});
 assert.deepEqual(simple.values,[0,20,20,-20,30,90]);assert.deepEqual(simple.signal,[null,null,40/3,20/3,10,100/3]);
 assert.equal(exponential.signal[0],null);assert.equal(exponential.signal[2],40/3);assert.ok(Math.abs(exponential.signal[3]+10/3)<1e-12);assert.ok(Math.abs(exponential.signal[4]-40/3)<1e-12);
 assert.deepEqual(obvSeries(rows,{period:1}).signal,simple.values);assert.deepEqual(obvSeries(rows.slice(0,2),{period:9}).signal,[null,null]);assert.deepEqual(rows,before);
 const weekly=aggregate([bar('2024-01-05',9,11,8,10,900),bar('2024-01-08',10,12,9,11,100),bar('2024-01-12',11,13,10,12,200),bar('2024-01-15',12,13,8,9,400)],'week');
 assert.deepEqual(obvSeries(weekly).values,[0,300,-100]);
});

test('OBV rejects missing/unsafe quantities, duplicate dates and invalid settings rather than manufacturing values',()=>{
 const rows=[{date:'2024-01-02',close:10,volume:10},{date:'2024-01-03',close:11,volume:20}];
 for(const options of [{period:0},{period:501},{method:'unknown'}])assert.throws(()=>obvSeries(rows,options));
 for(const input of [[],[rows[0],rows[0]],[{...rows[0],volume:-1}],[{...rows[0],volume:1.5}],[{...rows[0],close:NaN}],[rows[0],{...rows[1],volume:Number.MAX_SAFE_INTEGER},{date:'2024-01-04',close:12,volume:1}]])assert.throws(()=>obvSeries(input));
 assert.deepEqual(indicatorSettings('week').obv,{period:9,method:'sma'});assert.throws(()=>indicatorSettings('week',{obv:{period:0}}));
});

test('new lows require N prior closes, exclude the current candle, and use strict less-than even on equal lows',()=>{
 const rows=[10,9,9,8,8,7].map((close,i)=>({date:'2024-01-0'+(i+1),close,low:1}));
 assert.deepEqual(newLowSignals(rows,2),[false,false,false,true,false,true]);assert.deepEqual(newLowSignals(rows,1),[false,true,false,true,false,true]);assert.deepEqual(newLowSignals(rows,10),Array(6).fill(false));
 assert.throws(()=>newLowSignals(rows,0));assert.throws(()=>newLowSignals([{date:'2024-01-01',close:NaN}],2));
});

test('RSI uses N changes, explicit simple/Wilder smoothing and handles flat/rising/falling prices without false warmup values',()=>{
 const rows=values=>values.map((close,i)=>({date:'2024-01-'+String(i+1).padStart(2,'0'),close}));
 assert.deepEqual(rsiSeries(rows([10,11,10,9,10]),2,'simple'),[null,null,50,0,50]);
 assert.deepEqual(rsiSeries(rows([10,11,10,9,10]),2,'wilder'),[null,null,50,25,62.5]);
 const canonical=rsiSeries(rows([44.34,44.09,44.15,43.61,44.33,44.83,45.1,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46]),14,'wilder');
 assert.ok(Math.abs(canonical[14]-70.46413502109705)<1e-9);assert.ok(Math.abs(canonical[15]-66.24961855355505)<1e-9);
 for(const method of ['simple','wilder']){assert.deepEqual(rsiSeries(rows([10,10,10,10]),2,method),[null,null,50,50]);assert.deepEqual(rsiSeries(rows([10,11,12]),2,method),[null,null,100]);assert.deepEqual(rsiSeries(rows([12,11,10]),2,method),[null,null,0]);assert.deepEqual(rsiSeries(rows([10,9]),2,method),[null,null]);}
 assert.throws(()=>rsiSeries(rows([10,9]),0,'simple'));assert.throws(()=>rsiSeries(rows([10,9]),1,'unknown'));
});

test('Crossdown only fires when moving from at-or-above to strictly below the level, never throughout an oversold run',()=>{
 assert.deepEqual(crossdown([null,null,40,30,29,20,30,31,29],30),[false,false,false,false,true,false,false,false,true]);
 assert.deepEqual(crossdown([null,10,9],30),[false,false,false]);assert.throws(()=>crossdown([NaN],30));
 const defaults=indicatorSettings('day').signals;assert.deepEqual(defaults,{newLowPeriod:40,rsiPeriod:14,rsiLevel:30,rsiMethod:null});
 assert.equal(indicatorSettings('day',{signals:{newLowPeriod:20}}).signals.newLowPeriod,20);assert.equal(indicatorSettings('day',{signals:{rsiMethod:'wilder'}}).signals.rsiPeriod,14);assert.equal(indicatorSettings('day',{signals:{newLowPeriod:null,rsiPeriod:null,rsiLevel:null,rsiMethod:null}}).signals.newLowPeriod,null);
 for(const signals of [{newLowPeriod:0},{rsiPeriod:14,rsiLevel:null},{rsiPeriod:14,rsiLevel:30,rsiMethod:'unknown'},{rsiPeriod:14,rsiLevel:101,rsiMethod:'simple'}])assert.throws(()=>indicatorSettings('day',{signals}));
});

test('cycle-specific additions never leak daily signals into week/month/year or weekly OBV settings into other cycles',()=>{
 const input={signals:{newLowPeriod:40,rsiPeriod:14,rsiLevel:30,rsiMethod:'wilder'},obv:{period:3,method:'ema'}};
 assert.equal(indicatorSettings('day',input).signals.rsiMethod,'wilder');assert.equal(indicatorSettings('day',input).obv.period,9);
 assert.equal(indicatorSettings('week',input).signals.newLowPeriod,null);assert.equal(indicatorSettings('week',input).signals.rsiMethod,'wilder');for(const cycle of ['month','year'])assert.deepEqual(indicatorSettings(cycle,input).signals,{newLowPeriod:null,rsiPeriod:null,rsiLevel:null,rsiMethod:null});
 assert.equal(indicatorSettings('week',input).obv.period,3);assert.equal(indicatorSettings('month',input).obv.period,9);
});

const entryBars=()=>Array.from({length:230},(_,i)=>bar(new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),100,100,100,100,1));
test('entry price formula waits for 226 closes and supports high crossing BB or opening above BB without older extra filters',()=>{
 const rows=entryBars();rows[229]={...rows[229],open:100,high:110,low:100,close:101.5};const before=structuredClone(rows),result=entrySignalSeries(rows);
 assert.ok(result.slice(0,225).every(r=>r.signal===null));assert.equal(result[225].signal,false);assert.equal(result[229].signal,true);assert.equal(result[229].bandCross,true);assert.equal(result[229].openAboveBand,false);assert.equal(result[229].lineA,100);assert.equal(result[229].lineB,100);assert.ok(Math.abs(result[229].ma226-(22500+101.5)/226)<1e-9);assert.deepEqual(rows,before);
 const opening=entryBars().map(c=>({...c,high:101,low:99}));opening[229]={...opening[229],open:101,high:110,low:100,close:101.5};const last=entrySignalSeries(opening).at(-1);assert.equal(last.bandCross,false);assert.equal(last.openAboveBand,true);assert.equal(last.signal,true);
});

test('entry needs every logical group and samples cloud lines 25 bars back without future leakage',()=>{
 const rows=entryBars();rows[229]={...rows[229],open:99,high:110,low:98,close:99};let last=entrySignalSeries(rows).at(-1);assert.equal(last.cloudAbove,true);assert.equal(last.bandCross,true);assert.equal(last.aboveMA,false);assert.equal(last.signal,false);
 const cloud=entryBars().map((c,i)=>i>=170?{...c,open:120,high:200,low:120,close:120}:{...c,open:80,high:80,low:80,close:80});cloud[229]={...cloud[229],open:125,high:130,low:123,close:126};last=entrySignalSeries(cloud).at(-1);assert.equal(last.cloudAbove,false);assert.equal(last.aboveMA,true);assert.equal(last.openAboveBand,true);assert.equal(last.signal,false);
 const band=entryBars().map(c=>({...c,high:101,low:99}));band[229]={...band[229],close:100.1};last=entrySignalSeries(band).at(-1);assert.equal(last.cloudAbove,true);assert.equal(last.aboveMA,true);assert.equal(last.bandCross,false);assert.equal(last.openAboveBand,false);assert.equal(last.signal,false);
 const shifted=entryBars();shifted[220]={...shifted[220],high:200};shifted[229]={...shifted[229],open:100,high:110,low:100,close:101.5};last=entrySignalSeries(shifted).at(-1);assert.equal(last.lineA,100);assert.equal(last.lineB,100);
 const past=entrySignalSeries(shifted);shifted.push(bar('2024-08-18',1000,2000,900,1500,1));assert.deepEqual(entrySignalSeries(shifted).slice(0,230),past);assert.throws(()=>entrySignalSeries([{...shifted[0],high:0}]));
});
