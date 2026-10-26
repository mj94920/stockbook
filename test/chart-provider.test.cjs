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
