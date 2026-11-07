'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {parseDaily,createChartProvider}=require('../src/chart/provider.cjs');
const {registerChartWindow}=require('../src/chart/window.cjs');
const xml=(code='000660',rows=['20261023|100|130|90|120|200','20261026|120|150|110|140|300'])=>`<?xml version="1.0" encoding="EUC-KR"?><protocol><chartdata symbol="${code}" name="검증 &amp; 종목" timeframe="day">${rows.map(row=>`<item data="${row}" />`).join('')}</chartdata></protocol>`;
test('daily provider retains requested stock and OHLCV, and never attaches Samsung investor data',()=>{
 const data=parseDaily(xml(),'000660','2026-10-26T03:00:00Z');assert.equal(data.metadata.stockCode,'000660');assert.equal(data.metadata.name,'검증 & 종목');assert.equal(data.metadata.sourceType,'naver-daily');assert.equal(data.metadata.snapshotDate,'2026-10-26');assert.equal(data.investors,null);
 assert.deepEqual(data.candles[1],{date:'2026-10-26',open:120,high:150,low:110,close:140,volume:300});
 const gap=parseDaily(xml('000660',['20261023|0|0|0|120|0','20261026|120|150|110|140|300']),'000660','2026-10-26T03:00:00Z');assert.equal(gap.metadata.omittedRows,1);assert.equal(gap.candles.length,1);
 for(const text of [xml('005930'),xml('000660',[]),xml('000660',['20260230|100|130|90|120|200']),xml('000660',['20261026|120|150|110|140|300','20261026|120|150|110|140|300']),xml().replace('</chartdata>',''),xml().replace('100|130|90|120','100|110|90|120'),'<!DOCTYPE chart SYSTEM "file:///etc/passwd">'+xml()])assert.throws(()=>parseDaily(text,'000660','2026-10-26T03:00:00Z'));
});
test('daily provider restricts destinations and codes, shares pending fetch, expires cache and retries failures',async()=>{
 let now=0,calls=[],resolve;const provider=createChartProvider({now:()=>now,httpsGet:url=>{calls.push(url);return new Promise(r=>resolve=r);}});
 for(const code of ['../000660','https://evil.test/','AAPL',123,'12345'])assert.equal((await provider.get(code)).ok,false);assert.equal(calls.length,0);
 const first=provider.get('000660'),second=provider.get('000660');await Promise.resolve();assert.equal(calls.length,1);assert.equal(calls[0],'https://fchart.stock.naver.com/sise.nhn?symbol=000660&timeframe=day&count=1000&requestType=0');resolve(xml());assert.equal((await first).ok,true);assert.equal((await second).ok,true);await provider.get('000660');assert.equal(calls.length,1);
 now=60001;const next=provider.get('000660');await Promise.resolve();resolve(xml());await next;assert.equal(calls.length,2);
 let failures=0;const retry=createChartProvider({httpsGet:async()=>{if(++failures===1)throw Error('network');return xml();}});assert.equal((await retry.get('000660')).ok,false);assert.equal((await retry.get('000660')).ok,true);
});
test('only the app main frame and known chart window can invoke daily data IPC',async()=>{
 const handlers=new Map(),main={webContents:{mainFrame:{}}};let child,calls=[];
 class Window extends EventEmitter{constructor(){super();child=this;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};}isDestroyed(){return false;}setMenuBarVisibility(){}loadFile(){return Promise.resolve();}close(){}show(){}focus(){}}
 registerChartWindow({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},BrowserWindow:Window,getMainWindow:()=>main,appDir:'/app',getChartData:code=>{calls.push(code);return {ok:true};}});
 const get=(sender,frame)=>handlers.get('get-chart-data')({sender,senderFrame:frame},'000660');assert.equal(get({}).ok,false);assert.equal(get(main.webContents,{}).ok,false);assert.equal(calls.length,0);
 assert.equal(get(main.webContents,main.webContents.mainFrame).ok,true);handlers.get('open-chart-window')({sender:main.webContents},{code:'000660',period:'all',barCycle:'week'});assert.equal(get(child.webContents,child.webContents.mainFrame).ok,true);assert.deepEqual(calls,['000660','000660']);
});
const {create}=require('../src/desktop/stock-selection.js');
test('catalog and held instruments can be selected without registration, and unstar keeps current instrument',()=>{
 const selection=create(),watchlist=[],portfolio=[{ticker:'010130',name:'보유 검증',currentPrice:100,avgPrice:1}],catalog=[{code:'000660',name:'목록 검증',price:200,change:12,changePct:6}];
 const lists={watchlist,portfolio,catalog};const stock=selection.select('000660','',lists);assert.equal(stock.price,200);assert.equal(stock.change,6);assert.equal(selection.resolve('000660',lists),stock);assert.equal(watchlist.length,0);
 const held=selection.select('010130','',lists);assert.equal(held.price,100);assert.equal(portfolio[0].price,undefined);assert.equal(watchlist.length,0);
 watchlist.push({ticker:'005930',name:'관심 검증',price:300});const watched=selection.select('005930','',lists);watchlist.pop();assert.equal(selection.resolve('005930',lists),watched);
 assert.equal(selection.select('bad/code','',lists),null);
 const noQuote=create().select('000001','보유만',{portfolio:[{ticker:'000001',avgPrice:999}],catalog:[],watchlist:[]});assert.equal(noQuote.price,null);
});

