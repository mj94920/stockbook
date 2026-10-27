(function(root){
 'use strict';
 const memory=new Map(),indicatorMemory=new Map(),types=['trend','horizontal','vertical','thirds','quarters','midpoint','rectangle','ellipse','triangle','arrow','pen','text'];
 function mount(host,controller,{tools=true,compact=false}={}){
  const doc=host.ownerDocument,svg=host.querySelector('[data-chart-id="chart"]'),pressure=host.querySelector('[data-chart-id="pressureChart"]'),abort=new AbortController(),signal=abort.signal;
  const key=controller.getModel().stockCode+':'+controller.getModel().config.label,storageKey='stockbook:chart:drawings:v1:'+key;
  const visibilityKey='stockbook:chart:visibility:v1:'+key;let hidden=indicatorMemory.get(key)||[],lastVisibility='';
  try{const saved=JSON.parse(root.localStorage.getItem(visibilityKey));if(Array.isArray(saved)&&saved.length<=32&&saved.every(id=>typeof id==='string'&&/^(ma:\d+|bb|cloud|pressure|investors|profile)$/.test(id)))hidden=saved;const type=root.localStorage.getItem('stockbook:chart:type:v1');if(root.StockBookChartSeries.chartTypes.includes(type))controller.setType(type);}catch{}
  if(tools)controller.setHiddenIndicators(hidden);svg.setAttribute('tabindex','0');
  let drawings=memory.get(key)||[],mode='zoom',selected=null,selectedIndicator=null,pending=null,gesture=null,stroke=null,nextId=Math.max(0,...drawings.map(d=>d.id))+1,history=[],preview=null,touches=new Map(),pinch=null,wheelRemainder=0;
  const ns='http://www.w3.org/2000/svg',node=(tag,attrs={},text)=>{const el=doc.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el;};
  const tip=doc.createElement('div');tip.className='sb-chart-tooltip';tip.hidden=true;tip.setAttribute('role','status');host.append(tip);
  const status=doc.createElement('div');status.className='sb-chart-tool-status';status.textContent='봉 위에 마우스를 올리거나 터치하면 정보를 봅니다.';
  const toolbar=doc.createElement('div');toolbar.className='sb-chart-tools';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','차트 그리기 도구');
  const nav=doc.createElement('div');nav.className='sb-chart-navigation';const indicatorControls=doc.createElement('div');indicatorControls.className='sb-chart-indicator-controls';indicatorControls.setAttribute('aria-label','차트 지표 선택');
  const typeChoice=doc.createElement('select'),typeLabel=doc.createElement('label');typeChoice.className='sb-input sb-chart-type';typeChoice.setAttribute('aria-label','차트 유형');
  for(const [value,label]of [['candle','기본 캔들'],['hollow','빈 캔들'],['volume','볼륨캔들'],['profile','매물대']])typeChoice.add(new Option(label,value));typeChoice.value=controller.getType();typeLabel.append('유형 ',typeChoice);
  typeChoice.addEventListener('change',()=>{controller.setType(typeChoice.value);try{root.localStorage.setItem('stockbook:chart:type:v1',typeChoice.value);}catch{}},{signal});
  const indicatorPanel=doc.createElement('details'),indicatorList=doc.createElement('div'),indicatorSummary=doc.createElement('summary');indicatorPanel.className='sb-chart-indicator-panel';indicatorSummary.textContent='지표 표시';indicatorList.className='sb-chart-indicator-list';indicatorPanel.append(indicatorSummary,indicatorList);let catalogKey='';
  indicatorList.addEventListener('change',event=>{const id=event.target.dataset.indicatorToggle;if(!id)return;remember();if(!event.target.checked&&selectedIndicator===id)selectedIndicator=null;const hidden=controller.getHiddenIndicators().filter(value=>value!==id);if(!event.target.checked)hidden.push(id);controller.setHiddenIndicators(hidden);},{signal});
  const barInfo=doc.createElement('div');barInfo.className='sb-chart-bar-info';barInfo.setAttribute('aria-label','선택 봉 정보');
  const controls=doc.createElement('div');controls.className='sb-chart-compact-controls';
  const toolPanel=doc.createElement('details');toolPanel.className='sb-chart-tool-panel';
  const priceLabel=doc.createElement('div'),dateLabel=doc.createElement('div');
  for(const label of [priceLabel,dateLabel]){label.className='sb-chart-axis-label';label.hidden=true;if(compact)host.append(label);}
  const textInput=doc.createElement('input');textInput.className='sb-input';textInput.placeholder='차트 메모';textInput.maxLength=160;textInput.setAttribute('aria-label','차트 메모');
  const center=doc.createElement('select');center.className='sb-input';center.setAttribute('aria-label','봉중심선 기준');center.add(new Option('고저 중심','range'));center.add(new Option('몸통 중심','body'));
  function button(label,action,parent=toolbar,attrs={}){const el=doc.createElement('button');el.type='button';el.className='sb-btn';el.textContent=label;Object.assign(el.dataset,attrs);el.addEventListener('click',action,{signal});parent.append(el);return el;}
  const setMode=value=>{if(compact)toolPanel.open=false;mode=value;pending=null;stroke=null;preview=null;for(const b of toolbar.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===mode));status.textContent=({zoom:'왼쪽 드래그는 축소, 오른쪽은 확대합니다. 휠·이동 막대는 가로 이동만 합니다. 드래그 중 Space는 한 단계 축소합니다.',midpoint:'봉을 누르면 선택 기준의 중심선을 그립니다.',pen:'누른 채 자유롭게 그립니다.',text:'메모를 입력한 뒤 표시할 곳을 누르세요.'})[value]||'시작점과 끝점을 누르거나 끌어 그립니다. Esc로 취소합니다.';};
  if(tools){
   for(const [value,label]of [['zoom','확대 조절'],['trend','추세선'],['horizontal','수평선'],['vertical','수직선'],['thirds','3등분'],['quarters','4등분'],['midpoint','봉중심선'],['rectangle','사각형'],['ellipse','원·타원'],['triangle','삼각형'],['arrow','화살표'],['pen','펜'],['text','텍스트']])button(label,()=>setMode(value),toolbar,{tool:value});
   toolbar.append(center,textInput);button('선택 삭제',deleteSelection);button('실행 취소',()=>{if(history.length){const previous=history.pop();drawings=previous.drawings;selected=null;selectedIndicator=null;controller.setHiddenIndicators(previous.hidden);draw();}});button('지표 복원',()=>{remember();selectedIndicator=null;controller.setHiddenIndicators([]);status.textContent='지운 지표를 복원했습니다.';});button('차트 설정 초기화',resetSettings).title='현재 봉 주기의 지표·표시·유형·확대·이동을 기본값으로 돌립니다. 그린 선과 메모는 유지합니다.';button('모두 지우기',()=>{remember();drawings=[];selected=null;draw();});
   button('저장',()=>{try{root.localStorage.setItem(storageKey,JSON.stringify({version:1,key,drawings}));status.textContent='이 종목·봉 주기의 그림을 저장했습니다.';}catch{status.textContent='그림을 저장하지 못했습니다.';}});
   button('불러오기',()=>{try{const saved=JSON.parse(root.localStorage.getItem(storageKey));if(saved?.version!==1||saved.key!==key||!Array.isArray(saved.drawings)||saved.drawings.length>200)throw Error();for(const d of saved.drawings)if(!Number.isSafeInteger(d.id)||d.id<1||!types.includes(d.type)||!Array.isArray(d.points)||d.points.length<1||d.points.length>500||d.points.some(a=>typeof a.key!=='string'||a.key.length>32||!Number.isInteger(a.extra)||Math.abs(a.extra)>120||!Number.isFinite(a.price)||a.price<=0)||typeof(d.text||'')!=='string')throw Error();remember();drawings=saved.drawings;nextId=Math.max(0,...drawings.map(d=>d.id))+1;draw();status.textContent='저장한 그림을 불러왔습니다.';}catch{status.textContent='저장 자료를 읽지 못했습니다. 현재 그림은 유지합니다.';}});
   button('−',()=>zoom(1.4),nav);button('+',()=>zoom(1/1.4),nav);button('처음 보기',()=>controller.resetView(),nav);button('최신',()=>controller.scrollTo(1),nav);
   if(compact){
    const summary=doc.createElement('summary');summary.textContent='차트 도구';
    const body=doc.createElement('div');body.className='sb-chart-tool-panel-body';body.append(toolbar,indicatorPanel,indicatorControls,nav,status);
    toolPanel.append(summary,body);controls.append(typeLabel,toolPanel,barInfo);svg.before(controls);
    toolPanel.addEventListener('toggle',()=>{if(toolPanel.open)body.style.maxHeight=Math.max(60,Math.min(260,host.clientHeight-controls.offsetTop-controls.offsetHeight-8))+'px';},{signal});
   }else{toolbar.prepend(typeLabel);host.prepend(toolbar);toolbar.after(indicatorPanel);svg.after(nav);nav.after(status);}
  }
  // Inputs are separate from chart SVG coordinates; vertical bar height remains fixed.
  const scroll=doc.createElement('input'),scale=doc.createElement('input'),readout=doc.createElement('span');
  scroll.type=scale.type='range';scroll.min=scale.min='0';scroll.max='1000';scroll.title='가로 이동 전용 · 표시 봉 수 유지';scale.title='확대·축소 전용 · 이동 위치 비율 유지';scroll.setAttribute('aria-label','차트 가로 스크롤');scale.setAttribute('aria-label','차트 축척');readout.className='sb-chart-count';
  if(tools){const moveLabel=doc.createElement('label'),scaleLabel=doc.createElement('label');moveLabel.append('이동 ',scroll);scaleLabel.append('축척 ',scale);nav.append(moveLabel,scaleLabel,readout);scroll.addEventListener('input',()=>{controller.scrollTo(Number(scroll.value)/1000);},{signal});scale.addEventListener('input',()=>{const m=controller.getModel();controller.zoomTo(m.all.length-Number(scale.value));},{signal});}
  function remember(){history.push({drawings:JSON.parse(JSON.stringify(drawings)),hidden:controller.getHiddenIndicators()});if(history.length>30)history.shift();}
  function resetSettings(){
   if(gesture&&svg.hasPointerCapture(gesture.id))svg.releasePointerCapture(gesture.id);gesture=null;pending=null;stroke=null;preview=null;pinch=null;wheelRemainder=0;touches.clear();svg.classList.remove('sb-chart-object-dragging');selected=null;selectedIndicator=null;center.value='range';history=history.map(item=>({...item,hidden:[]}));setMode('zoom');hide();
   host.dispatchEvent(new CustomEvent('stockbook:chart-settings-reset'));controller.resetSettings();try{root.localStorage.setItem('stockbook:chart:type:v1','candle');}catch{}status.textContent='차트 설정을 기본값으로 초기화했습니다. 그린 선·메모는 유지합니다.';
  }
  function deleteSelection(){
   if(selectedIndicator){remember();const id=selectedIndicator;selectedIndicator=null;controller.setHiddenIndicators([...controller.getHiddenIndicators(),id]);status.textContent='선택 지표를 지웠습니다. 지표 복원 또는 실행 취소로 되돌립니다.';}
   else if(selected!==null){remember();drawings=drawings.filter(d=>d.id!==selected);selected=null;draw();}
  }
  function selectIndicator(id){selected=null;selectedIndicator=id;draw();svg.focus({preventScroll:true});const label=host.querySelector('.sb-chart-indicator[aria-pressed="true"]')?.textContent||'지표';status.textContent=label+' 선택 · Del로 지웁니다.';}
  host.addEventListener('click',e=>{const item=e.target.closest('.sb-chart-indicator');if(tools&&item)selectIndicator(item.dataset.chartIndicator);},{signal});
  function model(){return controller.getModel();}
  function point(event,target=svg){return new DOMPoint(event.clientX,event.clientY).matrixTransform(target.getScreenCTM().inverse());}
  function index(a,m){const i=m.all.findIndex(r=>r.bucket===a.key);return i<0?null:i+a.extra;}
  function xy(a,m){const i=index(a,m);return i===null?null:{x:m.x(i-m.offset),y:m.y(a.price)};}
  function anchor(p,m){const i=Math.max(0,Math.min(m.all.length-1+m.futureCount,m.offset+m.indexForX(p.x))),actual=Math.min(i,m.all.length-1);return {key:m.all[actual].bucket,extra:i-actual,price:Math.max(.01,m.priceForY(Math.max(30,Math.min(520,p.y))))};}
  function shape(d,layer){
   const m=model(),points=d.points.map(a=>xy(a,m));if(points.some(p=>!p))return;const [a,b]=points,color=selected===d.id?'var(--sb-warn,var(--sb-accent))':'var(--sb-accent)',group=node('g',{'data-drawing-id':d.id,class:'sb-chart-drawing'}),attrs={stroke:color,'stroke-width':2,fill:'none','vector-effect':'non-scaling-stroke'};
   const line=(x1,y1,x2,y2)=>group.append(node('line',{...attrs,x1,y1,x2,y2}));
   if(d.type==='horizontal'||d.type==='midpoint')line(25,a.y,1170,a.y);
   else if(d.type==='vertical')line(a.x,30,a.x,520);
   else if(d.type==='text')group.append(node('text',{x:a.x,y:a.y,fill:color,'font-size':15},String(d.text||'').slice(0,160)));
   else if(d.type==='pen')group.append(node('polyline',{...attrs,points:points.map(p=>p.x+','+p.y).join(' ')}));
   else if(b){
    const left=Math.min(a.x,b.x),top=Math.min(a.y,b.y),w=Math.max(1,Math.abs(b.x-a.x)),h=Math.max(1,Math.abs(b.y-a.y));
    if(d.type==='trend'||d.type==='arrow'){line(a.x,a.y,b.x,b.y);if(d.type==='arrow'){const angle=Math.atan2(b.y-a.y,b.x-a.x),r=12;group.append(node('path',{...attrs,d:`M${b.x-r*Math.cos(angle-.45)},${b.y-r*Math.sin(angle-.45)} L${b.x},${b.y} L${b.x-r*Math.cos(angle+.45)},${b.y-r*Math.sin(angle+.45)}`}));}}
    else if(d.type==='rectangle')group.append(node('rect',{...attrs,x:left,y:top,width:w,height:h}));
    else if(d.type==='ellipse')group.append(node('ellipse',{...attrs,cx:left+w/2,cy:top+h/2,rx:w/2,ry:h/2}));
    else if(d.type==='triangle')group.append(node('polygon',{...attrs,points:`${left+w/2},${top} ${left+w},${top+h} ${left},${top+h}`}));
    else{const n=d.type==='thirds'?3:4;for(let i=0;i<=n;i++)line(25,a.y+(b.y-a.y)*i/n,1170,a.y+(b.y-a.y)*i/n);}
   }
   for(const visible of [...group.children]){const hit=visible.cloneNode(true);hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','14');hit.setAttribute('pointer-events','stroke');hit.setAttribute('data-drawing-id',d.id);group.append(hit);}
   if(selected===d.id)for(const i of d.type==='pen'?[0,points.length-1]:points.map((_,i)=>i)){const p=points[i];group.append(node('circle',{cx:p.x,cy:p.y,r:7,fill:'var(--sb-panel)',stroke:color,'stroke-width':2,'data-drawing-id':d.id,'data-handle':i}));}
   layer.append(group);
  }
  function describeBar(row,m){
   if(!row)return '표시 공간 · 가격 자료 없음';
   return [m.config.label+' '+row.date,...['open','high','low','close'].map((k,i)=>['시가','고가','저가','종가'][i]+' '+row[k].toLocaleString()),'거래량 '+row.volume.toLocaleString()].join(' · ');
  }
  function draw(){
   svg.querySelector('.sb-chart-indicator-hits')?.remove();
   if(tools){const hits=node('g',{class:'sb-chart-indicator-hits'});for(const line of svg.querySelectorAll('.ma,.ma-point,.bb-shift')){const hit=line.cloneNode(true);hit.setAttribute('class','sb-chart-indicator-hit');hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','14');hit.setAttribute('fill','none');hit.setAttribute('pointer-events','stroke');hit.setAttribute('vector-effect','non-scaling-stroke');hits.append(hit);}svg.append(hits);}
   svg.querySelector('.sb-chart-drawings')?.remove();const layer=node('g',{class:'sb-chart-drawings'});for(const d of drawings)shape(d,layer);if(stroke?.length>1)shape({id:-1,type:'pen',points:stroke},layer);if(preview)shape(preview,layer);svg.append(layer);memory.set(key,drawings);
   if(tools){
    const catalog=controller.getIndicators(),next=JSON.stringify(catalog);if(catalogKey!==next){catalogKey=next;indicatorList.replaceChildren();for(const item of catalog){const label=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.dataset.indicatorToggle=item.id;input.disabled=!item.available;label.append(input,doc.createTextNode(item.label));indicatorList.append(label);}}
    const hidden=controller.getHiddenIndicators();for(const input of indicatorList.querySelectorAll('input'))input.checked=!input.disabled&&!hidden.includes(input.dataset.indicatorToggle);
    const encoded=JSON.stringify(hidden);if(encoded!==lastVisibility){lastVisibility=encoded;try{root.localStorage.setItem(visibilityKey,encoded);}catch{}}
    typeChoice.value=controller.getType();
   }
   if(compact){indicatorControls.replaceChildren(...[...host.querySelectorAll('[data-chart-id="legend"] .sb-chart-indicator')].map(item=>item.cloneNode(true)));}
   if(tools){indicatorMemory.set(key,controller.getHiddenIndicators());for(const item of host.querySelectorAll('.sb-chart-indicator'))item.setAttribute('aria-pressed',String(item.dataset.chartIndicator===selectedIndicator));}
   const m=model();if(compact){barInfo.textContent=describeBar(m.rows.at(-1),m);barInfo.title=barInfo.textContent;}scroll.value=String(Math.round(m.scrollPosition*1000));scroll.disabled=m.count===m.all.length;scroll.setAttribute('aria-valuetext',m.rows[0].date+' ~ '+m.rows.at(-1).date);scale.max=String(Math.max(0,m.all.length-1));scale.value=String(m.all.length-m.count);readout.textContent=m.count+'봉';
  }
  function hide(){svg.querySelector('.sb-chart-crosshair')?.remove();pressure?.querySelector('.sb-chart-crosshair')?.remove();tip.hidden=true;priceLabel.hidden=true;dateLabel.hidden=true;}
  function show(event,target=svg){
   const m=model(),p=point(event,target);if(p.x<25||p.x>1170)return;hide();const i=Math.max(0,Math.min(m.count-1+m.futureCount,m.indexForX(p.x))),xx=m.x(i),row=m.rows[i],yy=target===svg?Math.max(30,Math.min(520,p.y)):(row?m.y(row.close):30);
   const layer=node('g',{class:'sb-chart-crosshair','pointer-events':'none'}),color='var(--sb-text-2)';layer.append(node('line',{x1:xx,x2:xx,y1:30,y2:560,stroke:color,'stroke-dasharray':'4 4'}),node('line',{x1:25,x2:1170,y1:yy,y2:yy,stroke:color,'stroke-dasharray':'4 4'}));svg.append(layer);
   if(pressure&&!pressure.hasAttribute('hidden')){const l=node('g',{class:'sb-chart-crosshair','pointer-events':'none'});l.append(node('line',{x1:xx,x2:xx,y1:0,y2:80,stroke:color,'stroke-dasharray':'4 4'}));pressure.append(l);}
   if(tools&&!compact){const label=row?row.date:'표시 공간',xLabel=Math.max(25,Math.min(1050,xx-52));layer.append(node('rect',{x:1170,y:yy-11,width:108,height:22,fill:'var(--sb-surface)'}),node('text',{x:1175,y:yy+4,fill:'var(--sb-text-1)','font-size':12},Math.round(m.priceForY(yy)).toLocaleString()),node('rect',{x:xLabel,y:563,width:112,height:23,fill:'var(--sb-surface)'}),node('text',{x:xLabel+5,y:579,fill:'var(--sb-text-1)','font-size':11},label));}
   if(compact){
    barInfo.textContent=describeBar(row,m);barInfo.title=barInfo.textContent;
    const rect=svg.getBoundingClientRect(),anchor=new DOMPoint(xx,yy).matrixTransform(svg.getScreenCTM());
    priceLabel.textContent=Math.round(m.priceForY(yy)).toLocaleString();dateLabel.textContent=row?row.date:'표시 공간';
    priceLabel.style.left=Math.max(rect.left,rect.right-80)+'px';priceLabel.style.top=Math.max(rect.top,Math.min(rect.bottom-22,anchor.y-11))+'px';
    dateLabel.style.left=Math.max(rect.left,Math.min(rect.right-90,anchor.x-45))+'px';dateLabel.style.top=Math.max(rect.top,rect.bottom-22)+'px';
    priceLabel.hidden=dateLabel.hidden=false;
   }
   if(!row){tip.textContent='BB 이동 표시 공간 · 가격 자료 없음';}
   else{const prior=m.all[m.offset+i-1]?.close,change=prior?(row.close/prior-1)*100:null;tip.textContent=[m.name+' · '+m.config.label+' · '+row.date,...['open','high','low','close'].map((k,j)=>['시가','고가','저가','종가'][j]+' '+row[k].toLocaleString()),'직전 봉 대비 '+(change===null?'자료 없음':change.toFixed(2)+'%'),'거래량 '+row.volume.toLocaleString(),...(row.incompleteStart?['첫 기간은 수신 범위 내 부분 집계']:[]),...(row.incompleteEnd?['마지막 봉 완성 여부 미확인']:[]),'거래대금 자료 미수신',...m.averages.map((a,j)=>m.periods[j]+m.config.unit+'선 '+(a[i]===null?'이력 부족':a[i].toLocaleString('ko-KR',{maximumFractionDigits:2})))].join('\n');}
   tip.hidden=false;tip.style.left=Math.max(6,Math.min(root.innerWidth-tip.offsetWidth-8,event.clientX+14))+'px';tip.style.top=Math.max(6,Math.min(root.innerHeight-tip.offsetHeight-8,event.clientY+14))+'px';
  }
  function zoom(factor){const m=model();controller.zoomTo(m.count*factor);}
  function add(type,points){if(drawings.length>=200){status.textContent='그림은 200개까지 추가할 수 있습니다.';return;}remember();const d={id:nextId++,type,points};if(type==='text')d.text=textInput.value.trim()||'메모';drawings.push(d);selected=d.id;selectedIndicator=null;pending=null;setMode('zoom');draw();}
  function down(e){
   if(e.pointerType==='touch'){touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===2){const [a,b]=[...touches.values()],m=model();pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),count:m.count,end:m.end};gesture=null;stroke=null;pending=null;preview=null;svg.setPointerCapture(e.pointerId);e.preventDefault();return;}}
   if(e.button!==0||pinch)return;svg.focus({preventScroll:true});const indicator=e.target.closest('[data-chart-indicator]');if(tools&&indicator&&mode==='zoom'){selectIndicator(indicator.dataset.chartIndicator);e.preventDefault();return;}const p=point(e),m=model();if(p.x<25||p.x>1170||p.y<30||p.y>520)return;
   const hit=e.target.closest('[data-drawing-id]'),d=drawings.find(d=>d.id===Number(hit?.dataset.drawingId));
   if(d&&mode==='zoom'){selected=d.id;selectedIndicator=null;remember();svg.classList.add('sb-chart-object-dragging');gesture={kind:'drawing',id:e.pointerId,start:p,original:JSON.parse(JSON.stringify(d.points)),handle:hit.hasAttribute('data-handle')?Number(hit.dataset.handle):null,drawing:d.id};draw();}
   else if(mode==='zoom'){selected=null;selectedIndicator=null;wheelRemainder=0;gesture={kind:'zoom',id:e.pointerId,x:e.clientX,y:e.clientY,count:m.count};}
   else{gesture={kind:'draw',id:e.pointerId,start:p,anchor:anchor(p,m),moved:false};if(mode==='pen')stroke=[gesture.anchor];}
   svg.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();show(e);
  }
  function move(e){
   if(gesture?.id===e.pointerId){gesture.lastX=e.clientX;gesture.lastY=e.clientY;}
   if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch){if(touches.size===2){const[a,b]=[...touches.values()];controller.zoomTo(pinch.count*pinch.distance/Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)));}e.preventDefault();return;}
   const m=model(),p=point(e);if(!gesture||gesture.id!==e.pointerId){show(e);if(pending){preview={id:-1,type:mode,points:[pending,anchor(p,m)]};draw();}return;}
   if(gesture.kind==='zoom')controller.zoomTo(gesture.count*Math.exp(-(e.clientX-gesture.x)/220));
   else if(gesture.kind==='drawing'){
    const d=drawings.find(d=>d.id===gesture.drawing);if(!d)return;
    if(gesture.handle!==null){d.points=JSON.parse(JSON.stringify(gesture.original));d.points[gesture.handle]=anchor(p,m);}
    else{const ids=gesture.original.map(a=>index(a,m));let delta=m.indexForX(p.x)-m.indexForX(gesture.start.x);delta=Math.max(-Math.min(...ids),Math.min(m.all.length-1+m.futureCount-Math.max(...ids),delta));const priceDiff=m.priceForY(p.y)-m.priceForY(gesture.start.y);d.points=gesture.original.map((a,i)=>{const n=ids[i]+delta,real=Math.min(n,m.all.length-1);return {key:m.all[real].bucket,extra:n-real,price:Math.max(.01,a.price+priceDiff)};});}draw();
   }else{gesture.moved||=Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>4;if(stroke&&stroke.length<500){stroke.push(anchor(p,m));draw();}else if(!['horizontal','vertical','midpoint','text'].includes(mode)){preview={id:-1,type:mode,points:[pending||gesture.anchor,anchor(p,m)]};draw();}}
   e.preventDefault();
  }
  function up(e){
   svg.classList.remove('sb-chart-object-dragging');touches.delete(e.pointerId);if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
   if(pinch){if(!touches.size)pinch=null;gesture=null;return;}if(!gesture||gesture.id!==e.pointerId)return;
   const g=gesture;gesture=null;const m=model(),p=point(e);if(g.kind!=='draw'){show(e);return;}
   if(mode==='pen'){if(stroke?.length>1)add('pen',stroke);stroke=null;return;}
   const a=anchor(p,m);
   if(['horizontal','vertical','text','midpoint'].includes(mode)){
    if(mode==='midpoint'){const i=index(a,m),r=m.all[i];if(!r)return;a.price=center.value==='body'?(r.open+r.close)/2:(r.high+r.low)/2;}
    add(mode,[a]);
   }else if(g.moved||pending)add(mode,[pending||g.anchor,a]);else{pending=g.anchor;status.textContent='끝점을 누르세요. Esc로 취소합니다.';}
  }
  svg.addEventListener('pointerdown',down,{signal});svg.addEventListener('pointermove',move,{signal});svg.addEventListener('pointerup',up,{signal});
  svg.addEventListener('pointercancel',()=>{svg.classList.remove('sb-chart-object-dragging');gesture=null;stroke=null;pending=null;preview=null;touches.clear();pinch=null;draw();},{signal});svg.addEventListener('pointerleave',()=>{if(!gesture)hide();},{signal});
  function scrollWheel(e){
   if(e.ctrlKey)return;const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!delta)return;e.preventDefault();
   if(gesture||pinch){wheelRemainder=0;return;}
   wheelRemainder+=e.deltaMode===1?delta:e.deltaMode===2?delta*model().count:delta/40;const bars=Math.trunc(wheelRemainder);if(bars){wheelRemainder-=bars;controller.scrollBy(bars);}
  }
  for(const target of [svg,pressure,scroll,scale])target?.addEventListener('wheel',scrollWheel,{passive:false,signal});
  host.querySelector('[data-chart-id="investorChart"]')?.addEventListener('pointerdown',()=>{if(tools&&controller.getIndicators().some(item=>item.id==='investors'&&item.available))selectIndicator('investors');},{signal});
  pressure?.setAttribute('data-chart-indicator','pressure');pressure?.addEventListener('pointerdown',()=>{if(tools)selectIndicator('pressure');},{signal});
  pressure?.addEventListener('pointermove',e=>show(e,pressure),{signal});pressure?.addEventListener('pointerleave',hide,{signal});
  if(compact)doc.addEventListener('pointerdown',event=>{if(!controls.contains(event.target))toolPanel.open=false;},{signal,capture:true});
  doc.addEventListener('keydown',e=>{
   if(e.defaultPrevented||e.isComposing||e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||doc.querySelector('dialog[open]')||root.StockBookShortcuts?.hasOverlay())return;
   if((e.code==='Space'||e.key===' ')&&gesture?.kind==='zoom'){
    e.preventDefault();if(e.repeat)return;
    const before=model();zoom(1.4);const after=model();
    gesture.count=after.count;gesture.x=gesture.lastX??gesture.x;gesture.y=gesture.lastY??gesture.y;
    status.textContent=after.count===before.count?'수신한 전체 이력이 표시되어 더 축소할 수 없습니다.':'Space 축소 · '+after.count+'봉 표시 · 드래그를 유지한 채 다시 Space를 누를 수 있습니다.';
    return;
   }
   if(!host.contains(doc.activeElement)&&!host.contains(e.target)&&!(tools&&!compact&&e.key==='Escape'))return;
   if(e.key==='Escape'){
    const drawing=pending||gesture||stroke||mode!=='zoom',panel=doc.activeElement?.closest('details[open]')||[...host.querySelectorAll('details[open]')].at(-1);
    if(drawing){svg.classList.remove('sb-chart-object-dragging');if(gesture&&svg.hasPointerCapture(gesture.id))svg.releasePointerCapture(gesture.id);pending=null;gesture=null;stroke=null;preview=null;touches.clear();pinch=null;setMode('zoom');}
    else if(panel)panel.open=false;else{selected=null;selectedIndicator=null;}
    hide();draw();e.preventDefault();e.stopPropagation();
   }else if(e.key==='Delete'&&tools&&!e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')&&(selected!==null||selectedIndicator)){
    deleteSelection();e.preventDefault();e.stopPropagation();
   }
  },{signal});
  host.addEventListener('stockbook:chart-render',()=>{hide();draw();},{signal});
  let size='';const observer=new ResizeObserver(()=>{const next=svg.clientWidth+':'+svg.clientHeight;if(next!==size){size=next;controller.refresh();}});observer.observe(svg);
  setMode('zoom');draw();
  return {destroy(){memory.set(key,drawings);abort.abort();observer.disconnect();tip.remove();priceLabel.remove();dateLabel.remove();controls.remove();indicatorPanel.remove();toolbar.remove();nav.remove();status.remove();}};
 }
 root.StockBookChartInteraction=Object.freeze({mount});
})(window);
