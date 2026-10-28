'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {parseInvestors,createInvestorProvider}=require('../src/chart/investor-provider.cjs');
const {investorSeries}=require('../src/chart/series.js');
const at='2026-10-28T00:00:00Z',row=(date='20261027',f='+1,000',o='-400',p='-200')=>({stck_bsop_date:date,frgn_ntby_qty:f,orgn_ntby_qty:o,prsn_ntby_qty:p});
const body=(rows=[row(),row('20261023','-300','200','150')],extra={})=>JSON.stringify({rt_cd:'0',output:rows,...extra});
test('investor quantities retain three reported signed groups and gaps, never infer personal buying or holdings',()=>{
 const data=parseInvestors(body(),'005930',at);assert.equal(data.market,'KRX');assert.equal(data.unit,'주');assert.deepEqual(data.rows,[{date:'2026-10-23',foreign:-300,institution:200,individual:150},{date:'2026-10-27',foreign:1000,institution:-400,individual:-200}]);assert.equal(data.rows[1].foreign+data.rows[1].institution+data.rows[1].individual,400);assert.equal(data.rows[0].holdings,undefined);
 assert.deepEqual(investorSeries(data.rows).at(-1).cumulative,{foreign:700,institution:-200,individual:-50});assert.equal(investorSeries(data.rows).length,2);
 assert.equal(parseInvestors(body([row('20261027','0','0','0'),{}]),'005930',at).rows[0].foreign,0);
});
test('investor parser rejects missing groups, response failure, contradictory code, bad dates, duplicates and unsafe prefixes',()=>{
 const invalid=[body([]),body([row()],{rt_cd:'1'}),body([row()],{stockCode:'000660'}),body([{...row(),stck_shrn_iscd:'000660'}]),body([row('20260230')]),body([row('20261029')]),body([row(),row()]),body([row('20261027','1.5')]),body([row('20261027','9007199254740992')]),body([{...row(),prsn_ntby_qty:''}]),body(Array(101).fill(row())),body([row('20261023','9007199254740991'),row('20261026','1'),row('20261027','-9007199254740991')])];
 for(const input of invalid)assert.throws(()=>parseInvestors(input,'005930',at));
 assert.throws(()=>investorSeries([{date:'2026-10-23',foreign:1,institution:2,individual:3},{date:'2026-10-23',foreign:2,institution:3,individual:4}]));
});
test('investor provider uses one fixed daily investor request, shares cache, and releases aborted or unauthenticated reads',async()=>{
 let now=Date.parse(at),calls=[],authCalls=0,finish;const auth={token:'mock',appKey:'mock',appSecret:'mock'};
 const p=createInvestorProvider({now:()=>now,getAuth:async()=>{authCalls++;return auth;},httpsGet:(url,t,headers,opt)=>{calls.push({url,tr:headers.tr_id,signal:opt.signal});return new Promise(r=>finish=r);}});
 for(const code of ['AAPL','../005930',123])assert.equal((await p.get(code)).ok,false);assert.equal(authCalls,0);
 const a=p.get('005930'),b=p.get('005930');await Promise.resolve();assert.equal(calls.length,1);const url=new URL(calls[0].url);assert.equal(url.origin,'https://openapi.koreainvestment.com:9443');assert.equal(url.pathname,'/uapi/domestic-stock/v1/quotations/inquire-investor');assert.equal(url.searchParams.get('FID_INPUT_ISCD'),'005930');assert.equal(url.searchParams.get('FID_COND_MRKT_DIV_CODE'),'J');assert.equal(calls[0].tr,'FHKST01010900');finish(body());assert.equal((await a).ok,true);assert.equal((await b).ok,true);await p.get('005930');assert.equal(calls.length,1);
 now+=60001;const next=p.get('005930');await Promise.resolve();finish(body());await next;assert.equal(calls.length,2);
 let signal,tries=0;const retry=createInvestorProvider({now:()=>Date.parse(at),timeoutMs:15,getAuth:async()=>auth,httpsGet:(_u,_t,_h,opt)=>{signal=opt.signal;return ++tries===1?new Promise(()=>{}):Promise.resolve(body());}});assert.equal((await retry.get('005930')).ok,false);assert.equal(signal.aborted,true);assert.equal((await retry.get('005930')).ok,true);
 let network=0;const missing=createInvestorProvider({getAuth:async()=>null,httpsGet:async()=>network++});assert.equal((await missing.get('005930')).ok,false);assert.equal(network,0);
 const error=await createInvestorProvider({getAuth:async()=>{throw Error('secret mock');}}).get('005930');assert.equal(error.ok,false);assert.doesNotMatch(error.error,/secret/);
});
test('investor IPC only accepts valid domestic codes from app and known chart main frames',()=>{
 const {registerChartWindow}=require('../src/chart/window.cjs'),handlers=new Map(),main={webContents:{mainFrame:{}}};let child,calls=[];
 class Window extends EventEmitter{constructor(){super();child=this;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};}isDestroyed(){return false;}setMenuBarVisibility(){}loadFile(){return Promise.resolve();}}
 registerChartWindow({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},BrowserWindow:Window,getMainWindow:()=>main,appDir:'/app',getInvestors:code=>{calls.push(code);return {ok:true};}});
 const get=(sender,frame,code='005930')=>handlers.get('get-chart-investors')({sender,senderFrame:frame},code);assert.equal(get({}).ok,false);assert.equal(get(main.webContents,{}).ok,false);assert.equal(get(main.webContents,main.webContents.mainFrame,'../../evil').ok,false);assert.equal(calls.length,0);assert.equal(get(main.webContents,main.webContents.mainFrame).ok,true);handlers.get('open-chart-window')({sender:main.webContents},{code:'005930',period:'6m'});assert.equal(get(child.webContents,child.webContents.mainFrame).ok,true);assert.deepEqual(calls,['005930','005930']);
});
