const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('stockBookChart',{
  onContext:callback=>{const handler=(_event,value)=>callback(value);ipcRenderer.on('chart-context',handler);return ()=>ipcRenderer.removeListener('chart-context',handler);},
  getData:(code,cycle='day')=>ipcRenderer.invoke('get-chart-data',code,cycle),
  getSnapshot:code=>ipcRenderer.invoke('get-chart-snapshot',code),
  setView:value=>ipcRenderer.invoke('set-chart-view',value),
  setFollow:value=>ipcRenderer.invoke('set-chart-follow',value),
});
