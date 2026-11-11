'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {entrySignalSeries,entryPriceSeries,entrySignalSettings}=require('../src/chart/series.js');
const fixture=require('./fixtures/samsung-kiwoom-signals.json');
const amounts=fixture.map(r=>r.amountKRW),dates=(rows,key='signal')=>rows.flatMap((r,i)=>r[key]===true&&fixture[i].date>='2025-06-02'&&fixture[i].date<='2025-11-12'?[fixture[i].date]:[]);
test('same 600 Kiwoom bars reproduce 17 price-only candidates but exactly July 3 and July 28 with the full supplied formula',()=>{
 const before=structuredClone(fixture),price=entryPriceSeries(fixture),full=entrySignalSeries(fixture,{amounts});
 assert.equal(dates(price).length,17);assert.deepEqual(dates(full),['2025-07-03','2025-07-28']);assert.deepEqual(fixture,before);
 const counts=Object.values({base:()=>true,bullish:r=>r.checks.bullish,gain:r=>r.checks.bullish&&r.checks.gain25,full:r=>r.signal===true}).map(fn=>full.filter((r,i)=>fixture[i].date>='2025-06-02'&&fixture[i].date<='2025-11-12'&&r.baseSignal===true&&fn(r)).length);assert.deepEqual(counts,[17,8,3,2]);
 const oct=full[fixture.findIndex(r=>r.date==='2025-10-10')];assert.equal(oct.checks.bullish,true);assert.equal(oct.checks.gain25,true);assert.equal(oct.checks.declining226,false);assert.equal(oct.signal,false);
});
test('actual amount is mandatory for a viable candidate; missing differs from actual zero and known failures remain false',()=>{
 const missing=entrySignalSeries(fixture),zero=entrySignalSeries(fixture,{amounts:amounts.map(()=>0)}),index=fixture.findIndex(r=>r.date==='2025-07-28');
 assert.equal(missing[index].signal,null);assert.equal(missing[index].reason,'amount');assert.equal(zero[index].signal,false);assert.equal(zero[index].checks.amount,false);
 assert.equal(missing[fixture.findIndex(r=>r.date==='2025-07-29')].signal,false);assert.equal(missing[fixture.findIndex(r=>r.date==='2025-10-10')].signal,false);
});
test('volume and money filters respect inclusive boundaries and explicit KRW unit conversion',()=>{
 const i=fixture.findIndex(r=>r.date==='2025-07-28'),rows=structuredClone(fixture);rows[i].volume=70000;
 const exact=amounts.slice();exact[i]=5000*1e8;assert.equal(entrySignalSeries(rows,{amounts:exact})[i].signal,true);
 rows[i].volume=69999;assert.equal(entrySignalSeries(rows,{amounts:exact})[i].checks.volume,false);rows[i].volume=70000;
 exact[i]--;assert.equal(entrySignalSeries(rows,{amounts:exact})[i].signal,false);assert.equal(entrySignalSeries(rows,{amounts:exact,settings:{amountUnit:'million'}})[i].signal,true);
 const million=entrySignalSeries(fixture,{amounts,settings:{amountUnit:'million'}});assert.deepEqual(dates(million),['2025-07-03','2025-07-28']);assert.equal(million[i].minAmountKRW,5000000000);
});
test('full signal requires three prior 226-bar averages, preserves all qualifying consecutive bars and never reads future data',()=>{
 const rows=Array.from({length:230},(_,i)=>{const c=i<10?1000:i<228?100:310;return {date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),open:i<228?c:300,high:c+10,low:i<228?c-1:299,close:c,volume:70000};});
 const a=entrySignalSeries(rows,{amounts:rows.map(()=>500000000000)});assert.ok(a.slice(0,228).every(r=>r.signal===null&&r.reason==='history'));
 assert.ok(a.slice(228).every(r=>r.signal===true));const prefix=entrySignalSeries(rows.slice(0,229),{amounts:rows.slice(0,229).map(()=>500000000000)});assert.deepEqual(a.slice(0,229),prefix);
});
test('full signal refuses malformed amount arrays and unsafe thresholds rather than assuming missing money passes',()=>{
 for(const amounts of [[1],fixture.map(()=>NaN),fixture.map(()=>-1),fixture.map(()=>Number.MAX_SAFE_INTEGER+1)])assert.throws(()=>entrySignalSeries(fixture,{amounts}));
 for(const settings of [{minVolume:-1},{minVolume:.1},{minAmount:NaN},{amountUnit:'K'},{minAmount:Number.MAX_SAFE_INTEGER}])assert.throws(()=>entrySignalSettings(settings));
 assert.deepEqual(entrySignalSettings(),{minVolume:70000,minAmount:5000,amountUnit:'eok'});
});
