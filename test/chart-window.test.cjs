const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {chartContext,registerChartWindow}=require('../src/chart/window.cjs');
test('validates stock and supported period',()=>{assert.deepEqual(chartContext({code:'005930',name:'삼성전자',period:'6m'}),{code:'005930',name:'삼성전자',period:'6m'});for(const x of [{code:'../../x',period:'6m'},{code:'005930',period:'bad'},{}])assert.throws(()=>chartContext(x));});
test('detail window follows selection, pins context, resumes latest and rejects other senders',async()=>{
 const handlers=new Map(),main={webContents:{}},sent=[];let child;
 class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.send=(_channel,value)=>sent.push(value);this.webContents.setWindowOpenHandler=()=>{};child=this;}isDestroyed(){return false;}setMenuBarVisibility(){}show(){}focus(){}loadFile(){this.webContents.emit('did-finish-load');return Promise.resolve();}close(){this.emit('closed');}}
 const service=registerChartWindow({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},BrowserWindow:Window,getMainWindow:()=>main,appDir:'/app'});
 const call=(key,value,sender=main.webContents)=>handlers.get(key)({sender},value);
 assert.equal(call('open-chart-window',{code:'005930',period:'6m'}).ok,true);
 assert.equal(child.options.webPreferences.contextIsolation,true);assert.equal(child.options.webPreferences.nodeIntegration,false);
 call('set-chart-context',{code:'000660',period:'3m'});assert.equal(sent.at(-1).code,'000660');
 call('set-chart-follow',false,child.webContents);call('set-chart-context',{code:'035420',period:'1y'});assert.equal(sent.at(-1).code,'000660');
 assert.equal(call('set-chart-context',{code:'999999',period:'1m'},{}).ok,false);
 call('set-chart-follow',true,child.webContents);assert.equal(sent.at(-1).code,'035420');assert.equal(sent.at(-1).period,'1y');
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
  for(const file of ['src/chart/renderer.js','src/chart/client.js','src/chart/chart.css','src/chart/proof-data/long-candles.json'])assert.equal(fs.existsSync(path.join(staged.directory,file)),true);
  const pkg=require('../package.json');assert.ok(pkg.build.files.includes('src/chart/**'));assert.ok(pkg.build.files.includes('src/desktop/renderer-files.cjs'));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
