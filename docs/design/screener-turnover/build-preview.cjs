'use strict';
const fs=require('node:fs'),path=require('node:path');
let html=require('../data-research-ai/build-preview.cjs');
html=html.replace('window.designPreviewReady=true;',"closeAnalysisDrawer();StockBookScreen.open();[...document.querySelectorAll('.sb-screen-actions button')].find(button=>button.textContent==='거래대금 조건 추가').click();window.designPreviewReady=true;");
fs.writeFileSync(path.join(__dirname,'preview.html'),html);
console.log('Built separate turnover-condition preview',Buffer.byteLength(html),'bytes');
