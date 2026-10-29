const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('stockBookChart',{
  onContext:callback=>{const handler=(_event,value)=>callback(value);ipcRenderer.on('chart-context',handler);return ()=>ipcRenderer.removeListener('chart-context',handler);},
  getData:(code,cycle='day')=>ipcRenderer.invoke('get-chart-data',code,cycle),
  getTradingValues:(code,range)=>ipcRenderer.invoke('get-chart-trading-values',code,range),
  searchStocks:query=>ipcRenderer.invoke('search-chart-stocks',query),
  selectStock:code=>ipcRenderer.invoke('select-chart-stock',code),
  getInvestors:code=>ipcRenderer.invoke('get-chart-investors',code),
  getSnapshot:code=>ipcRenderer.invoke('get-chart-snapshot',code),
  setView:value=>ipcRenderer.invoke('set-chart-view',value),
  setFollow:value=>ipcRenderer.invoke('set-chart-follow',value),
});
