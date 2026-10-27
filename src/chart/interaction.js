(function(root){
 'use strict';
 const memory=new Map(),types=['trend','horizontal','vertical','thirds','quarters','midpoint','rectangle','ellipse','triangle','arrow','pen','text'];
 function mount(host,controller,{tools=true}={}){
  const doc=host.ownerDocument,svg=host.querySelector('[data-chart-id="chart"]'),pressure=host.querySelector('[data-chart-id="pressureChart"]'),abort=new AbortController(),signal=abort.signal;
  const key=controller.getModel().stockCode+':'+controller.getModel().config.label,storageKey='stockbook:chart:drawings:v1:'+key;
  let drawings=memory.get(key)||[],mode='zoom',selected=null,pending=null,gesture=null,stroke=null,nextId=Math.max(0,...drawings.map(d=>d.id))+1,history=[],preview=null,touches=new Map(),pinch=null;
  const ns='http://www.w3.org/2000/svg',node=(tag,attrs={},text)=>{const el=doc.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el;};
  const tip=doc.createElement('div');tip.className='sb-chart-tooltip';tip.hidden=true;tip.setAttribute('role','status');host.append(tip);
  const status=doc.createElement('div');status.className='sb-chart-tool-status';status.textContent='봉 위에 마우스를 올리거나 터치하면 정보를 봅니다.';
  const toolbar=doc.createElement('div');toolbar.className='sb-chart-tools';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','차트 그리기 도구');
  const nav=doc.createElement('div');nav.className='sb-chart-navigation';
  const textInput=doc.createElement('input');textInput.className='sb-input';textInput.placeholder='차트 메모';textInput.maxLength=160;textInput.setAttribute('aria-label','차트 메모');
  const center=doc.createElement('select');center.className='sb-input';center.setAttribute('aria-label','봉중심선 기준');center.add(new Option('고저 중심','range'));center.add(new Option('몸통 중심','body'));
  function button(label,action,parent=toolbar,attrs={}){const el=doc.createElement('button');el.type='button';el.className='sb-btn';el.textContent=label;Object.assign(el.dataset,attrs);el.addEventListener('click',action,{signal});parent.append(el);return el;}
  const setMode=value=>{mode=value;pending=null;stroke=null;preview=null;for(const b of toolbar.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===mode));status.textContent=({zoom:'빈 곳을 왼쪽으로 끌면 축소, 오른쪽으로 끌면 확대합니다.',pan:'차트를 좌우로 끌어 이동합니다.',midpoint:'봉을 누르면 선택 기준의 중심선을 그립니다.',pen:'누른 채 자유롭게 그립니다.',text:'메모를 입력한 뒤 표시할 곳을 누르세요.'})[value]||'시작점과 끝점을 누르거나 끌어 그립니다. Esc로 취소합니다.';};
  if(tools){
   for(const [value,label]of [['zoom','확대 조절'],['pan','이동'],['trend','추세선'],['horizontal','수평선'],['vertical','수직선'],['thirds','3등분'],['quarters','4등분'],['midpoint','봉중심선'],['rectangle','사각형'],['ellipse','원·타원'],['triangle','삼각형'],['arrow','화살표'],['pen','펜'],['text','텍스트']])button(label,()=>setMode(value),toolbar,{tool:value});
   toolbar.append(center,textInput);button('선택 삭제',()=>{if(selected===null)return;remember();drawings=drawings.filter(d=>d.id!==selected);selected=null;draw();});button('실행 취소',()=>{if(history.length){drawings=history.pop();selected=null;draw();}});button('모두 지우기',()=>{remember();drawings=[];selected=null;draw();});
   button('저장',()=>{try{root.localStorage.setItem(storageKey,JSON.stringify({version:1,key,drawings}));status.textContent='이 종목·봉 주기의 그림을 저장했습니다.';}catch{status.textContent='그림을 저장하지 못했습니다.';}});
   button('불러오기',()=>{try{const saved=JSON.parse(root.localStorage.getItem(storageKey));if(saved?.version!==1||saved.key!==key||!Array.isArray(saved.drawings)||saved.drawings.length>200)throw Error();for(const d of saved.drawings)if(!Number.isSafeInteger(d.id)||d.id<1||!types.includes(d.type)||!Array.isArray(d.points)||d.points.length<1||d.points.length>500||d.points.some(a=>typeof a.key!=='string'||a.key.length>32||!Number.isInteger(a.extra)||Math.abs(a.extra)>120||!Number.isFinite(a.price)||a.price<=0)||typeof(d.text||'')!=='string')throw Error();remember();drawings=saved.drawings;nextId=Math.max(0,...drawings.map(d=>d.id))+1;draw();status.textContent='저장한 그림을 불러왔습니다.';}catch{status.textContent='저장 자료를 읽지 못했습니다. 현재 그림은 유지합니다.';}});
   button('−',()=>zoom(1.4),nav);button('+',()=>zoom(1/1.4),nav);button('처음 보기',()=>controller.resetView(),nav);button('최신',()=>{const m=controller.getModel();controller.setView(m.count,m.all.length);},nav);
   host.prepend(toolbar);svg.after(nav);nav.after(status);
  }
  // Inputs are separate from chart SVG coordinates; vertical bar height remains fixed.
  const scroll=doc.createElement('input'),scale=doc.createElement('input'),readout=doc.createElement('span');
  scroll.type=scale.type='range';scroll.min=scale.min='0';scroll.setAttribute('aria-label','차트 가로 스크롤');scale.setAttribute('aria-label','차트 축척');readout.className='sb-chart-count';
  if(tools){const moveLabel=doc.createElement('label'),scaleLabel=doc.createElement('label');moveLabel.append('이동 ',scroll);scaleLabel.append('축척 ',scale);nav.append(moveLabel,scaleLabel,readout);scroll.addEventListener('input',()=>{const m=controller.getModel();controller.setView(m.count,Number(scroll.value)+m.count);},{signal});scale.addEventListener('input',()=>{const m=controller.getModel();controller.setView(m.all.length-Number(scale.value),m.end);},{signal});}
  function remember(){history.push(JSON.parse(JSON.stringify(drawings)));if(history.length>30)history.shift();}
  function model(){return controller.getModel();}
  function point(event,target=svg){return new DOMPoint(event.clientX,event.clientY).matrixTransform(target.getScreenCTM().inverse());}
  function index(a,m){const i=m.all.findIndex(r=>r.bucket===a.key);return i<0?null:i+a.extra;}
  function xy(a,m){const i=index(a,m);return i===null?null:{x:m.x(i-m.offset),y:m.y(a.price)};}
  function anchor(p,m){const i=Math.max(0,Math.min(m.all.length-1+m.futureCount,m.offset+Math.round((p.x-25)/m.step-.5))),actual=Math.min(i,m.all.length-1);return {key:m.all[actual].bucket,extra:i-actual,price:Math.max(.01,m.priceForY(Math.max(30,Math.min(520,p.y))))};}
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
  function draw(){
   svg.querySelector('.sb-chart-drawings')?.remove();const layer=node('g',{class:'sb-chart-drawings'});for(const d of drawings)shape(d,layer);if(stroke?.length>1)shape({id:-1,type:'pen',points:stroke},layer);if(preview)shape(preview,layer);svg.append(layer);memory.set(key,drawings);
   const m=model();scroll.max=String(Math.max(0,m.all.length-m.count));scroll.value=String(m.offset);scale.max=String(Math.max(0,m.all.length-1));scale.value=String(m.all.length-m.count);readout.textContent=m.count+'봉';
  }
  function hide(){svg.querySelector('.sb-chart-crosshair')?.remove();pressure?.querySelector('.sb-chart-crosshair')?.remove();tip.hidden=true;}
  function show(event,target=svg){
   const m=model(),p=point(event,target);if(p.x<25||p.x>1170)return;hide();const i=Math.max(0,Math.min(m.count-1+m.futureCount,Math.round((p.x-25)/m.step-.5))),xx=m.x(i),row=m.rows[i],yy=target===svg?Math.max(30,Math.min(520,p.y)):(row?m.y(row.close):30);
   const layer=node('g',{class:'sb-chart-crosshair','pointer-events':'none'}),color='var(--sb-text-2)';layer.append(node('line',{x1:xx,x2:xx,y1:30,y2:560,stroke:color,'stroke-dasharray':'4 4'}),node('line',{x1:25,x2:1170,y1:yy,y2:yy,stroke:color,'stroke-dasharray':'4 4'}));svg.append(layer);
   if(pressure&&!pressure.hasAttribute('hidden')){const l=node('g',{class:'sb-chart-crosshair','pointer-events':'none'});l.append(node('line',{x1:xx,x2:xx,y1:0,y2:80,stroke:color,'stroke-dasharray':'4 4'}));pressure.append(l);}
   if(tools){const label=row?row.date:'표시 공간',xLabel=Math.max(25,Math.min(1050,xx-52));layer.append(node('rect',{x:1170,y:yy-11,width:108,height:22,fill:'var(--sb-surface)'}),node('text',{x:1175,y:yy+4,fill:'var(--sb-text-1)','font-size':12},Math.round(m.priceForY(yy)).toLocaleString()),node('rect',{x:xLabel,y:563,width:112,height:23,fill:'var(--sb-surface)'}),node('text',{x:xLabel+5,y:579,fill:'var(--sb-text-1)','font-size':11},label));}
   if(!row){tip.textContent='BB 이동 표시 공간 · 가격 자료 없음';}
   else{const prior=m.all[m.offset+i-1]?.close,change=prior?(row.close/prior-1)*100:null;tip.textContent=[m.name+' · '+m.config.label+' · '+row.date,...['open','high','low','close'].map((k,j)=>['시가','고가','저가','종가'][j]+' '+row[k].toLocaleString()),'직전 봉 대비 '+(change===null?'자료 없음':change.toFixed(2)+'%'),'거래량 '+row.volume.toLocaleString(),...(row.incompleteStart?['첫 기간은 수신 범위 내 부분 집계']:[]),...(row.incompleteEnd?['마지막 봉 완성 여부 미확인']:[]),'거래대금 자료 미수신',...m.averages.map((a,j)=>m.periods[j]+m.config.unit+'선 '+(a[i]===null?'이력 부족':a[i].toLocaleString('ko-KR',{maximumFractionDigits:2})))].join('\n');}
   tip.hidden=false;tip.style.left=Math.max(6,Math.min(root.innerWidth-tip.offsetWidth-8,event.clientX+14))+'px';tip.style.top=Math.max(6,Math.min(root.innerHeight-tip.offsetHeight-8,event.clientY+14))+'px';
  }
  function zoom(factor){const m=model();controller.setView(m.count*factor,m.end);}
  function add(type,points){if(drawings.length>=200){status.textContent='그림은 200개까지 추가할 수 있습니다.';return;}remember();const d={id:nextId++,type,points};if(type==='text')d.text=textInput.value.trim()||'메모';drawings.push(d);selected=d.id;pending=null;setMode('zoom');draw();}
  function down(e){
   if(e.pointerType==='touch'){touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===2){const [a,b]=[...touches.values()],m=model();pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),count:m.count,end:m.end};gesture=null;stroke=null;pending=null;preview=null;svg.setPointerCapture(e.pointerId);e.preventDefault();return;}}
   if(e.button!==0||pinch)return;const p=point(e),m=model();if(p.x<25||p.x>1170||p.y<30||p.y>520)return;
   const hit=e.target.closest('[data-drawing-id]'),d=drawings.find(d=>d.id===Number(hit?.dataset.drawingId));
   if(d&&(mode==='zoom'||mode==='pan')){selected=d.id;remember();gesture={kind:'drawing',id:e.pointerId,start:p,original:JSON.parse(JSON.stringify(d.points)),handle:hit.hasAttribute('data-handle')?Number(hit.dataset.handle):null,drawing:d.id};draw();}
   else if(mode==='zoom'||mode==='pan'){selected=null;gesture={kind:mode==='pan'||e.pointerType==='touch'?'pan':'zoom',id:e.pointerId,x:e.clientX,y:e.clientY,count:m.count,end:m.end,step:m.step*Math.abs(svg.getScreenCTM().a)};}
   else{gesture={kind:'draw',id:e.pointerId,start:p,anchor:anchor(p,m),moved:false};if(mode==='pen')stroke=[gesture.anchor];}
   svg.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();show(e);
  }
  function move(e){
   if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch){if(touches.size===2){const[a,b]=[...touches.values()];controller.setView(pinch.count*pinch.distance/Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),pinch.end);}e.preventDefault();return;}
   const m=model(),p=point(e);if(!gesture||gesture.id!==e.pointerId){show(e);if(pending){preview={id:-1,type:mode,points:[pending,anchor(p,m)]};draw();}return;}
   if(gesture.kind==='zoom')controller.setView(gesture.count*Math.exp(-(e.clientX-gesture.x)/220),gesture.end);
   else if(gesture.kind==='pan')controller.setView(gesture.count,gesture.end-Math.round((e.clientX-gesture.x)/gesture.step));
   else if(gesture.kind==='drawing'){
    const d=drawings.find(d=>d.id===gesture.drawing);if(!d)return;
    if(gesture.handle!==null){d.points=JSON.parse(JSON.stringify(gesture.original));d.points[gesture.handle]=anchor(p,m);}
    else{const ids=gesture.original.map(a=>index(a,m));let delta=Math.round((p.x-gesture.start.x)/m.step);delta=Math.max(-Math.min(...ids),Math.min(m.all.length-1+m.futureCount-Math.max(...ids),delta));const priceDiff=m.priceForY(p.y)-m.priceForY(gesture.start.y);d.points=gesture.original.map((a,i)=>{const n=ids[i]+delta,real=Math.min(n,m.all.length-1);return {key:m.all[real].bucket,extra:n-real,price:Math.max(.01,a.price+priceDiff)};});}draw();
   }else{gesture.moved||=Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>4;if(stroke&&stroke.length<500){stroke.push(anchor(p,m));draw();}else if(!['horizontal','vertical','midpoint','text'].includes(mode)){preview={id:-1,type:mode,points:[pending||gesture.anchor,anchor(p,m)]};draw();}}
   e.preventDefault();
  }
  function up(e){
   touches.delete(e.pointerId);if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
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
  svg.addEventListener('pointercancel',()=>{gesture=null;stroke=null;pending=null;preview=null;touches.clear();pinch=null;draw();},{signal});svg.addEventListener('pointerleave',()=>{if(!gesture)hide();},{signal});
  svg.addEventListener('wheel',e=>{if(e.ctrlKey)return;e.preventDefault();zoom(e.deltaY<0?1/1.25:1.25);},{passive:false,signal});
  pressure?.addEventListener('pointermove',e=>show(e,pressure),{signal});pressure?.addEventListener('pointerleave',hide,{signal});
  doc.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select'))return;if(e.key==='Escape'){pending=null;gesture=null;stroke=null;preview=null;hide();draw();}if(e.key==='Delete'&&selected!==null){remember();drawings=drawings.filter(d=>d.id!==selected);selected=null;draw();}},{signal});
  host.addEventListener('stockbook:chart-render',()=>{hide();draw();},{signal});
  let size='';const observer=new ResizeObserver(()=>{const next=svg.clientWidth+':'+svg.clientHeight;if(next!==size){size=next;controller.refresh();}});observer.observe(svg);
  setMode('zoom');draw();
  return {destroy(){memory.set(key,drawings);abort.abort();observer.disconnect();tip.remove();toolbar.remove();nav.remove();status.remove();}};
 }
 root.StockBookChartInteraction=Object.freeze({mount});
})(window);
