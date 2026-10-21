const {contextBridge, ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('chartProof',{fetch:mode=>ipcRenderer.invoke('proof:fetch',mode)});
