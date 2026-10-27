'use strict';
const path = require('node:path');
const series = require('./series.js');
function chartContext(input) {
  if (!input || typeof input.code !== 'string' || !/^[a-z0-9.^=_-]{1,32}$/i.test(input.code)) throw Error('잘못된 차트 종목');
  const viewRange=input.viewRange??input.period,barCycle=input.barCycle??'day',indicatorCycle=input.indicatorCycle??barCycle;
  if(!series.ranges.includes(viewRange) || (input.period!==undefined && input.period!==viewRange) || indicatorCycle!==barCycle)throw Error('잘못된 차트 기간/주기');
  series.cycleConfig(barCycle);
  return {code:input.code,name:typeof input.name==='string'?input.name.slice(0,120):input.code,period:viewRange,viewRange,barCycle,indicatorCycle};
}
function registerChartWindow({ ipcMain, BrowserWindow, getMainWindow, appDir, getChartData }) {
  let child=null, latest=null, current=null, follow=true;
  const fromMain = event => !!getMainWindow() && event.sender === getMainWindow().webContents;
  const send = () => {if(child && !child.isDestroyed())child.webContents.send('chart-context',{...current,follow});};
  const update = input => { latest=chartContext(input);if(follow){current=latest;send();} };
  ipcMain.handle('get-chart-data',(event,code,cycle='day')=>{
    if(!fromMain(event) && (!child || event.sender!==child.webContents))return {ok:false,error:'요청한 화면을 확인할 수 없습니다.'};
    if(event.senderFrame && event.senderFrame!==event.sender.mainFrame)return {ok:false};
    return getChartData?getChartData(code,cycle):{ok:false,error:'일봉 공급자가 연결되지 않았습니다.'};
  });
  ipcMain.handle('get-chart-snapshot',(event,code)=>{
    if(!fromMain(event) && (!child || event.sender!==child.webContents))return {ok:false,error:'요청한 화면을 확인할 수 없습니다.'};
    return require('./snapshot.cjs').readSnapshot(code,appDir);
  });
  ipcMain.handle('set-chart-context',(event,input)=>{
    if(!fromMain(event))return {ok:false};
    try{update(input);return {ok:true};}catch{return {ok:false};}
  });
  ipcMain.handle('open-chart-window',(event,input)=>{
    if(!fromMain(event))return {ok:false};
    try{
      update(input);
      if(child && !child.isDestroyed()){child.show();child.focus();return {ok:true};}
      follow=true;current=latest;
      child=new BrowserWindow({width:1200,height:850,minWidth:700,minHeight:500,title:'상세 차트',
        webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(appDir,'src/chart/preload.cjs')}});
      const opened=child;
      child.setMenuBarVisibility(false);
      child.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      child.webContents.on('will-navigate',event=>event.preventDefault());
      child.webContents.on('did-finish-load',()=>{if(child===opened)send();});
      child.on('closed',()=>{if(child===opened)child=null;});
      child.loadFile(path.join(appDir,'chart.html')).catch(()=>{if(!opened.isDestroyed())opened.close();});
      return {ok:true};
    }catch{return {ok:false};}
  });
  ipcMain.handle('set-chart-view',(event,view)=>{
    if(!child || event.sender!==child.webContents || (event.senderFrame&&event.senderFrame!==child.webContents.mainFrame))return {ok:false};
    try{const next=chartContext({...current,barCycle:view.barCycle,indicatorCycle:view.barCycle,period:view.viewRange,viewRange:view.viewRange});current=next;follow=false;send();return {ok:true};}catch{return {ok:false};}
  });
  ipcMain.handle('set-chart-follow',(event,value)=>{
    if(!child || event.sender!==child.webContents || typeof value!=='boolean')return {ok:false};
    follow=value;if(follow)current=latest;send();return {ok:true};
  });
  return {close:()=>{if(child&&!child.isDestroyed())child.close();}};
}
module.exports={chartContext,registerChartWindow};
