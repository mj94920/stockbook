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
 const {registerChartWindow}=require('../src/chart/window.cjs'),handlers=new Map(),main={webContents:{mainFrame:{}}};let child,calls=[];
 class Window extends EventEmitter{constructor(){super();child=this;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};}isDestroyed(){return false;}setMenuBarVisibility(){}loadFile(){return Promise.resolve();}close(){}}
 registerChartWindow({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},BrowserWindow:Window,getMainWindow:()=>main,appDir:'/app',getTradingValues:code=>{calls.push(code);return {ok:true};}});
 const get=(sender,frame,code='005930')=>handlers.get('get-chart-trading-values')({sender,senderFrame:frame},code);assert.equal(get({}).ok,false);assert.equal(get(main.webContents,{}).ok,false);assert.equal(get(main.webContents,main.webContents.mainFrame,'../005930').ok,false);assert.equal(calls.length,0);assert.equal(get(main.webContents,main.webContents.mainFrame).ok,true);
 handlers.get('open-chart-window')({sender:main.webContents},{code:'005930',period:'6m'});assert.equal(get(child.webContents,child.webContents.mainFrame).ok,true);assert.deepEqual(calls,['005930','005930']);
});
