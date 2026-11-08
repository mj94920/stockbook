'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {createTradingValueProvider}=require('../src/chart/trading-value.cjs'),{createInvestorProvider}=require('../src/chart/investor-provider.cjs'),{countOption}=require('../src/chart/history.cjs');
const now=()=>Date.parse('2026-11-08T00:00:00Z'),auth=async()=>({token:'mock',appKey:'mock',appSecret:'mock'});
function dates(end,count){return Array.from({length:count},(_,i)=>new Date(Date.parse(end.slice(0,4)+'-'+end.slice(4,6)+'-'+end.slice(6)+'T00:00:00Z')-i*86400000).toISOString().slice(0,10).replaceAll('-',''));}
function money(code,days){return JSON.stringify({rt_cd:'0',output1:{stck_shrn_iscd:code},output2:days.map(d=>({stck_bsop_date:d,acml_tr_pbmn:'50000000000',acml_vol:'1000'}))});}
function investors(days){return JSON.stringify({rt_cd:'0',output2:days.map(d=>({stck_bsop_date:d,frgn_ntby_qty:'1000',orgn_ntby_qty:'-300',prsn_ntby_qty:'-400'}))});}
test('money retrieves previous date windows for 6 months and a year, deduplicates callers and returns only actual requested rows',async()=>{
 const calls=[];const p=createTradingValueProvider({now,getAuth:auth,httpsGet:async url=>{const u=new URL(url);calls.push(u);return money('005930',dates(u.searchParams.get('FID_INPUT_DATE_2'),100));}});
 const [a,b]=await Promise.all([p.get('005930',{count:260}),p.get('005930',{count:260})]);assert.deepEqual(a,b);assert.equal(calls.length,3);assert.equal(a.rows.length,260);assert.equal(a.pages,3);assert.equal(a.partial,false);assert.equal(new Set(a.rows.map(r=>r.date)).size,260);assert.ok(calls[1].searchParams.get('FID_INPUT_DATE_2')<calls[0].searchParams.get('FID_INPUT_DATE_2'));assert.equal(a.rows[0].value,50000000000);
});
test('investor dated endpoint requests older dates beyond 30 days and keeps all three actual reported groups',async()=>{
 const calls=[];const p=createInvestorProvider({now,getAuth:auth,httpsGet:async(url,_t,h)=>{const u=new URL(url);calls.push({u,h});return investors(dates(u.searchParams.get('FID_INPUT_DATE_1'),30));}});
 const data=await p.get('005930',{count:132});assert.equal(data.ok,true);assert.equal(data.rows.length,132);assert.equal(data.pages,5);assert.equal(data.partial,false);assert.equal(calls[0].h.tr_id,'FHPTJ04160001');assert.match(calls[0].u.pathname,/investor-trade-by-stock-daily$/);assert.equal(data.rows[0].individual,-400);assert.ok(calls[1].u.searchParams.get('FID_INPUT_DATE_1')<calls[0].u.searchParams.get('FID_INPUT_DATE_1'));
});
test('a later page failure or non-progress preserves received rows with a partial warning; no dates or amounts are fabricated',async()=>{
 for(const repeat of [false,true]){let calls=0,first;
 const p=createTradingValueProvider({now,getAuth:auth,httpsGet:async url=>{calls++;const end=new URL(url).searchParams.get('FID_INPUT_DATE_2');if(!first)first=dates(end,100);if(calls>1&&!repeat)throw Error('secret mock');return money('005930',first);}});
 const result=await p.get('005930',{count:260});assert.equal(result.ok,true);assert.equal(result.rows.length,100);assert.equal(result.partial,true);assert.match(result.warning,/중단/);assert.equal(calls,2);assert.doesNotMatch(JSON.stringify(result),/secret/);}
});
test('historical count is bounded and short fallback data cannot masquerade as complete history',async()=>{
 for(const options of [{count:0},{count:1001},{count:2.5},{count:132,url:'x'},null])assert.throws(()=>countOption(options,30));
 let sent=0;const p=createInvestorProvider({now,getAuth:async()=>null,naverFallback:true,httpsGet:async url=>{sent++;assert.match(url,/^https:\/\/m.stock.naver.com\//);return JSON.stringify({itemCode:'005930',dealTrendInfos:[{itemCode:'005930',bizdate:'20261106',foreignerPureBuyQuant:'1',organPureBuyQuant:'2',individualPureBuyQuant:'3'}]});}});
 assert.equal((await p.get('005930',{count:1001})).ok,false);assert.equal(sent,0);const data=await p.get('005930',{count:260});assert.equal(data.source,'Naver');assert.equal(data.rows.length,1);assert.equal(data.partial,true);assert.equal(data.requestedCount,260);
});
test('full-history money requests stop at 1000 real rows, never at the former 100-row join limit',async()=>{
 let calls=0;const p=createTradingValueProvider({now,getAuth:auth,httpsGet:async url=>{calls++;return money('005930',dates(new URL(url).searchParams.get('FID_INPUT_DATE_2'),100));}});
 const data=await p.get('005930',{count:1000});assert.equal(data.ok,true);assert.equal(data.rows.length,1000);assert.equal(data.pages,10);assert.equal(calls,10);assert.equal(data.partial,false);
 const candles=data.rows.map(r=>({date:r.date,open:100,high:110,low:90,close:100,volume:r.volume})),series=require('../src/chart/series.js');assert.equal(series.tradingValues(series.aggregate(candles),candles,data).amounts.filter(v=>v!==null).length,1000);
});
test('history IPC rejects excessive or arbitrary options before invoking a provider',()=>{
 const handlers=new Map(),wc={mainFrame:{}},calls=[];
 require('../src/chart/window.cjs').registerChartWindow({ipcMain:{handle:(k,f)=>handlers.set(k,f)},getMainWindow:()=>({webContents:wc}),appDir:'/app',getTradingValues:(code,options)=>{calls.push({code,options});return {ok:true};},getInvestors:(code,options)=>{calls.push({code,options});return {ok:true};}});
 const event={sender:wc,senderFrame:wc.mainFrame};
 for(const name of ['get-chart-trading-values','get-chart-investors']){
  assert.equal(handlers.get(name)(event,'005930',{count:1001}).ok,false);assert.equal(handlers.get(name)(event,'005930',{count:100,url:'https://example.test'}).ok,false);assert.equal(handlers.get(name)({...event,senderFrame:{}},'005930',{count:100}).ok,false);assert.equal(calls.length,0);
 }
 assert.equal(handlers.get('get-chart-trading-values')(event,'005930',{count:1000}).ok,true);assert.deepEqual(calls,[{code:'005930',options:{count:1000}}]);
});
