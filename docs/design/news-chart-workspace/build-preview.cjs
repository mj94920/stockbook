'use strict';
// Read-only preview: received list snapshots, no article-body simulation or live IPC.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const {newsItems}=require(path.join(root,'src/news/list.cjs'));
const lists=Object.fromEntries(['market','stock'].map(kind=>[kind,newsItems(require(path.join(root,'test/fixtures/news/'+kind+'-20261023.json')),kind==='stock'?'005930':'')]));
const snapshot=require(path.join(root,'src/chart/snapshot.cjs')).readSnapshot('005930',root);
const payload=JSON.stringify({lists,snapshot}).replaceAll('<','\\u003c').replaceAll('>','\\u003e');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
// Block the app's background quote fallbacks in this snapshot-only preview.
// Production fetch and Electron networking are not changed.
html=html.replace('<head>','<head><script>window.fetch=async()=>{throw Error("스냅샷 미리보기는 외부 자료를 요청하지 않습니다.");};</script>');
html=html.replace(/<link\b[^>]*href="https:\/\/[^>]*>\s*/g,'');
const icon='data:image/png;base64,'+fs.readFileSync(path.join(root,'icon-192.png')).toString('base64');
html=html.replaceAll('./icon-192.png',icon);
html=html.replace('<link rel="stylesheet" href="src/chart/chart.css">','<style>'+fs.readFileSync(path.join(root,'src/chart/chart.css'),'utf8')+'</style>');
html=html.replace(/<script src="(src\/chart\/(?:renderer|client)\.js)"><\/script>/g,(_,file)=>'<script>\n'+fs.readFileSync(path.join(root,file),'utf8').replace(/<\/script/gi,'<\\/script')+'\n</script>');
const boot=`document.addEventListener('DOMContentLoaded',async()=>{
 const data=${payload};
 window.electronAPI={
  fetchNews:async opts=>({ok:true,items:structuredClone(data.lists[opts?.kind==='stock'?'stock':'market']).filter(n=>opts?.kind!=='stock'||opts.code==='005930')}),
  fetchNewsArticle:async()=>({ok:false}),
  getChartSnapshot:async code=>code==='005930'?data.snapshot:{ok:false,error:'이 종목의 일봉 공급자가 아직 연결되지 않았습니다.'},
  fetchQuote:async()=>null,fetchMarketTickers:async()=>null,fetchNaverStocks:async()=>({ok:false}),
  loadState:async()=>null,saveState:async()=>{},checkApiKey:async()=>false,loadApiKey:async()=>null,
  setChartContext:async()=>({ok:true}),openChartWindow:async()=>({ok:false}),onRealtimePrice:()=>{},onWsStatus:()=>{}
 };
 const note=document.createElement('p');note.textContent='뉴스 미리보기 · 2026-10-23 수신 목록 스냅샷 · 본문 미연결 · 실시간 아님';
 note.style.cssText='position:fixed;bottom:4px;right:8px;z-index:100000;max-width:90vw;font-size:12px;padding:6px;background:var(--sb-panel);color:var(--sb-text-2);border:1px solid var(--sb-border)';document.body.append(note);
 window._MDI.show('news');_ic.tab='market';await icRefresh();await icSelect(0);window.newsPreviewReady=true;
});`;
html=html.replace('</body>','<script>'+boot.replace(/<\/script/gi,'<\\/script')+'</script></body>');
if(!html.includes('newsPreviewReady')||/<script src=|href="src\//.test(html))throw Error('Preview resources were not embedded');
html=html.replace(/^[ \t]+(?=\r?$)/gm,'');
fs.writeFileSync(path.join(__dirname,'preview.html'),html);console.log('Built self-contained news preview:',Buffer.byteLength(html),'bytes');
