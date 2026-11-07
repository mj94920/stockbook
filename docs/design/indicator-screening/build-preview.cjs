'use strict';
const fs=require('node:fs'),path=require('node:path');
// Reuse the offline desktop renderer and recorded data, not a separate mock screen.
let html=require('../data-research-ai/build-preview.cjs');
html=html.replace('window.designPreviewReady=true;','closeAnalysisDrawer();StockBookScreen.open();window.designPreviewReady=true;');
fs.writeFileSync(path.join(__dirname,'preview.html'),html);
console.log('Built offline condition search preview',Buffer.byteLength(html),'bytes');
