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
  old?.interaction?.destroy();old?.resize?.destroy();const state={key,controller:null,interaction:null,resize:null,task:null};states.set(host,state);
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
    const retry=host.querySelector('[data-chart-id="moneyRetry"]');
    async function loadMoney(force=false){
     if(retry)retry.disabled=true;
     const status=host.querySelector('[data-chart-id="moneyStatus"]');if(status)status.textContent='KIS 거래대금을 불러오는 중… 가격 차트는 계속 사용할 수 있습니다.';
     const values=data.metadata.sourceType==='naver-daily'?await tradingValues(context.code,force):{ok:false,error:'보존 자료에는 실제 거래대금이 없습니다.'};
     if(states.get(host)!==state)return;
     try{state.controller.setTradingValues(values);}catch{state.controller.setTradingValues({ok:false,error:'선택 종목의 거래대금을 확인할 수 없습니다.'});}
     if(retry)retry.disabled=false;
    }
    retry?.addEventListener('click',()=>{if(!retry.disabled)loadMoney(true);});
    const investorRetry=host.querySelector('[data-chart-id="investorRetry"]');
    async function loadInvestors(force=false){
     state.controller.setInvestorLoading?.();
     if(investorRetry)investorRetry.disabled=true;const status=host.querySelector('[data-chart-id="investorStatus"]');if(status)status.textContent='투자자별 순매수를 불러오는 중…';
     const values=await investors(context.code,force);if(states.get(host)!==state)return;
     try{state.controller.setInvestors(values);}catch{state.controller.setInvestors({ok:false,error:'선택 종목의 수급 자료를 확인할 수 없습니다.'});}
     if(investorRetry)investorRetry.disabled=false;
    }
    investorRetry?.addEventListener('click',()=>{if(!investorRetry.disabled)loadInvestors(true);});
    const panels=root.StockBookChartSeries.cycleConfig(context.barCycle||'day').panels;if(panels.money)loadMoney();if(panels.investors&&data.metadata.sourceType==='naver-daily')loadInvestors();
    return state.controller;
   }catch{state.interaction?.destroy();state.resize?.destroy();failed('차트 자료를 표시하지 못했습니다.');return null;}
  })();return state.task;
 }

 let light=document.body.classList.contains('light-mode');new MutationObserver(()=>{const next=document.body.classList.contains('light-mode');if(next===light)return;light=next;for(const host of document.querySelectorAll('[data-chart-host]'))states.get(host)?.controller?.updateTheme(light);}).observe(document.body,{attributes:true,attributeFilter:['class']});
 root.StockBookCharts=Object.freeze({show,controller:host=>states.get(host)?.controller,clear:host=>{if(!host)return;states.get(host)?.interaction?.destroy();states.get(host)?.resize?.destroy();states.delete(host);delete host.chartEvidence;host.className='sb-data-empty';host.textContent='종목을 선택하면 차트를 표시합니다.';}});
})(window);
