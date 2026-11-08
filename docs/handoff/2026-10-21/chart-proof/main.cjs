const {app, BrowserWindow, ipcMain, net} = require('electron');
const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs');
const {parseDaily} = require('./parse.cjs');
app.name = 'StockBookChartProof';
app.setPath('userData', path.join(app.getPath('temp'), 'StockBookChartProof'));
const URL_FIXED = 'https://fchart.stock.naver.com/sise.nhn?symbol=005930&timeframe=day&count=300&requestType=0';
const LIMIT = 256 * 1024;
let busy = false;
function nodeGet() {
  return new Promise((resolve, reject) => {
    const req = https.get(URL_FIXED, {headers:{'User-Agent':'Mozilla/5.0'}}, res => {
      if (res.statusCode !== 200) {res.resume(); reject(new Error(`HTTP_${res.statusCode}`)); return;}
      const chunks=[]; let size=0;
      res.on('data', chunk => {size+=chunk.length;if(size>LIMIT) req.destroy(new Error('OUTPUT_LIMIT'));else chunks.push(chunk);});
      res.on('error', reject);
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    const timer=setTimeout(()=>req.destroy(new Error('TIMEOUT_10000MS')),10000);
    req.on('close',()=>clearTimeout(timer));req.on('error', reject);
  });
}
async function electronGet() {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try {
    const res=await net.fetch(URL_FIXED,{signal:controller.signal});
    if(!res.ok) throw new Error(`HTTP_${res.status}`);
    const reader=res.body.getReader(); const chunks=[]; let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();throw new Error('OUTPUT_LIMIT');}chunks.push(Buffer.from(value));}
    return Buffer.concat(chunks).toString('utf8');
  } finally {clearTimeout(timer);}
}
app.whenReady().then(()=>{
  const win=new BrowserWindow({width:1200,height:820,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  ipcMain.handle('proof:fetch',async(event,mode)=>{
    if(event.sender!==win.webContents || !['node','electron','sample'].includes(mode)) return {ok:false,error:'INVALID_REQUEST'};
    if(busy)return {ok:false,error:'BUSY'};
    busy=true;const started=Date.now();
    try{
      const text=mode==='sample'?fs.readFileSync(path.join(__dirname,'received-sample.xml'),'utf8'):await(mode==='node'?nodeGet():electronGet());
      const candles=parseDaily(text);
      return {ok:true,mode,source:'Naver fchart / 005930',receivedAt:new Date().toISOString(),sampleCapturedAt:mode==='sample'?'2026-10-20T08:00:53Z':null,elapsedMs:Date.now()-started,candles,runtime:{platform:process.platform,electron:process.versions.electron,node:process.versions.node}};
    }catch(e){return {ok:false,mode,error:e.message,elapsedMs:Date.now()-started,runtime:{platform:process.platform,electron:process.versions.electron,node:process.versions.node}};}
    finally{busy=false;}
  });
  win.loadFile('index.html');
});
app.on('window-all-closed',()=>app.quit());
