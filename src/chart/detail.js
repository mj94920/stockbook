(() => {
 const api=window.stockBookChart,host=document.getElementById('chartViewport'),cycle=document.getElementById('chartCycle'),range=document.getElementById('chartPeriod'),follow=document.getElementById('chartFollow'),status=document.getElementById('chartStatus'),dialog=document.getElementById('chartSettings');
 if([host,cycle,range,follow,status,dialog,...['chartName','chartMAPeriods','chartCloudFields','chartCloudPeriods','chartBBFields','chartBBPeriod','chartBBMultiplier','chartBBShift','chartOBVFields','chartOBVPeriod','chartOBVMethod','chartSignalFields','chartNewLowFields','chartNewLowPeriod','chartRSIPeriod','chartRSILevel','chartRSIMethod','chartEntryFields','chartSettingsError','chartIndicatorSettings','chartSettingsClose','chartSettingsReset','chartSettingsForm'].map(id=>document.getElementById(id))].some(element=>!element))return;
 let current=null,sequence=0,settings={};try{settings=JSON.parse(localStorage.getItem('stockbook:chart:settings:v1'))||{};}catch{}
 if(typeof settings!=='object'||settings===null||Array.isArray(settings))settings={};
 async function context(value){
  current={...value,barCycle:value.barCycle||'day',viewRange:value.viewRange||value.period};const request=++sequence;
  document.getElementById('chartName').textContent=value.name+' · '+value.code;document.title=value.name+' — 상세 차트';cycle.value=current.barCycle;range.value=current.viewRange;follow.value=value.follow?'follow':'pin';
  status.textContent=value.follow?'종합 화면의 선택 종목·봉 주기·조회 범위를 따라갑니다.':'이 창의 종목·봉 주기·조회 범위를 고정했습니다.';
  const controller=await window.StockBookCharts?.show(host,current,'detail');if(request!==sequence)return;
  if(controller&&settings[current.barCycle])try{controller.setSettings(settings[current.barCycle]);}catch{delete settings[current.barCycle];}
  window.dispatchEvent(new CustomEvent('stockbook:chart-context',{detail:{...current}}));
 }
 api?.onContext(context);host.addEventListener('stockbook:chart-retry',event=>{event.preventDefault();if(current)context(current);});
 host.addEventListener('stockbook:chart-settings-reset',()=>{if(!current)return;delete settings[current.barCycle];try{localStorage.setItem('stockbook:chart:settings:v1',JSON.stringify(settings));}catch{}});
 async function changeView(){
  if(!current)return;const view={barCycle:cycle.value,viewRange:range.value};
  const result=await api?.setView?.(view);
  if(api?.setView&&!result?.ok){status.textContent='차트 보기 조건을 변경하지 못했습니다.';return;}
  await context({...current,...view,indicatorCycle:view.barCycle,period:view.viewRange,follow:false});
 }
 cycle.addEventListener('change',()=>{if(cycle.value==='year')range.value='all';changeView();});range.addEventListener('change',changeView);
 follow.addEventListener('change',async()=>{const result=await api?.setFollow(follow.value==='follow');if(!result?.ok)status.textContent='종목 연결 상태를 변경하지 못했습니다.';});
 const searchForm=document.getElementById('chartStockSearchForm'),searchInput=document.getElementById('chartStockSearch'),searchPanel=document.getElementById('chartStockSearchPanel'),searchResults=document.getElementById('chartStockResults'),searchStatus=document.getElementById('chartStockSearchStatus');
 if(searchForm&&searchInput&&searchPanel&&searchResults&&searchStatus){
  let searchRequest=0,selectionRequest=0,timer=0,items=[],active=-1,resultQuery='',composing=false;
  function expanded(value){searchPanel.hidden=!value;searchInput.setAttribute('aria-expanded',String(value));if(!value)searchInput.removeAttribute('aria-activedescendant');}
  function highlight(index){active=index;const options=[...searchResults.children];for(let i=0;i<options.length;i++)options[i].setAttribute('aria-selected',String(i===active));if(options[active]){expanded(true);searchInput.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'});}}
  async function bounded(task){let timeout;return Promise.race([task,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('검색 응답 지연')),9000);})]).finally(()=>clearTimeout(timeout));}
  async function choose(stock){
   const request=++selectionRequest;searchRequest++;clearTimeout(timer);expanded(true);searchStatus.textContent=stock.name+' 차트로 전환하는 중…';
   try{const result=await bounded(Promise.resolve().then(()=>api?.selectStock?.(stock.code)));if(request!==selectionRequest)return;
    if(!result?.ok||result.context?.code!==stock.code)throw Error('선택 실패');
    items=[];searchResults.replaceChildren();searchInput.value='';expanded(false);await context(result.context);
   }catch{if(request===selectionRequest){expanded(true);searchStatus.textContent='종목을 변경하지 못했습니다. 다시 선택해 주세요.';}}
  }
  async function search(submitted=false){
   clearTimeout(timer);const query=searchInput.value.trim(),request=++searchRequest;active=-1;items=[];searchResults.replaceChildren();searchInput.removeAttribute('aria-activedescendant');
   if(!query){expanded(false);return;}expanded(true);searchStatus.textContent='종목을 검색하는 중…';
   try{const result=await bounded(Promise.resolve().then(()=>api?.searchStocks?.(query)));if(request!==searchRequest||searchInput.value.trim()!==query)return;
    if(!result?.ok||!Array.isArray(result.items))throw Error(result?.error||'종목 검색이 연결되지 않았습니다.');
    resultQuery=query;items=result.items.filter(stock=>typeof stock?.code==='string'&&/^\d{6}$/.test(stock.code)&&typeof stock.name==='string'&&stock.name.length<=120).slice(0,20);
    for(let i=0;i<items.length;i++){const stock=items[i],button=document.createElement('button');button.type='button';button.className='sb-btn sb-chart-search-result';button.id='chart-stock-result-'+i;button.tabIndex=-1;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.textContent=stock.name+' · '+stock.code+(stock.market?' · '+String(stock.market).slice(0,20):'');button.addEventListener('click',()=>choose(stock));searchResults.append(button);}
    searchStatus.textContent=items.length?items.length+'개 결과 · 선택하면 이 창의 종목으로 고정합니다.':'검색 결과가 없습니다. 6자리 코드로도 검색할 수 있습니다.';
    if(submitted){const exact=items.find(stock=>stock.code===query||stock.name.replace(/\s+/g,'').toLocaleLowerCase('ko-KR')===query.replace(/\s+/g,'').toLocaleLowerCase('ko-KR'));if(exact||items.length===1)await choose(exact||items[0]);}
   }catch(error){if(request===searchRequest){searchStatus.textContent=error.message==='검색 응답 지연'?'검색 응답이 지연되고 있습니다. 다시 검색해 주세요.':error.message;}}
  }
  function schedule(){clearTimeout(timer);searchRequest++;items=[];searchResults.replaceChildren();expanded(false);if(!composing&&searchInput.value.trim())timer=setTimeout(()=>search(),250);}
  searchInput.addEventListener('input',schedule);searchInput.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);searchRequest++;});searchInput.addEventListener('compositionend',()=>{composing=false;schedule();});
  searchInput.addEventListener('focus',()=>{if(items.length&&resultQuery===searchInput.value.trim())expanded(true);});
  searchForm.addEventListener('submit',event=>{event.preventDefault();if(!composing)search(true);});
  searchForm.addEventListener('keydown',event=>{if(event.isComposing||composing)return;if(event.key==='Escape'&&!searchPanel.hidden){event.preventDefault();event.stopPropagation();searchRequest++;clearTimeout(timer);expanded(false);searchInput.focus();}else if(event.target===searchInput&&items.length&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();highlight(active<0?(event.key==='ArrowDown'?0:items.length-1):(active+(event.key==='ArrowDown'?1:-1)+items.length)%items.length);}else if(event.target===searchInput&&event.key==='Enter'&&active>=0&&items[active]){event.preventDefault();choose(items[active]);}});
  document.addEventListener('pointerdown',event=>{if(!searchForm.contains(event.target))expanded(false);});
 }
 const field=id=>document.getElementById(id),optionalNumber=id=>field(id).value.trim()===''?null:Number(field(id).value),numbers=value=>value.split(/[,\s]+/).filter(Boolean).map(Number);
 function fill(values){field('chartMAPeriods').value=values.periods.join(',');field('chartCloudFields').hidden=!values.cloud;field('chartCloudPeriods').value=values.cloud?.join(',')||'';field('chartBBFields').hidden=current.barCycle!=='day';field('chartBBPeriod').value=values.bb.period;field('chartBBMultiplier').value=values.bb.multiplier;field('chartBBShift').value=values.bb.shift;field('chartOBVFields').hidden=current.barCycle!=='week';field('chartOBVPeriod').value=values.obv.period;field('chartOBVMethod').value=values.obv.method;field('chartSignalFields').hidden=!['day','week'].includes(current.barCycle);field('chartNewLowFields').hidden=current.barCycle!=='day';field('chartNewLowPeriod').value=values.signals.newLowPeriod??'';field('chartRSIPeriod').value=values.signals.rsiPeriod??'';field('chartRSILevel').value=values.signals.rsiLevel??'';field('chartRSIMethod').value=values.signals.rsiMethod??'';field('chartEntryFields').hidden=current.barCycle!=='day';field('chartSettingsError').textContent='';}
 field('chartIndicatorSettings').addEventListener('click',()=>{if(!current)return;fill(window.StockBookChartSeries.indicatorSettings(current.barCycle,settings[current.barCycle]));dialog.showModal();});
 field('chartSettingsClose').addEventListener('click',()=>dialog.close());field('chartSettingsReset').addEventListener('click',()=>fill(window.StockBookChartSeries.indicatorSettings(current.barCycle)));
 field('chartSettingsForm').addEventListener('submit',event=>{
  event.preventDefault();if(!current)return;
  try{
   const value=window.StockBookChartSeries.indicatorSettings(current.barCycle,{periods:numbers(field('chartMAPeriods').value),cloud:current.barCycle==='day'||current.barCycle==='week'?numbers(field('chartCloudPeriods').value):null,bb:{period:Number(field('chartBBPeriod').value),multiplier:Number(field('chartBBMultiplier').value),shift:Number(field('chartBBShift').value)},obv:{period:Number(field('chartOBVPeriod').value),method:field('chartOBVMethod').value},signals:{newLowPeriod:optionalNumber('chartNewLowPeriod'),rsiPeriod:optionalNumber('chartRSIPeriod'),rsiLevel:optionalNumber('chartRSILevel'),rsiMethod:field('chartRSIMethod').value||null}});
   window.StockBookCharts.controller(host)?.setSettings(value);settings[current.barCycle]=value;
   try{localStorage.setItem('stockbook:chart:settings:v1',JSON.stringify(settings));}catch{}dialog.close();
  }catch(error){field('chartSettingsError').textContent=error.message;}
 });
})();
