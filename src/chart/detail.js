(() => {
 const api=window.stockBookChart,host=document.getElementById('chartViewport'),cycle=document.getElementById('chartCycle'),range=document.getElementById('chartPeriod'),follow=document.getElementById('chartFollow'),status=document.getElementById('chartStatus'),dialog=document.getElementById('chartSettings');
 if([host,cycle,range,follow,status,dialog,...['chartName','chartMAPeriods','chartCloudFields','chartCloudPeriods','chartBBFields','chartBBPeriod','chartBBMultiplier','chartBBShift','chartSettingsError','chartIndicatorSettings','chartSettingsClose','chartSettingsReset','chartSettingsForm'].map(id=>document.getElementById(id))].some(element=>!element))return;
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
 async function changeView(){
  if(!current)return;const view={barCycle:cycle.value,viewRange:range.value};
  const result=await api?.setView?.(view);
  if(api?.setView&&!result?.ok){status.textContent='차트 보기 조건을 변경하지 못했습니다.';return;}
  await context({...current,...view,indicatorCycle:view.barCycle,period:view.viewRange,follow:false});
 }
 cycle.addEventListener('change',()=>{if(cycle.value==='year')range.value='all';changeView();});range.addEventListener('change',changeView);
 follow.addEventListener('change',async()=>{const result=await api?.setFollow(follow.value==='follow');if(!result?.ok)status.textContent='종목 연결 상태를 변경하지 못했습니다.';});
 const field=id=>document.getElementById(id),numbers=value=>value.split(/[,\s]+/).filter(Boolean).map(Number);
 function fill(values){field('chartMAPeriods').value=values.periods.join(',');field('chartCloudFields').hidden=!values.cloud;field('chartCloudPeriods').value=values.cloud?.join(',')||'';field('chartBBFields').hidden=current.barCycle!=='day';field('chartBBPeriod').value=values.bb.period;field('chartBBMultiplier').value=values.bb.multiplier;field('chartBBShift').value=values.bb.shift;field('chartSettingsError').textContent='';}
 field('chartIndicatorSettings').addEventListener('click',()=>{if(!current)return;fill(window.StockBookChartSeries.indicatorSettings(current.barCycle,settings[current.barCycle]));dialog.showModal();});
 field('chartSettingsClose').addEventListener('click',()=>dialog.close());field('chartSettingsReset').addEventListener('click',()=>fill(window.StockBookChartSeries.indicatorSettings(current.barCycle)));
 field('chartSettingsForm').addEventListener('submit',event=>{
  event.preventDefault();if(!current)return;
  try{
   const value=window.StockBookChartSeries.indicatorSettings(current.barCycle,{periods:numbers(field('chartMAPeriods').value),cloud:current.barCycle==='day'||current.barCycle==='week'?numbers(field('chartCloudPeriods').value):null,bb:{period:Number(field('chartBBPeriod').value),multiplier:Number(field('chartBBMultiplier').value),shift:Number(field('chartBBShift').value)}});
   window.StockBookCharts.controller(host)?.setSettings(value);settings[current.barCycle]=value;
   try{localStorage.setItem('stockbook:chart:settings:v1',JSON.stringify(settings));}catch{}dialog.close();
  }catch(error){field('chartSettingsError').textContent=error.message;}
 });
})();
