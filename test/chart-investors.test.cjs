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

test('unpublished investor quantities omit the whole date without inventing zero and retain valid history',()=>{
 const data=parseInvestors(body([row('20261028','','',''),row('20261027','  +1,000 ','-400','-200')]),'005930',at);assert.equal(data.rows.length,1);assert.equal(data.omittedRows,1);assert.equal(data.rows[0].foreign,1000);
 const partial=parseInvestors(body([row('20261028','100','','20'),row('20261027')]),'005930',at);assert.equal(partial.omittedRows,1);assert.equal(partial.rows.length,1);assert.throws(()=>parseInvestors(body([row('20261028','','','')]),'005930',at));
});
test('Naver fallback validates each code and three reported groups, declares a distinct source and never sends KIS credentials',async()=>{
 const {parseNaverInvestors}=require('../src/chart/investor-provider.cjs'),payload={itemCode:'005930',dealTrendInfos:[{itemCode:'005930',bizdate:'20261027',foreignerPureBuyQuant:'+1,000',organPureBuyQuant:'-400',individualPureBuyQuant:'-200'}]};
 const parsed=parseNaverInvestors(JSON.stringify(payload),'005930',at);assert.equal(parsed.source,'Naver');assert.equal(parsed.market,'provider');assert.equal(parsed.rows[0].individual,-200);assert.throws(()=>parseNaverInvestors(JSON.stringify({...payload,itemCode:'000660'}),'005930',at));assert.throws(()=>parseNaverInvestors(JSON.stringify({...payload,dealTrendInfos:[{...payload.dealTrendInfos[0],itemCode:'000660'}]}),'005930',at));
 const calls=[];const p=createInvestorProvider({now:()=>Date.parse(at),naverFallback:true,getAuth:async()=>({token:'mock',appKey:'mock',appSecret:'mock'}),httpsGet:async(url,_t,headers)=>{calls.push({url,headers});return url.startsWith('https://openapi.')?JSON.stringify({rt_cd:'1',msg_cd:'EGW_TEST',msg1:'secret mock must not leak'}):JSON.stringify(payload);}});
 const result=await p.get('005930');assert.equal(result.ok,true);assert.equal(result.source,'Naver');assert.equal(result.primaryErrorCode,'EGW_TEST');assert.doesNotMatch(result.primaryError,/secret/);assert.equal(calls.length,2);assert.equal(calls[1].url,'https://m.stock.naver.com/api/stock/005930/integration');assert.equal(calls[1].headers.authorization,undefined);assert.equal(calls[1].headers.appkey,undefined);await p.get('005930');assert.equal(calls.length,2);
 const primary=createInvestorProvider({now:()=>Date.parse(at),naverFallback:true,getAuth:async()=>({token:'mock'}),httpsGet:async url=>{assert.ok(url.startsWith('https://openapi.'));return body();}});assert.equal((await primary.get('005930')).source,'KIS');
 const missing=createInvestorProvider({now:()=>Date.parse(at),naverFallback:true,getAuth:async()=>null,httpsGet:async url=>{assert.ok(url.startsWith('https://m.stock.naver.com/'));return JSON.stringify(payload);}});assert.equal((await missing.get('005930')).primaryErrorCode,'KIS_AUTH');
 const http=createInvestorProvider({now:()=>Date.parse(at),naverFallback:true,getAuth:async()=>({token:'mock'}),httpsGet:async url=>{if(url.startsWith('https://openapi.'))throw Error('HTTP 403');return JSON.stringify(payload);}});assert.equal((await http.get('005930')).primaryErrorCode,'HTTP_403');
});
test('public fallback deadline aborts and errors preserve a safe KIS failure code without a successful cache',async()=>{
 let signal,calls=0;const p=createInvestorProvider({now:()=>Date.parse(at),naverFallback:true,fallbackTimeoutMs:15,getAuth:async()=>null,httpsGet:(_u,_t,_h,options)=>{signal=options.signal;calls++;return new Promise(()=>{});}});const result=await p.get('005930');assert.equal(result.ok,false);assert.match(result.error,/KIS 연결/);assert.equal(signal.aborted,true);await p.get('005930');assert.equal(calls,2);
});
