'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {aggregate,average,cycleConfig,visibleOffset,indicatorSettings}=require('../src/chart/series.js');
const {chartContext}=require('../src/chart/window.cjs');
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
 const annual=aggregate(rows,'year');assert.equal(annual.length,15);assert.deepEqual(cycleConfig('year').periods,[1,5,10]);assert.equal(cycleConfig('year').cloud,null);
 assert.deepEqual([annual.at(-1).open,annual.at(-1).high,annual.at(-1).low,annual.at(-1).close,annual.at(-1).volume],[2026,2046,2006,2031,300]);
 assert.equal(average(annual,1,{includePartialStart:true})[0],2017);assert.equal(average(annual,5,{includePartialStart:true})[4],2019);assert.equal(average(annual,10,{includePartialStart:true})[9],2021.5);assert.equal(average(annual.slice(0,4),5).at(-1),null);
 assert.deepEqual(indicatorSettings('year').periods,[1,5,10]);assert.throws(()=>indicatorSettings('week',{periods:[0]}));assert.throws(()=>indicatorSettings('day',{bb:{shift:-1}}));
});
