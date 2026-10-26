const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('stockBookChart',{
  onContext:callback=>{const handler=(_event,value)=>callback(value);ipcRenderer.on('chart-context',handler);return ()=>ipcRenderer.removeListener('chart-context',handler);},
  getData:code=>ipcRenderer.invoke('get-chart-data',code),
  getSnapshot:code=>ipcRenderer.invoke('get-chart-snapshot',code),
  setFollow:value=>ipcRenderer.invoke('set-chart-follow',value),
});
