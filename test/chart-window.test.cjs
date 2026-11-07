const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {chartContext,registerChartWindow}=require('../src/chart/window.cjs');
test('validates stock and supported period',()=>{assert.deepEqual(chartContext({code:'005930',name:'삼성전자',period:'6m'}),{code:'005930',name:'삼성전자',period:'6m',viewRange:'6m',barCycle:'day',indicatorCycle:'day'});for(const x of [{code:'../../x',period:'6m'},{code:'005930',period:'bad'},{}])assert.throws(()=>chartContext(x));});
test('detail window follows selection, pins context, resumes latest and rejects other senders',async()=>{
 const handlers=new Map(),main={webContents:{}},sent=[];let child;
 class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.send=(_channel,value)=>sent.push(value);this.webContents.setWindowOpenHandler=()=>{};child=this;}isDestroyed(){return false;}setMenuBarVisibility(){}show(){}focus(){}loadFile(){this.webContents.emit('did-finish-load');return Promise.resolve();}close(){this.emit('closed');}}
 const service=registerChartWindow({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},BrowserWindow:Window,getMainWindow:()=>main,appDir:'/app'});
 const call=(key,value,sender=main.webContents)=>handlers.get(key)({sender},value);
 assert.equal(call('open-chart-window',{code:'005930',period:'6m'}).ok,true);
 assert.equal(child.options.webPreferences.contextIsolation,true);assert.equal(child.options.webPreferences.nodeIntegration,false);
 call('set-chart-context',{code:'000660',period:'all',barCycle:'week'});assert.equal(sent.at(-1).code,'000660');assert.equal(sent.at(-1).barCycle,'week');assert.equal(sent.at(-1).viewRange,'all');
 call('set-chart-follow',false,child.webContents);call('set-chart-context',{code:'035420',period:'1y',barCycle:'month'});assert.equal(sent.at(-1).code,'000660');assert.equal(sent.at(-1).barCycle,'week');
 assert.equal(call('set-chart-context',{code:'999999',period:'1m'},{}).ok,false);
 call('set-chart-follow',true,child.webContents);assert.equal(sent.at(-1).code,'035420');assert.equal(sent.at(-1).period,'1y');assert.equal(sent.at(-1).barCycle,'month');assert.equal(sent.at(-1).indicatorCycle,'month');
 service.close();
});

test('recorded chart data is identified and never used for another stock',()=>{
 const {readSnapshot}=require('../src/chart/snapshot.cjs');const path=require('node:path');
 const app=path.resolve(__dirname,'..'),snapshot=readSnapshot('005930',app);
 assert.equal(snapshot.ok,true);assert.equal(snapshot.metadata.automaticRefresh,false);assert.equal(snapshot.metadata.lastBarComplete,false);
 assert.equal(snapshot.candles.length,1000);assert.equal(snapshot.candles.at(-1).date,'2026-10-22');assert.equal(snapshot.investors.rows.length,5);
 for(const code of ['000660','../005930','AAPL'])assert.equal(readSnapshot(code,app).ok,false);
 const {prepareRendererFiles}=require('../src/desktop/renderer-files.cjs');const fs=require('node:fs');const os=require('node:os');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sb-chart-package-'));
 try{
  const staged=prepareRendererFiles(app,temp);
  for(const file of ['src/desktop/shortcuts.js','src/chart/renderer.js','src/chart/series.js','src/chart/client.js','src/chart/chart.css','src/chart/proof-data/long-candles.json'])assert.equal(fs.existsSync(path.join(staged.directory,file)),true);
  const pkg=require('../package.json');assert.ok(pkg.build.files.includes('src/chart/**'));assert.ok(pkg.build.files.includes('src/desktop/renderer-files.cjs'));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});


test('late load failure from a closed window does not close its replacement',async()=>{
 const handlers=new Map(),main={webContents:{}},windows=[];
 class Window extends EventEmitter{
  constructor(){super();this.destroyed=false;this.webContents=new EventEmitter();this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
  isDestroyed(){return this.destroyed;}setMenuBarVisibility(){}show(){}focus(){}
  loadFile(){return new Promise((_resolve,reject)=>{this.fail=reject;});}
  close(){this.destroyed=true;this.emit('closed');}
 }
 registerChartWindow({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},BrowserWindow:Window,getMainWindow:()=>main,appDir:'/app'});
 const open=()=>handlers.get('open-chart-window')({sender:main.webContents},{code:'005930',period:'6m'});
 assert.equal(open().ok,true);const old=windows[0];old.close();
 assert.equal(open().ok,true);const replacement=windows[1];
 old.fail(Error('closed while loading'));await Promise.resolve();
 assert.equal(replacement.isDestroyed(),false);
 old.emit('closed');assert.equal(open().ok,true);assert.equal(windows.length,2);
 replacement.close();replacement.fail(Error('closed'));await Promise.resolve();
});

test('detail view changes pin its cycle and range; only the known child may change it, and follow restores latest',()=>{
 const handlers=new Map(),main={webContents:{}},sent=[];let child;
 class Window extends EventEmitter{constructor(){super();child=this;this.webContents=new EventEmitter();this.webContents.send=(_channel,value)=>sent.push(value);this.webContents.setWindowOpenHandler=()=>{};}isDestroyed(){return false;}setMenuBarVisibility(){}loadFile(){this.webContents.emit('did-finish-load');return Promise.resolve();}close(){}show(){}focus(){}}
 registerChartWindow({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},BrowserWindow:Window,getMainWindow:()=>main,appDir:'/app'});
 handlers.get('open-chart-window')({sender:main.webContents},{code:'005930',period:'6m',barCycle:'month'});
 const change=(sender,view)=>handlers.get('set-chart-view')({sender},view);
 assert.equal(change(main.webContents,{barCycle:'year',viewRange:'all'}).ok,false);assert.equal(change(child.webContents,{barCycle:'minute',viewRange:'all'}).ok,false);
 assert.equal(change(child.webContents,{barCycle:'year',viewRange:'all'}).ok,true);assert.equal(sent.at(-1).follow,false);assert.equal(sent.at(-1).barCycle,'year');assert.equal(sent.at(-1).viewRange,'all');
 handlers.get('set-chart-context')({sender:main.webContents},{code:'000660',period:'3m',barCycle:'week'});assert.equal(sent.at(-1).code,'005930');
 handlers.get('set-chart-follow')({sender:child.webContents},true);assert.equal(sent.at(-1).code,'000660');assert.equal(sent.at(-1).barCycle,'week');assert.equal(sent.at(-1).viewRange,'3m');
});

