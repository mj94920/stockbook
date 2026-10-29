'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {parseTradingValues,createTradingValueProvider}=require('../src/chart/trading-value.cjs');
const {aggregate,tradingValues,tradingValueBand}=require('../src/chart/series.js');
const response=(code='005930',rows=[{stck_bsop_date:'20261027',acml_tr_pbmn:'30000000000',acml_vol:'100'},{stck_bsop_date:'20261026',acml_tr_pbmn:'50000000000',acml_vol:'200'}])=>JSON.stringify({rt_cd:'0',output1:{stck_shrn_iscd:code},output2:rows});
const scope={start:'20251028',end:'20261028'},at='2026-10-28T00:00:00Z';
test('actual KIS amounts retain integer won and date, reject other stocks, malformed days and unsafe amounts',()=>{
 const d=parseTradingValues(response(),'005930',at,scope);assert.deepEqual(d.rows,[{date:'2026-10-26',value:50000000000,volume:200},{date:'2026-10-27',value:30000000000,volume:100}]);assert.equal(d.market,'KRX');assert.equal(d.unit,'원');
 for(const text of [response('000660'),response().replace('30000000000','9007199254740992'),response().replace('30000000000','-1'),response().replace('20261027','20260230'),response().replace('20261027','20261026'),response().replace('20261027','20261029'),response().replace('"rt_cd":"0"','"rt_cd":"1"'),response('005930',Array(101).fill({})),response('005930',[])])assert.throws(()=>parseTradingValues(text,'005930',at,scope));
 assert.equal(parseTradingValues(response('005930',[{stck_bsop_date:'20261027',acml_tr_pbmn:'0',acml_vol:'0'},{}]),'005930',at,scope).rows[0].value,0);
});
test('KIS requests fixed one-page daily KRX endpoint, shares pending reads and caps cache time',async()=>{
 let now=Date.parse('2026-10-27T16:00:00Z'),authCalls=0,calls=[],finish;
 const p=createTradingValueProvider({now:()=>now,getAuth:async()=>{authCalls++;return {token:'mock',appKey:'mock',appSecret:'mock'};},httpsGet:(url,t,headers,options)=>{calls.push({url,t,tr:headers.tr_id,signal:options.signal});return new Promise(r=>finish=r);}});
 for(const code of ['https://evil.test','../005930','AAPL',123])assert.equal((await p.get(code)).ok,false);assert.equal(authCalls,0);
 const a=p.get('005930'),b=p.get('005930');await Promise.resolve();assert.equal(calls.length,1);const url=new URL(calls[0].url);assert.equal(url.origin,'https://openapi.koreainvestment.com:9443');assert.equal(url.pathname,'/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice');assert.equal(url.searchParams.get('FID_INPUT_DATE_2'),'20261028');assert.equal(url.searchParams.get('FID_COND_MRKT_DIV_CODE'),'J');assert.equal(url.searchParams.get('FID_PERIOD_DIV_CODE'),'D');assert.equal(calls[0].tr,'FHKST03010100');finish(response());assert.equal((await a).ok,true);assert.equal((await b).ok,true);
 await p.get('005930');assert.equal(calls.length,1);now+=60001;const next=p.get('005930');await Promise.resolve();finish(response());await next;assert.equal(calls.length,2);
});
test('missing KIS auth makes no price call; deadlines release cache, abort and allow retry without exposing errors',async()=>{
 let count=0;const missing=createTradingValueProvider({getAuth:async()=>null,httpsGet:async()=>count++});assert.equal((await missing.get('005930')).ok,false);assert.equal(count,0);
 let signal,calls=0;const p=createTradingValueProvider({now:()=>Date.parse(at),timeoutMs:15,getAuth:async()=>({token:'mock'}),httpsGet:(_url,_t,_h,opt)=>{signal=opt.signal;return ++calls===1?new Promise(()=>{}):Promise.resolve(response());}});assert.equal((await p.get('005930')).ok,false);assert.equal(signal.aborted,true);assert.equal((await p.get('005930')).ok,true);
 const error=await createTradingValueProvider({getAuth:async()=>{throw Error('secret mock');},httpsGet:async()=>{}}).get('005930');assert.equal(error.ok,false);assert.doesNotMatch(error.error,/secret/);
});
test('money joins require equal date/volume and aggregate only full groups; never modifies OHLCV',()=>{
 const candles=['2026-09-30','2026-10-01','2026-10-02','2026-10-05'].map((date,i)=>({date,open:100,high:120,low:90,close:110,volume:100+i})),original=structuredClone(candles);
 const input={ok:true,source:'KIS',market:'KRX',currency:'KRW',unit:'원',rows:candles.map((r,i)=>({date:r.date,value:(i+1)*30000000000,volume:r.volume}))};
 const daily=tradingValues(aggregate(candles),candles,input);assert.deepEqual(daily.amounts,[30000000000,60000000000,90000000000,120000000000]);
 const monthly=tradingValues(aggregate(candles,'month'),candles,input);assert.deepEqual(monthly.amounts,[null,270000000000]);
 input.rows[2].volume++;const mismatched=tradingValues(aggregate(candles,'month'),candles,input);assert.deepEqual(mismatched.amounts,[null,null]);assert.equal(mismatched.mismatched,1);input.rows.splice(2,1);assert.equal(tradingValues(aggregate(candles,'month'),candles,input).amounts[1],null);assert.deepEqual(candles,original);
 for(const [amount,band] of [[null,null],[0,null],[29999999999,null],[30000000000,300],[49999999999,300],[50000000000,500],[100000000000,1000],[300000000000,3000],[500000000000,5000],[1000000000000,10000],[2000000000000,10000]])assert.equal(tradingValueBand(amount),band);
});
test('only app and chart main frames can request integer domestic trading values through IPC',()=>{
 const {registerChartWindow}=require('../src/chart/window.cjs'),handlers=new Map(),main={webContents:{mainFrame:{}}};let child,calls=[],ranges=[];
 class Window extends EventEmitter{constructor(){super();child=this;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};}isDestroyed(){return false;}setMenuBarVisibility(){}loadFile(){return Promise.resolve();}close(){}}
 registerChartWindow({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},BrowserWindow:Window,getMainWindow:()=>main,appDir:'/app',getTradingValues:(code,range)=>{calls.push(code);ranges.push(range);return {ok:true};}});
 const get=(sender,frame,code='005930')=>handlers.get('get-chart-trading-values')({sender,senderFrame:frame},code);assert.equal(get({}).ok,false);assert.equal(get(main.webContents,{}).ok,false);assert.equal(get(main.webContents,main.webContents.mainFrame,'../005930').ok,false);assert.equal(calls.length,0);assert.equal(get(main.webContents,main.webContents.mainFrame).ok,true);
 handlers.get('open-chart-window')({sender:main.webContents},{code:'005930',period:'6m'});assert.equal(get(child.webContents,child.webContents.mainFrame).ok,true);assert.deepEqual(calls,['005930','005930']);assert.equal(handlers.get('get-chart-trading-values')({sender:main.webContents,senderFrame:main.webContents.mainFrame},'005930',{start:'2026-02-30',end:'2026-09-30'}).ok,false);assert.equal(calls.length,2);const requested={start:'2026-08-01',end:'2026-09-30'};assert.equal(handlers.get('get-chart-trading-values')({sender:main.webContents,senderFrame:main.webContents.mainFrame},'005930',requested).ok,true);assert.deepEqual(ranges[2],requested);assert.equal(handlers.get('get-chart-trading-values')({sender:child.webContents,senderFrame:{}},'005930',requested).ok,false);assert.equal(calls.length,3);
});

