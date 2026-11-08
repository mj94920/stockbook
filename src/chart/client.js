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
 const moneyCache=new Map();
 function tradingValues(code,force=false){
  const api=root.electronAPI?.getChartTradingValues||root.stockBookChart?.getTradingValues;
  if(!api)return Promise.resolve({ok:false,error:'KIS 연결 후 실제 거래대금을 조회할 수 있습니다.'});
  const old=moneyCache.get(code);if(old&&Date.now()-old.at<60000&&(!force||old.pending))return old.task;
  const entry={at:Date.now(),pending:true,task:null};let timer;
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,error:'거래대금 응답이 지연되고 있습니다. 다시 조회해 주세요.'}),9000);});
  entry.task=Promise.race([Promise.resolve().then(()=>api(code)),deadline]).catch(()=>({ok:false,error:'거래대금을 불러오지 못했습니다.'})).then(data=>{entry.pending=false;if(!data?.ok&&moneyCache.get(code)===entry)moneyCache.delete(code);return data;}).finally(()=>clearTimeout(timer));
  moneyCache.set(code,entry);while(moneyCache.size>20)moneyCache.delete(moneyCache.keys().next().value);return entry.task;
 }
 const historyCache=new Map(),historyJobs=new Map();
 function historyKey(code,candles){return code+':'+candles[0].date+':'+candles.at(-1).date;}
 function mergedMoney(code,candles,older,newer){
  const values=new Map(),dates=new Map(candles.map(c=>[c.date,c.volume]));
  for(const data of [older,newer])if(data?.ok)for(const row of root.StockBookChartHistory.validRows(data,code,1000))if(dates.has(row.date))values.set(row.date,row);
  const rows=[...values.values()].sort((a,b)=>a.date.localeCompare(b.date)),history=newer?.history||older?.history||null,matched=rows.filter(r=>r.volume===dates.get(r.date)).length;
  return {ok:true,stockCode:code,source:'KIS',market:'KRX',currency:'KRW',unit:'원',fetchedAt:newer?.fetchedAt||older?.fetchedAt||null,rows,...(history?{history:{...history,received:rows.length,matched,missing:candles.length-matched,partial:matched<candles.length}}:{})};
 }
 function historyMessage(data){
  const h=data.history,labels={loading:'추가 조회 중',paused:'받은 과거 자료 · 추가 조회로 이어받기',complete:'조회 완료','range-end':'범위 조회 종료',exhausted:'제공 자료 끝',limit:'이번 조회 한도 도달',timeout:'응답 지연으로 중단',cancelled:'추가 조회 취소','request-failed':'추가 조회 실패'};
  return (labels[h.status]||'조회 종료')+' · 추가 요청 '+h.pages+'/'+h.maxPages+' · 거래량 일치 '+h.matched+'/'+h.target+'봉 · 판정 보류 '+h.missing+'봉'+(h.partial?' · 받은 자료는 유지합니다.':'');
 }
 function saveHistory(key,data){if(data?.rows.length){historyCache.set(key,{at:Date.now(),data});while(historyCache.size>20)historyCache.delete(historyCache.keys().next().value);}}
 function historyJob(key,code,candles,initial){
  let job=historyJobs.get(key);if(job&&!job.controller.signal.aborted)return job;
  if(historyJobs.size>=20)throw Error('진행 중인 추가 조회가 많습니다. 잠시 후 다시 시도해 주세요.');
  job={controller:new AbortController(),listeners:new Set(),latest:null};historyJobs.set(key,job);
  const api=root.electronAPI?.getChartTradingValues||root.stockBookChart?.getTradingValues;
  job.task=Promise.resolve().then(()=>root.StockBookChartHistory.load({code,candles,initial,fetchPage:(code,range)=>api(code,range),signal:job.controller.signal,onUpdate:value=>{job.latest=value;saveHistory(key,value);for(const listener of job.listeners)listener.update(value);}})).catch(()=>{for(const listener of job.listeners)listener.failed();}).finally(()=>{
   saveHistory(key,job.latest);
   if(historyJobs.get(key)===job)historyJobs.delete(key);for(const listener of job.listeners)listener.finish();job.listeners.clear();
  });return job;
 }
 root.addEventListener('pagehide',()=>{for(const job of historyJobs.values())job.controller.abort();});
 const investorCache=new Map();
 function investors(code,force=false){
  const api=root.electronAPI?.getChartInvestors||root.stockBookChart?.getInvestors;
  if(!api)return Promise.resolve({ok:false,error:'수급 기능이 연결되지 않았습니다. 앱을 완전히 종료한 뒤 업데이트하고 다시 실행해 주세요.',errorCode:'INVESTOR_BRIDGE_MISSING'});
  const old=investorCache.get(code);if(old&&Date.now()-old.at<60000&&(!force||old.pending))return old.task;
  const entry={at:Date.now(),pending:true,task:null};let timer;
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,error:'수급 응답이 지연되고 있습니다. 다시 조회해 주세요.'}),14000);});
  entry.task=Promise.race([Promise.resolve().then(()=>api(code)),deadline]).then(data=>{if(data?.ok){if(data.stockCode!==code||!((data.source==='KIS'&&data.market==='KRX')||(data.source==='Naver'&&data.market==='provider'))||data.unit!=='주')throw Error('수급 종목/출처 오류');root.StockBookChartSeries.investorSeries(data.rows);}return data;}).catch(error=>({ok:false,error:String(error?.message||'').includes('No handler registered')?'수급 기능을 연결하지 못했습니다. 앱을 완전히 종료하고 다시 실행해 주세요.':'수급 자료를 불러오지 못했습니다.'})).then(data=>{entry.pending=false;if(!data?.ok&&investorCache.get(code)===entry)investorCache.delete(code);return data;}).finally(()=>clearTimeout(timer));
  investorCache.set(code,entry);while(investorCache.size>20)investorCache.delete(investorCache.keys().next().value);return entry.task;
 }
 const states=new WeakMap();
 function show(host,context,mode){
  if(!host)return Promise.resolve(null);
  const old=states.get(host),key=JSON.stringify([context.code,context.viewRange||context.period,context.barCycle||'day',context.indicatorCycle||context.barCycle||'day',mode]);
  if(old?.key===key&&!old.failed)return old.task;
  old?.historyDetach?.(false);old?.interaction?.destroy();old?.resize?.destroy();const state={key,controller:null,interaction:null,resize:null,task:null};states.set(host,state);
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
    if(root.StockBookChartResize)state.resize=root.StockBookChartResize.mount(host,state.controller,mode);
    const retry=host.querySelector('[data-chart-id="moneyRetry"]'),historyLoad=host.querySelector('[data-chart-id="moneyHistoryLoad"]'),historyCancel=host.querySelector('[data-chart-id="moneyHistoryCancel"]'),panels=root.StockBookChartSeries.cycleConfig(context.barCycle||'day').panels,hKey=historyKey(context.code,data.candles);
    const historyAvailable=panels.money&&data.metadata.sourceType==='naver-daily'&&!!root.StockBookChartHistory&&!!(root.electronAPI?.getChartTradingValues||root.stockBookChart?.getTradingValues);
    let moneyPending=false;state.moneyData=null;
    function moneyButtons(){if(retry)retry.disabled=moneyPending||!!state.historyDetach;if(historyLoad){historyLoad.disabled=!historyAvailable||moneyPending||!!state.historyDetach;historyLoad.hidden=!!state.historyDetach;}if(historyCancel)historyCancel.hidden=!state.historyDetach;}
    function applyMoney(values){state.controller.setTradingValues(values);if(values.ok)state.moneyData=values;}
    async function loadMoney(force=false){
     if(state.historyDetach)return;moneyPending=true;moneyButtons();
     const status=host.querySelector('[data-chart-id="moneyStatus"]');if(status)status.textContent='KIS 거래대금을 불러오는 중… 가격 차트는 계속 사용할 수 있습니다.';
     const values=data.metadata.sourceType==='naver-daily'?await tradingValues(context.code,force):{ok:false,error:'보존 자료에는 실제 거래대금이 없습니다.'};
     if(states.get(host)!==state)return;
     try{
      if(values?.ok){const cached=historyCache.get(hKey),older=cached&&Date.now()-cached.at<60000?cached.data:state.moneyData;const next=root.StockBookChartHistory?mergedMoney(context.code,data.candles,older,values):values;if(next.history?.status==='loading')next.history={...next.history,status:'paused'};applyMoney(next);if(state.moneyData.history)state.controller.setTradingHistoryStatus(historyMessage(state.moneyData));}
      else if(!state.moneyData?.ok)applyMoney(values);else state.controller.setTradingHistoryStatus('최근 거래대금 갱신 실패 · 이미 받은 자료는 유지합니다.');
     }catch{if(!state.moneyData?.ok)state.controller.setTradingValues({ok:false,error:'선택 종목의 거래대금을 확인할 수 없습니다.'});else state.controller.setTradingHistoryStatus('거래대금 응답 확인 실패 · 이미 받은 자료는 유지합니다.');}
     moneyPending=false;moneyButtons();
    }
    function loadHistory(){
     if(!historyAvailable||moneyPending||state.historyDetach)return;let job;
     try{job=historyJob(hKey,context.code,data.candles,state.moneyData);}catch{state.controller.setTradingHistoryStatus('추가 조회를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');return;}
     let active=true;const current=()=>active&&states.get(host)===state;
     const listener={update:values=>{if(!current())return;try{applyMoney(values);state.controller.setTradingHistoryStatus(historyMessage(values));}catch{state.controller.setTradingHistoryStatus('추가 거래대금 응답을 확인하지 못했습니다.');}},failed:()=>{if(current())state.controller.setTradingHistoryStatus('추가 조회 실패 · 이미 받은 자료는 유지합니다.');},finish:()=>{if(!current())return;active=false;state.historyDetach=null;moneyButtons();}};
     state.historyDetach=(notify=true)=>{if(!active)return;active=false;job.listeners.delete(listener);state.historyDetach=null;if(notify&&states.get(host)===state){if(state.moneyData?.history){state.moneyData={...state.moneyData,history:{...state.moneyData.history,status:'cancelled'}};state.controller.setTradingHistoryStatus(historyMessage(state.moneyData));}else state.controller.setTradingHistoryStatus('추가 조회 취소 · 이미 받은 자료는 유지합니다.');moneyButtons();}if(!job.listeners.size)job.controller.abort();};
     job.listeners.add(listener);moneyButtons();if(job.latest)listener.update(job.latest);
    }
    retry?.addEventListener('click',()=>{if(!retry.disabled)loadMoney(true);});historyLoad?.addEventListener('click',loadHistory);historyCancel?.addEventListener('click',()=>state.historyDetach?.());moneyButtons();
    const investorRetry=host.querySelector('[data-chart-id="investorRetry"]');
    async function loadInvestors(force=false){
     state.controller.setInvestorLoading?.();
     if(investorRetry)investorRetry.disabled=true;const status=host.querySelector('[data-chart-id="investorStatus"]');if(status)status.textContent='투자자별 순매수를 불러오는 중…';
     const values=await investors(context.code,force);if(states.get(host)!==state)return;
     try{state.controller.setInvestors(values);}catch{state.controller.setInvestors({ok:false,error:'선택 종목의 수급 자료를 확인할 수 없습니다.'});}
     if(investorRetry)investorRetry.disabled=false;
    }
    investorRetry?.addEventListener('click',()=>{if(!investorRetry.disabled)loadInvestors(true);});
    if(panels.money)loadMoney();if(panels.investors&&data.metadata.sourceType==='naver-daily')loadInvestors();
    return state.controller;
   }catch{state.interaction?.destroy();state.resize?.destroy();failed('차트 자료를 표시하지 못했습니다.');return null;}
  })();return state.task;
 }

 let light=document.body.classList.contains('light-mode');new MutationObserver(()=>{const next=document.body.classList.contains('light-mode');if(next===light)return;light=next;for(const host of document.querySelectorAll('[data-chart-host]'))states.get(host)?.controller?.updateTheme(light);}).observe(document.body,{attributes:true,attributeFilter:['class']});
 root.StockBookCharts=Object.freeze({show,controller:host=>states.get(host)?.controller,clear:host=>{if(!host)return;states.get(host)?.historyDetach?.(false);states.get(host)?.interaction?.destroy();states.get(host)?.resize?.destroy();states.delete(host);delete host.chartEvidence;host.className='sb-data-empty';host.textContent='종목을 선택하면 차트를 표시합니다.';}});
})(window);