test('annual data requests use a separate bounded 3000-day history and leave day cache independent',async()=>{
 const calls=[];const provider=createChartProvider({httpsGet:async url=>{calls.push(url);return xml();}});
 assert.equal((await provider.get('000660','year')).ok,true);assert.match(calls[0],/count=3000&/);
 assert.equal((await provider.get('000660','day')).ok,true);assert.match(calls[1],/count=1000&/);
 await provider.get('000660','year');assert.equal(calls.length,2);assert.equal((await provider.get('000660','minute')).ok,false);assert.equal(calls.length,2);
});

test('integer-price one-won source bound contradictions are normalized and counted, larger errors still fail',()=>{
 const input=xml('000660',['20150127|27500|27999|27480|28000|199144']).replace('timeframe="day"','timeframe="day" precision="0"');
 const result=parseDaily(input,'000660','2026-10-27T00:00:00Z');assert.equal(result.candles[0].high,28000);assert.equal(result.metadata.normalizedBounds,1);assert.equal(result.candles[0].close,28000);
 assert.throws(()=>parseDaily(input.replace('27999','27998'),'000660','2026-10-27T00:00:00Z'));
});

test('chart total deadline aborts a stalled request, frees its pending cache and allows retry',async()=>{
 let calls=0,signal,finish;
 const provider=createChartProvider({requestTimeoutMs:20,httpsGet:(_url,_timeout,_headers,options)=>{signal=options.signal;if(++calls===1)return new Promise(resolve=>finish=resolve);return Promise.resolve(xml());}});
 const first=provider.get('000660'),shared=provider.get('000660');
 assert.match((await first).error,/시간이 초과/);assert.equal((await shared).ok,false);assert.equal(calls,1);assert.equal(signal.aborted,true);
 assert.equal((await provider.get('000660')).ok,true);assert.equal(calls,2);
 finish(xml('005930'));await Promise.resolve();assert.equal((await provider.get('000660')).metadata.stockCode,'000660');assert.equal(calls,2);
});

test('production HTTPS helper forwards chart cancellation and handles aborted response errors',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');const main=fs.readFileSync(require('node:path').join(__dirname,'../main.js'),'utf8');
 const start=main.indexOf('function httpsGet('),end=main.indexOf('\nfunction httpsPost(',start),controller=new AbortController();let received;
 const response=new EventEmitter();response.headers={};response.statusCode=200;
 const request=new EventEmitter();request.setTimeout=()=>{};
 const read=vm.runInNewContext('('+main.slice(start,end).trim()+')',{https:{get:(_url,options,callback)=>{received=options.signal;queueMicrotask(()=>callback(response));return request;}},Buffer,require});
 const pending=read('https://fchart.stock.naver.com/sise.nhn',12000,{}, {signal:controller.signal});await Promise.resolve();assert.equal(received,controller.signal);
 controller.abort();response.emit('error',Error('Response aborted'));request.emit('error',Error('Request aborted'));await assert.rejects(pending,/Response aborted/);
});

test('detail search reuses one catalog, ranks exact names, accepts direct codes without catalog and bounds responses',async()=>{
 const {createStockSearch}=require('../src/chart/stock-search.cjs');let markets=[],basic=[];
 const search=createStockSearch({loadMarket:async market=>{markets.push(market);return {ok:true,data:[{code:'005935',name:'삼성전자우',market},{code:'005930',name:'삼성전자',market},{code:'../bad',name:'악성 값'}]};},loadBasic:async code=>{basic.push(code);return {stockCode:code,stockName:'직접 코드'};}});
 assert.equal((await search.search('')).ok,false);assert.equal((await search.search('x'.repeat(41))).ok,false);assert.equal((await search.search({})).ok,false);assert.equal(markets.length,0);
 const direct=await search.search('999999');assert.deepEqual(direct.items,[{code:'999999',name:'직접 코드',market:''}]);assert.equal(markets.length,0);
 const [a,b]=await Promise.all([search.search('삼성'),search.search('삼성 전자')]);assert.equal(a.items.length,2);assert.equal(b.items[0].code,'005930');assert.equal(markets.length,3);assert.equal((await search.resolve('005930')).name,'삼성전자');assert.deepEqual(basic,['999999']);assert.equal(await search.resolve('../bad'),null);assert.equal((await search.search('없는 이름')).items.length,0);
 const bad=createStockSearch({loadMarket:async()=>({ok:false}),loadBasic:async()=>({stockCode:'000660',stockName:'다른 코드'})});assert.equal((await bad.search('005930')).ok,false);assert.equal((await bad.search('삼성')).ok,false);
 const slow=createStockSearch({timeoutMs:15,loadMarket:async()=>new Promise(()=>{}),loadBasic:async()=>new Promise(()=>{})});assert.equal((await slow.search('삼성')).ok,false);assert.equal((await slow.search('005930')).ok,false);
});