const history=require('../src/chart/trading-history.js');
function historyFixture(count=300){
 const candles=Array.from({length:count},(_,i)=>({date:new Date(Date.UTC(2024,3,i+1)).toISOString().slice(0,10),open:100,high:110,low:95,close:105,volume:100+i}));
 const rows=candles.map(c=>({date:c.date,value:500000000000,volume:c.volume}));
 const page=rows=>({ok:true,stockCode:'005930',source:'KIS',market:'KRX',currency:'KRW',unit:'원',fetchedAt:at,rows});
 return {candles,rows,page};
}
test('history ranges keep fixed KRX endpoint, validate before auth, cache each range separately and accept explicit empty pages',async()=>{
 const calls=[];let auth=0;const {tradingRange}=require('../src/chart/trading-value.cjs');
 const p=createTradingValueProvider({now:()=>Date.parse(at),minPageIntervalMs:0,getAuth:async()=>{auth++;return {token:'mock'};},httpsGet:async url=>{calls.push(new URL(url));return response('005930',[]);}});
 for(const range of [null,{},[],{start:'2026-02-30',end:'2026-09-30'},{start:'2026-10-02',end:'2026-10-01'},{start:'2026-09-01',end:'2027-01-01'},{start:'2026-09-01',end:'2026-09-30',url:'https://evil.test'}])assert.equal((await p.get('005930',range)).ok,false);
 assert.equal(auth,0);assert.equal(tradingRange(undefined),null);
 const range={start:'2026-08-01',end:'2026-09-30'},a=await p.get('005930',range);assert.equal(a.ok,true);assert.deepEqual(a.rows,[]);await p.get('005930',range);assert.equal(calls.length,1);await p.get('005930',{...range,end:'2026-09-01'});assert.equal(calls.length,2);
 assert.equal(calls[0].origin,'https://openapi.koreainvestment.com:9443');assert.equal(calls[0].searchParams.get('FID_INPUT_DATE_1'),'20260801');assert.equal(calls[0].searchParams.get('FID_INPUT_DATE_2'),'20260930');assert.equal(calls[0].searchParams.get('FID_COND_MRKT_DIV_CODE'),'J');assert.equal(calls[0].searchParams.get('FID_ORG_ADJ_PRC'),'1');
});
test('history uses cached latest rows, moves the end date backwards, joins multiple pages and retains source amounts',async()=>{
 const {candles,rows,page}=historyFixture(),calls=[],updates=[];
 const result=await history.load({code:'005930',candles,initial:page(rows.slice(-100)),fetchPage:async(code,range)=>{calls.push({code,...range});return page(rows.filter(r=>r.date>=range.start&&r.date<=range.end).slice(-100).reverse());},onUpdate:data=>updates.push(data)});
 assert.equal(calls.length,2);assert.equal(calls[0].end,new Date(Date.parse(rows[200].date+'T00:00:00Z')-86400000).toISOString().slice(0,10));assert.ok(calls[1].end<calls[0].end);assert.equal(result.history.status,'complete');assert.equal(result.history.matched,300);assert.equal(result.history.pages,2);assert.deepEqual(result.rows,rows);assert.ok(updates.some(d=>d.rows.length===200));assert.equal(tradingValues(aggregate(candles),candles,result).matched,300);
 assert.throws(()=>tradingValues(aggregate(candles),candles,{...result,rows:Array(1001).fill(rows[0])}));
});
test('history stops at caps, empty ranges, repeated/wrong responses and preserves prior rows as partial',async()=>{
 const {candles,rows,page}=historyFixture(450),initial=page(rows.slice(-100));
 const partial=await history.load({code:'005930',candles,initial,maxPages:1,fetchPage:async(_code,r)=>page(rows.filter(v=>v.date<=r.end).slice(-100))});assert.equal(partial.history.status,'limit');assert.equal(partial.history.matched,200);assert.equal(partial.history.partial,true);let limitedCalls=0;const limited=await history.load({code:'005930',candles,initial,fetchPage:async(_code,r)=>{limitedCalls++;return page(rows.filter(v=>v.date<=r.end).slice(-1));}});assert.equal(limitedCalls,10);assert.equal(limited.history.status,'limit');assert.equal(limited.rows.length,110);
 const empty=await history.load({code:'005930',candles,initial,fetchPage:async()=>page([])});assert.equal(empty.history.status,'exhausted');assert.deepEqual(empty.rows,initial.rows);
 for(const bad of [{...page(rows.slice(-100)),stockCode:'000660'},page([rows[0],rows[0]]),{...page([]),ok:false,error:'private mock'},page(rows.slice(-101))]){const result=await history.load({code:'005930',candles,initial,fetchPage:async()=>bad});assert.equal(result.history.status,'request-failed');assert.deepEqual(result.rows,initial.rows);assert.doesNotMatch(JSON.stringify(result),/private mock/);}
 let calls=0;const repeated=page(rows.slice(-200,-100)),result=await history.load({code:'005930',candles,initial,fetchPage:async()=>{calls++;return repeated;}});assert.equal(calls,2);assert.equal(result.history.status,'request-failed');assert.equal(result.rows.length,200);
 const mismatch=await history.load({code:'005930',candles: candles.slice(-100),initial:page(rows.slice(-100).map(r=>({...r,volume:1}))),fetchPage:async()=>{throw Error('must not call');}});assert.equal(mismatch.history.status,'range-end');assert.equal(mismatch.history.matched,0);assert.equal(mismatch.history.missing,100);
});
test('history cancellation and deadline finish promptly without applying late pages or inventing missing rows',async()=>{
 const {candles,rows,page}=historyFixture(),initial=page(rows.slice(-100)),controller=new AbortController(),updates=[];let finish;
 const task=history.load({code:'005930',candles,initial,signal:controller.signal,fetchPage:()=>new Promise(r=>finish=r),onUpdate:d=>updates.push(d)});await Promise.resolve();controller.abort();const cancelled=await task;assert.equal(cancelled.history.status,'cancelled');assert.equal(cancelled.rows.length,100);const count=updates.length;finish(page(rows.slice(-200,-100)));await Promise.resolve();assert.equal(updates.length,count);
 const timed=await history.load({code:'005930',candles,initial,totalTimeoutMs:15,fetchPage:()=>new Promise(()=>{})});assert.equal(timed.history.status,'timeout');assert.equal(timed.rows.length,100);
 await assert.rejects(history.load({code:'005930',candles,initial,maxPages:11,fetchPage:async()=>page([])}));
});

