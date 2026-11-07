'use strict';
const fs=require('node:fs'),path=require('node:path');
let html=require('../data-research-ai/build-preview.cjs');
html=html.replace('window.designPreviewReady=true;','closeAnalysisDrawer();StockBookScreen.open();window.designPreviewReady=true;');
fs.writeFileSync(path.join(__dirname,'preview.html'),html);
console.log('Built temporal condition preview',Buffer.byteLength(html),'bytes');
