(function(root){
 'use strict';
 let cached=null;
 async function dataset(code){
  if(code!=='005930')return {ok:false,error:'이 종목의 일봉 공급자가 아직 연결되지 않았습니다.'};
  if(root.electronAPI?.getChartSnapshot)return root.electronAPI.getChartSnapshot(code);
  if(root.stockBookChart?.getSnapshot)return root.stockBookChart.getSnapshot(code);
  if(!cached)cached=Promise.all(['metadata.json','long-candles.json','investor-snapshot.json'].map(name=>fetch(new URL('src/chart/proof-data/'+name,document.baseURI)).then(r=>{if(!r.ok)throw Error('자료 없음');return r.json();}))).then(([metadata,candles,investors])=>({ok:true,metadata,candles,investors})).catch(()=>{cached=null;return {ok:false,error:'보존 차트 자료를 읽지 못했습니다.'};});
  return cached;
 }
 const states=new WeakMap();
 async function show(host,context,mode){
  if(!host)return;
  const old=states.get(host),key=JSON.stringify([context.code,context.period,mode]);
  if(old?.key===key)return;
  const state={key,controller:null};states.set(host,state);
  host.className='sb-chart-loading';host.textContent='차트 자료를 불러오는 중…';
  let data;try{data=await dataset(context.code);}catch{data={ok:false,error:'차트 자료를 불러오지 못했습니다.'};}
  if(states.get(host)!==state)return;
  if(!data.ok || data.metadata.stockCode!==context.code){host.className='sb-data-empty';host.textContent=data.error||'선택 종목의 차트 자료가 없습니다.';return;}
  try{state.controller=root.StockBookChartRenderer.mount(host,data,{mode,period:context.period,light:document.body.classList.contains('light-mode')});}
  catch{host.className='sb-data-empty';host.textContent='차트 자료를 표시하지 못했습니다.';}
 }
 new MutationObserver(()=>{for(const host of document.querySelectorAll('[data-chart-host]'))states.get(host)?.controller?.updateTheme(document.body.classList.contains('light-mode'));}).observe(document.body,{attributes:true,attributeFilter:['class']});
 root.StockBookCharts=Object.freeze({show,clear:host=>{if(!host)return;states.delete(host);host.className='sb-data-empty';host.textContent='종목을 선택하면 차트를 표시합니다.';}});
})(window);
