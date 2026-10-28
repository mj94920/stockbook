(function(root){
 'use strict';
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const read=key=>{try{const value=JSON.parse(root.localStorage.getItem(key));return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}};
 const save=(key,value)=>{try{root.localStorage.setItem(key,JSON.stringify(value));}catch{}};
 function separator(parent,label,{value,limits,change,commit,reset},signal){
  const handle=parent.ownerDocument.createElement('div');handle.className='sb-resize-handle';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','horizontal');handle.setAttribute('aria-label',label);handle.title=label+' · 위아래로 끌기 · ↑↓ 조절 · 더블클릭/Enter 기본값';parent.append(handle);
  let drag=null;
  function update(){const [min,max]=limits();handle.setAttribute('aria-valuemin',Math.round(min));handle.setAttribute('aria-valuemax',Math.round(max));handle.setAttribute('aria-valuenow',Math.round(value()));}
  function apply(next){const [min,max]=limits();change(clamp(next,min,max));update();}
  handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();handle.focus({preventScroll:true});drag={id:event.pointerId,y:event.clientY,value:value()};handle.setPointerCapture(event.pointerId);handle.classList.add('sb-resize-active');},{signal});
  handle.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();apply(drag.value+event.clientY-drag.y);},{signal});
  const finish=event=>{if(!drag||drag.id!==event.pointerId)return;drag=null;handle.classList.remove('sb-resize-active');if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);commit();};
  handle.addEventListener('pointerup',finish,{signal});handle.addEventListener('pointercancel',finish,{signal});handle.addEventListener('lostpointercapture',finish,{signal});
  handle.addEventListener('dblclick',()=>{reset();update();},{signal});
  handle.addEventListener('keydown',event=>{const [min,max]=limits();const next={ArrowUp:value()-16,ArrowDown:value()+16,Home:min,End:max}[event.key];if(next!==undefined){event.preventDefault();apply(next);commit();}else if(event.key==='Enter'){event.preventDefault();reset();update();}},{signal});
  update();return {handle,update};
 }
 function mountChart(host,controller,mode){
  const abort=new AbortController(),signal=abort.signal,key='stockbook:chart:heights:v1:'+mode+':'+controller.getModel().config.label,prefs=read(key),compact=mode==='compact';
  for(const field of Object.keys(prefs))if(!Number.isFinite(prefs[field])||prefs[field]<=0||prefs[field]>3)delete prefs[field];
  const layer=host.ownerDocument.createElement('div');layer.className='sb-chart-resizers';host.append(layer);
  const price=host.querySelector('[data-chart-id="chart"]'),volume=host.querySelector('[data-chart-id="pressureChart"]'),investors=host.querySelector('[data-chart-id="investorChart"]'),money=host.querySelector('[data-chart-id="moneyPanel"]'),moneySvg=host.querySelector('[data-chart-id="moneyChart"]');
  const height=()=>Math.max(1,host.clientHeight),visible=element=>!!element?.getClientRects().length&&element.getBoundingClientRect().height>0&&!element.closest('[hidden]')&&!(element.tagName.toLowerCase()!=='details'&&element.closest('details:not([open])'));
  const plotBudget=()=>Math.max(1,host.getBoundingClientRect().top+host.clientTop+host.clientHeight-parseFloat(getComputedStyle(host).paddingBottom||0)-price.getBoundingClientRect().top);
  const available=()=>Math.max(1,plotBudget()-(compact&&visible(money)?money.getBoundingClientRect().height:0));
  const moneyLimit=()=>compact?Math.max(32,Math.min(height()*.7,plotBudget()-(money?.querySelector('summary')?.getBoundingClientRect().height||20)-73)):height()*.7;
  const volumeLimits=()=>{const total=available(),min=Math.min(24,total*.4);return [min,Math.max(min,total-Math.min(48,total*.6))];};
  const items=[];let frame=0;
  function apply(){
   if(compact){if(moneySvg){moneySvg.style.height=clamp(prefs.money?prefs.money*height():64,32,Math.max(32,moneyLimit()))+'px';moneySvg.style.maxHeight='none';}if(visible(volume)){const [min,max]=volumeLimits();host.style.setProperty('--sb-volume-height',clamp((prefs.volume??.3)*available(),min,max)+'px');}}
   else{const total=clamp(height()*.6,240,600);for(const [field,element,min,max]of [['price',price,120,height()*2],['volume',volume,24,height()*.7],['investors',investors,36,height()*.8],['money',moneySvg,32,height()*.7]])if(element){const size=prefs[field]?prefs[field]*height():field==='price'?total*.7:field==='volume'?total*.3:null;if(size!==null){element.style.height=clamp(size,min,Math.max(min,max))+'px';element.style.maxHeight='none';}}}
   position();
  }
  function position(){const box=host.getBoundingClientRect();for(const item of items){item.handle.hidden=!visible(item.target)||(compact&&item.field==='price'&&!visible(volume));if(!item.handle.hidden){const rect=item.target.getBoundingClientRect();item.handle.style.top=rect.bottom-box.top+host.scrollTop-5+'px';item.update();}}}
  function schedule(){if(!frame)frame=root.requestAnimationFrame(()=>{frame=0;apply();});}
  function add(field,target,label,min,max){if(!target)return;
   const item=separator(layer,label,{value:()=>target.getBoundingClientRect().height,limits:()=>{const lower=typeof min==='function'?min():min;return [lower,Math.max(lower,max())];},change:value=>{if(compact&&field==='price'){prefs.volume=clamp(available()-value,...volumeLimits())/available();}else prefs[field]=value/height();apply();},commit:()=>save(key,prefs),reset:()=>{delete prefs[compact&&field==='price'?'volume':field];if(compact&&field==='price')host.style.removeProperty('--sb-volume-height');else{target.style.removeProperty('height');target.style.removeProperty('max-height');}save(key,prefs);schedule();}},signal);
   items.push({...item,target,field});
  }
  if(compact){add('price',price,'가격·거래량 구간 높이',()=>Math.min(48,available()*.6),()=>available()-volumeLimits()[0]);add('money',moneySvg,'거래대금 구간 높이',32,moneyLimit);}
  else{add('price',price,'가격 차트 높이',120,()=>height()*2);add('volume',volume,'거래량 구간 높이',24,()=>height()*.7);add('investors',investors,'수급 구간 높이',36,()=>height()*.8);add('money',moneySvg,'거래대금 구간 높이',32,moneyLimit);}
  const observer=new ResizeObserver(schedule);for(const element of [host,price,volume,investors,money,moneySvg])if(element)observer.observe(element);
  host.addEventListener('stockbook:chart-render',schedule,{signal});host.addEventListener('toggle',schedule,{signal,capture:true});
  host.addEventListener('stockbook:chart-settings-reset',()=>{for(const field of Object.keys(prefs))delete prefs[field];host.style.removeProperty('--sb-volume-height');for(const element of [price,volume,investors,moneySvg]){element?.style.removeProperty('height');element?.style.removeProperty('max-height');}save(key,prefs);schedule();},{signal});
  apply();return {destroy(){abort.abort();observer.disconnect();if(frame)root.cancelAnimationFrame(frame);layer.remove();host.style.removeProperty('--sb-volume-height');}};
 }
 function mountWorkspace(){
  const workspace=document.getElementById('mdiWorkspace');if(!workspace)return;
  const key='stockbook:workspace:heights:v1',prefs=read(key),abort=new AbortController(),signal=abort.signal;
  for(const field of Object.keys(prefs))if(!Number.isFinite(prefs[field])||prefs[field]<=0||prefs[field]>=1)delete prefs[field];
  const context=document.getElementById('dockCtx');let frame=0;
  const tab=()=>workspace.dataset.workTab||'pf';
  const available=()=>{const css=getComputedStyle(workspace);return Math.max(1,workspace.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)-2*parseFloat(css.rowGap||0));};
  const limits=()=>{const size=available(),min=Math.min(220,size*.45);return [min,Math.max(min,size-Math.min(tab()==='journal'?240:180,size*.4))];};
  function apply(){const enabled=root.innerWidth>900&&context.getBoundingClientRect().width>0;
   split.handle.hidden=!enabled;
   if(enabled&&prefs[tab()]){const [min,max]=limits(),chart=clamp(prefs[tab()]*available(),min,max);workspace.style.setProperty('--sb-work-height',available()-chart+'px');workspace.classList.add('sb-user-split');}
   else{workspace.classList.remove('sb-user-split');workspace.style.removeProperty('--sb-work-height');}
   if(enabled){const outer=workspace.getBoundingClientRect(),box=context.getBoundingClientRect();split.handle.style.left=box.left-outer.left+workspace.scrollLeft+'px';split.handle.style.width=box.width+'px';split.handle.style.top=box.bottom-outer.top+workspace.scrollTop+'px';split.update();}
  }
  function schedule(){if(!frame)frame=root.requestAnimationFrame(()=>{frame=0;apply();});}
  const split=separator(workspace,'차트와 하단 작업 패널 높이',{value:()=>context.getBoundingClientRect().height,limits,change:value=>{prefs[tab()]=value/available();apply();},commit:()=>save(key,prefs),reset:()=>{delete prefs[tab()];save(key,prefs);apply();}},signal);
  split.handle.classList.add('sb-workspace-resizer');
  const observer=new ResizeObserver(schedule);observer.observe(workspace);observer.observe(context);
  new MutationObserver(schedule).observe(workspace,{attributes:true,attributeFilter:['data-dock-screen','data-work-tab']});root.addEventListener('resize',schedule,{signal});apply();
 }
 root.StockBookChartResize=Object.freeze({mount:mountChart});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountWorkspace,{once:true});else mountWorkspace();
})(window);