test('detail-only search selects canonical stock, preserves view, pins only detail and rejects stale or foreign selections',async()=>{
 const handlers=new Map(),main={webContents:{mainFrame:{}}},sent=[];let child,calls=0,resolveSlow;
 class Window extends EventEmitter{constructor(){super();child=this;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(_c,v)=>sent.push(v);}isDestroyed(){return false;}setMenuBarVisibility(){}loadFile(){return Promise.resolve();}show(){}focus(){}}
 registerChartWindow({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},BrowserWindow:Window,getMainWindow:()=>main,appDir:'/app',searchStocks:q=>{calls++;return {ok:true,items:[{code:'000660',name:q}]};},resolveStock:async code=>code==='000660'?new Promise(r=>resolveSlow=r):{code,name:'공식 명칭'}});
 const mainEvent={sender:main.webContents,senderFrame:main.webContents.mainFrame};handlers.get('open-chart-window')(mainEvent,{code:'005930',name:'삼성전자',barCycle:'month',period:'1y'});const event={sender:child.webContents,senderFrame:child.webContents.mainFrame};
 assert.equal(handlers.get('search-chart-stocks')(mainEvent,'삼성').ok,false);assert.equal(handlers.get('search-chart-stocks')({...event,senderFrame:{}},'삼성').ok,false);assert.equal(calls,0);assert.equal(handlers.get('search-chart-stocks')(event,'삼성').ok,true);
 assert.equal((await handlers.get('select-chart-stock')(event,'../../evil')).ok,false);
 const slow=handlers.get('select-chart-stock')(event,'000660'),fast=await handlers.get('select-chart-stock')(event,'035420');resolveSlow({code:'000660',name:'늦은 응답'});assert.equal((await slow).ok,false);assert.equal(fast.ok,true);assert.equal(sent.at(-1).code,'035420');assert.equal(sent.at(-1).name,'공식 명칭');assert.equal(sent.at(-1).barCycle,'month');assert.equal(sent.at(-1).viewRange,'1y');assert.equal(sent.at(-1).follow,false);
 handlers.get('set-chart-context')(mainEvent,{code:'010130',name:'종합 선택',barCycle:'week',period:'6m'});assert.equal(sent.at(-1).code,'035420');handlers.get('set-chart-follow')(event,true);assert.equal(sent.at(-1).code,'010130');assert.equal(sent.at(-1).barCycle,'week');
 const pending=handlers.get('select-chart-stock')(event,'000660');handlers.get('set-chart-follow')(event,true);resolveSlow({code:'000660',name:'취소된 선택'});assert.equal((await pending).ok,false);assert.equal(sent.at(-1).code,'010130');
});