test('queued history page timeout cancels its delay and never sends a late API request',async()=>{
 let calls=0;const p=createTradingValueProvider({now:()=>Date.parse(at),timeoutMs:15,minPageIntervalMs:60,getAuth:async()=>({token:'mock'}),httpsGet:async()=>{calls++;return response('005930',[]);}});
 assert.equal((await p.get('005930',{start:'2026-01-01',end:'2026-09-01'})).ok,true);assert.equal((await p.get('005930',{start:'2026-01-01',end:'2026-08-01'})).ok,false);await new Promise(r=>setTimeout(r,65));assert.equal(calls,1);
});

test('history caps its target at 1000 received price dates and reaches that target with nine extra full pages',async()=>{
 const data=historyFixture(1200),candles=data.candles.map((c,i)=>({...c,date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10)})),rows=candles.map(c=>({date:c.date,volume:c.volume,value:500000000000})),original=structuredClone(candles);let calls=0;
 const result=await history.load({code:'005930',candles,initial:data.page(rows.slice(-100)),fetchPage:async(_code,range)=>{calls++;assert.equal(range.start,candles[200].date);return data.page(rows.filter(r=>r.date>=range.start&&r.date<=range.end).slice(-100));}});
 assert.equal(calls,9);assert.equal(result.history.status,'complete');assert.equal(result.history.target,1000);assert.equal(result.history.matched,1000);assert.equal(result.rows.length,1000);assert.equal(result.rows[0].date,candles[200].date);assert.equal(result.rows.at(-1).date,candles.at(-1).date);assert.deepEqual(candles,original);
});
