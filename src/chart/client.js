(function(root){
 'use strict';
 let cached=null;const dataCache=new Map();
 async function readDataset(code,cycle){
  if(root.electronAPI?.getChartData)return root.electronAPI.getChartData(code,cycle);
  if(root.stockBookChart?.getData)return root.stockBookChart.getData(code,cycle);
  if(code!=='005930')return {ok:false,error:'이 종목의 일봉 공급자가 아직 연결되지 않았습니다.'};
  if(root.electronAPI?.getChartSnapshot)return root.electronAPI.getChartSnapshot(code);
  if(root.stockBookChart?.getSnapshot)return root.stockBookChart.getSnapshot(code);
  if(!cached)cached=Promise.all(['metadata.json','long-candles.json','investor-snapshot.json'].map(name=>fetch(new URL('src/chart/proof-data/'+name,document.baseURI)).then(r=>{if(!r.ok)throw Error('자료 없음');return r.json();}))).then(([metadata,candles,investors])=>({ok:true,metadata,candles,investors})).catch(()=>{cached=null;return {ok:false,error:'보존 차트 자료를 읽지 못했습니다.'};});
  return cached;
 }
 function dataset(code,cycle){
  const key=code+':'+(cycle==='year'?3000:1000),source=root.electronAPI?.getChartData||root.stockBookChart?.getData||null,now=Date.now(),old=dataCache.get(key);
  if(old&&old.source===source&&now-old.at<60000)return old.task;
  const entry={source,at:now,task:null};let timer;
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,error:'차트 응답이 지연되고 있습니다. 다시 시도해 주세요.'}),14000);});
  entry.task=Promise.race([Promise.resolve().then(()=>readDataset(code,cycle)),timeout]).catch(()=>({ok:false,error:'차트 자료를 불러오지 못했습니다.'})).then(data=>{if(!data?.ok&&dataCache.get(key)===entry)dataCache.delete(key);return data;}).finally(()=>clearTimeout(timer));
  dataCache.set(key,entry);while(dataCache.size>20)dataCache.delete(dataCache.keys().next().value);return entry.task;
 }
 const states=new WeakMap();
 function show(host,context,mode){
  if(!host)return Promise.resolve(null);
  const old=states.get(host),key=JSON.stringify([context.code,context.viewRange||context.period,context.barCycle||'day',context.indicatorCycle||context.barCycle||'day',mode]);
  if(old?.key===key&&!old.failed)return old.task;
  old?.interaction?.destroy();const state={key,controller:null,interaction:null,task:null};states.set(host,state);
  delete host.chartEvidence;host.className='sb-chart-loading';host.textContent='차트 자료를 불러오는 중…';
  function failed(message){
   state.failed=true;host.className='sb-data-empty';host.replaceChildren();
   const text=document.createElement('span');text.textContent=message;const retry=document.createElement('button');retry.type='button';retry.className='sb-btn sb-btn--sm';retry.textContent='차트 다시 시도';retry.addEventListener('click',()=>{if(host.dispatchEvent(new CustomEvent('stockbook:chart-retry',{cancelable:true})))show(host,context,mode);});host.append(text,retry);
  }
  state.task=(async()=>{
   let data;try{data=await dataset(context.code,context.barCycle||'day');}catch{data={ok:false,error:'차트 자료를 불러오지 못했습니다.'};}
   if(states.get(host)!==state)return null;
   if(!data?.ok || data.metadata?.stockCode!==context.code){failed(data?.error||'선택 종목의 차트 자료가 없습니다.');return null;}
   try{
    state.controller=root.StockBookChartRenderer.mount(host,data,{mode,period:context.period,viewRange:context.viewRange||context.period,barCycle:context.barCycle||'day',indicatorCycle:context.indicatorCycle||context.barCycle||'day',light:document.body.classList.contains('light-mode')});
    if(root.StockBookChartInteraction)state.interaction=root.StockBookChartInteraction.mount(host,state.controller,{tools:true,compact:mode==='compact'});
    return state.controller;
   }catch{state.interaction?.destroy();failed('차트 자료를 표시하지 못했습니다.');return null;}
  })();return state.task;
 }

 let light=document.body.classList.contains('light-mode');new MutationObserver(()=>{const next=document.body.classList.contains('light-mode');if(next===light)return;light=next;for(const host of document.querySelectorAll('[data-chart-host]'))states.get(host)?.controller?.updateTheme(light);}).observe(document.body,{attributes:true,attributeFilter:['class']});
 root.StockBookCharts=Object.freeze({show,controller:host=>states.get(host)?.controller,clear:host=>{if(!host)return;states.get(host)?.interaction?.destroy();states.delete(host);delete host.chartEvidence;host.className='sb-data-empty';host.textContent='종목을 선택하면 차트를 표시합니다.';}});
})(window);
