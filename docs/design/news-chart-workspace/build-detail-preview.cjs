'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'../../..');
const data=require(path.join(root,'src/chart/snapshot.cjs')).readSnapshot('005930',root);if(!data.ok)throw Error(data.error);
let html=fs.readFileSync(path.join(root,'chart.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="src/chart/chart.css">','<style>'+fs.readFileSync(path.join(root,'src/chart/chart.css'),'utf8')+'</style>');
const boot=`const detailSnapshot=${JSON.stringify(data).replaceAll('<','\\u003c')};let current={code:'005930',name:'삼성전자 · 보존 자료',period:'6m',viewRange:'6m',barCycle:'day',follow:false},apply;window.stockBookChart={onContext:fn=>apply=fn,getData:async code=>code==='005930'?structuredClone(detailSnapshot):{ok:false,error:'보존 자료 없음'},setView:async view=>{current={...current,...view,period:view.viewRange,indicatorCycle:view.barCycle,follow:false};apply(current);return {ok:true};},setFollow:async follow=>{current={...current,follow};apply(current);return {ok:true};}};document.addEventListener('DOMContentLoaded',()=>apply(current));`;
html=html.replace('<script src="src/chart/series.js"></script>','<script>'+boot+'</script><script src="src/chart/series.js"></script>');
html=html.replace(/<script src="(src\/chart\/[a-z-]+\.js)"><\/script>/g,(_,file)=>'<script>'+fs.readFileSync(path.join(root,file),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
if(/<script src=|href="src\//.test(html))throw Error('Missing embedded resource');fs.writeFileSync(path.join(__dirname,'detail-preview.html'),html.replace(/^[ \t]+(?=\r?$)/gm,''));console.log('Built standalone detail preview from production chart HTML; recorded data only.');
