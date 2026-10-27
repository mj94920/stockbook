/* Adapted from chart-proof commit 6d143e4. Recorded data, not a live price source.
 * The original SMA/BB, pressure and investor calculations are kept in this scoped renderer. */
(function(root){
'use strict';
function mount(host,dataset,{mode='detail',period='6m',viewRange=period,barCycle='day',indicatorCycle=barCycle,light:lightMode=false}={}){
 const series=root.StockBookChartSeries,config=series.cycleConfig(barCycle);
 if(indicatorCycle!==barCycle)throw Error('봉 주기와 지표 주기가 다릅니다.');
 const all=series.aggregate(dataset.candles,barCycle,dataset.metadata);
 const initialOffset=series.visibleOffset(all,viewRange,barCycle);
 let offset=initialOffset,visibleCount=all.length-offset,futureCount=barCycle==='day'?25:0;
 const view={count:visibleCount,end:all.length};let model=null,bbSettings={period:40,multiplier:1.9,shift:25};
 const window={};
 const document={getElementById:id=>host.querySelector('[data-chart-id="'+id+'"]'),body:{classList:{contains:()=>lightMode}}};
 host.className='sb-proof-chart '+(mode==='compact'?'sb-proof-compact':'sb-proof-detail');
 host.innerHTML=`<div data-chart-id="notice" class="sb-chart-notice"></div>
 <div class="sb-proof-options"><label><input type="checkbox" data-chart-id="refs">기준선 비교</label><label><input type="checkbox" data-chart-id="original">이동 전 BB 비교</label></div>
 <div data-chart-id="legend" class="sb-proof-legend"></div>
 <svg data-chart-id="chart" viewBox="0 0 1280 600" role="img" aria-label="${dataset.metadata.sourceType==='naver-daily'?'조회':'보존'} ${config.label} 가격 차트"></svg>
 <svg data-chart-id="pressureChart" viewBox="0 0 1280 210" role="img" aria-label="거래량과 추정 매매 압력"></svg>
 <div class="sb-proof-extended"><details class="sb-proof-money"><summary>거래대금 · 실제 금액 미수신</summary><p>날짜별 실제 거래대금 자료가 없어 막대를 표시하지 않습니다.</p></details>
 <details ${dataset.investors?'open':''} data-chart-id="investorPanel"><summary>${dataset.investors?'투자자별 순매수 · 별도 5거래일 축':'투자자별 순매수 · 자료 없음'}</summary><svg data-chart-id="investorChart" viewBox="0 0 1280 290" role="img" aria-label="보존 투자자별 누적 순매수"></svg><details><summary>일별 수량·자료 안내</summary><p data-chart-id="investorInfo"></p><table data-chart-id="investorTable"></table></details></details></div>
 <div data-chart-id="period" class="sb-chart-notice"></div>`;
 document.getElementById('chart').setAttribute('preserveAspectRatio','none');
 if(mode==='compact'){
   document.getElementById('chart').setAttribute('viewBox','15 20 1155 515');
   document.getElementById('chart').setAttribute('preserveAspectRatio','none');
   document.getElementById('pressureChart').setAttribute('viewBox','15 30 1155 165');
   document.getElementById('pressureChart').setAttribute('preserveAspectRatio','none');
 }
 const live=dataset.metadata.sourceType==='naver-daily';
 document.getElementById('notice').textContent=live?dataset.metadata.name+' · 네이버 일봉 · 기준일 '+dataset.metadata.snapshotDate+' · 조회 '+new Date(dataset.metadata.fetchedAt).toLocaleString('ko-KR')+' · 자동 갱신 아님 · 마지막 봉 완성 여부 미확인':dataset.metadata.name+' · '+dataset.metadata.snapshotDate+' 보존 자료 · 자동 갱신 아님'+(all.at(-1).incompleteEnd?' · 마지막 '+config.label+' 미완성':'');
 if(barCycle!=='day')host.querySelector('.sb-proof-options').hidden=true;
 if(barCycle==='year'){host.classList.add('sb-proof-year');document.getElementById('pressureChart').setAttribute('hidden','');host.querySelector('.sb-proof-extended').hidden=true;}
let periods=mode==='compact'&&barCycle==='day'?[5,10,20,60]:config.periods;
const dark=['#f8b4cf','#87cefa','#ffe34d','#48bc70','#9ca3af','#ff2929','#b98b48','#b48af0'];
const light=['#b52664','#1177ad','#9b7300','#168542','#666c76','#c91c28','#8d5c1f','#763cb5'];
const averageCache=new Map(),bbCache=new Map();let pressureCache=null;
function average(all,n){if(!averageCache.has(n)){averageCache.set(n,series.average(all,n,{includePartialStart:barCycle==='year'}));while(averageCache.size>32)averageCache.delete(averageCache.keys().next().value);}return averageCache.get(n);}
function bbUpper(all,n=40,m=1.9){const key=n+':'+m;if(bbCache.has(key))return bbCache.get(key);const result=all.map((_,i)=>{if(i<n-1)return null;const a=all.slice(i-n+1,i+1).map(c=>c.close),mean=a.reduce((s,v)=>s+v,0)/n;return mean+m*Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/n);});bbCache.set(key,result);while(bbCache.size>8)bbCache.delete(bbCache.keys().next().value);return result;}
function render(all){
 const isLight=document.body.classList.contains('light'),palette=isLight?light:dark,colors=config.colors.map(i=>palette[i]),grid=isLight?'#dfe5ee':'#2b3547',text=isLight?'#526079':'#a4adbd';
 offset=Math.max(0,view.end-view.count);visibleCount=view.end-offset;
 const rows=all.slice(offset,view.end),avgs=periods.map(n=>average(all,n).slice(offset,view.end));
 const upper=barCycle==='day'?bbUpper(all,bbSettings.period,bbSettings.multiplier):[],shift=futureCount,bb=barCycle==='day'?rows.map((_,i)=>upper[offset+i-shift]??null):[];
 const referenceBase=all.slice(-600),references=barCycle==='day'?[60,20,5].map(n=>({n,candle:referenceBase[600-n-1]})).filter(r=>r.candle):[];
 const showRefs=barCycle==='day'&&document.getElementById('refs').checked,showOriginal=barCycle==='day'&&document.getElementById('original').checked;
 const future=Array.from({length:futureCount},(_,i)=>upper[view.end-futureCount+i]??null);
 const cloudA=config.cloud?average(all,config.cloud[0]).slice(offset,view.end):[],cloudB=config.cloud?average(all,config.cloud[1]).slice(offset,view.end):[];
 const values=bb.concat(future,showOriginal?upper.slice(offset,view.end):[],showRefs?references.map(r=>r.candle.close):[]).filter(v=>v!==null).concat(rows.flatMap(c=>[c.low,c.high]).concat(avgs.flat().filter(v=>v!==null),cloudA.filter(v=>v!==null),cloudB.filter(v=>v!==null)));const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.04,1);
 const y=v=>30+(hi+pad-v)/(hi-lo+2*pad)*490,step=1140/(rows.length+futureCount),x=i=>25+(i+.5)*step;
 let svg='';for(let i=0;i<=5;i++){const v=lo+(hi-lo)*i/5;svg+=`<line x1="25" y1="${y(v)}" x2="1170" y2="${y(v)}" stroke="${grid}"/><text x="1180" y="${y(v)+4}" fill="${text}" font-size="12">${Math.round(v).toLocaleString()}</text>`;}
 // Split each cloud segment at its exact crossing so no polygon straddles the two regimes.
 const a=cloudA,b=cloudB;let cloudCount=0;
 function cloud(x1,a1,b1,x2,a2,b2,positive){svg+=`<polygon class="ma-cloud" points="${x1},${y(a1)} ${x2},${y(a2)} ${x2},${y(b2)} ${x1},${y(b1)}" fill="${positive?palette[0]:palette[1]}" opacity="${isLight?.30:.65}"/>`;cloudCount++;}
 for(let i=1;config.cloud&&i<rows.length;i++){if([a[i-1],a[i],b[i-1],b[i]].some(v=>v===null))continue;const d0=a[i-1]-b[i-1],d1=a[i]-b[i];if(d0*d1<0){const t=d0/(d0-d1),xx=x(i-1)+step*t,mid=a[i-1]+(a[i]-a[i-1])*t;cloud(x(i-1),a[i-1],b[i-1],xx,mid,mid,d0>=0);cloud(xx,mid,mid,x(i),a[i],b[i],d1>=0);}else cloud(x(i-1),a[i-1],b[i-1],x(i),a[i],b[i],d1>=0);}
 const maxVol=Math.max(...rows.map(c=>c.volume),1);rows.forEach((c,i)=>{const color=c.close>=c.open?(isLight?'#cd2746':'#ed6076'):(isLight?'#2563c4':'#6196ef'),w=step*.65;svg+=`<line x1="${x(i)}" y1="${y(c.high)}" x2="${x(i)}" y2="${y(c.low)}" stroke="${color}"/><rect class="candle" x="${x(i)-w/2}" y="${Math.min(y(c.open),y(c.close))}" width="${w}" height="${Math.max(1,Math.abs(y(c.open)-y(c.close)))}" fill="${color}"/>`;});
 avgs.forEach((arr,j)=>{const points=arr.flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]);if(points.length===1){const [cx,cy]=points[0].split(',');svg+=`<circle class="ma-point" data-period="${periods[j]}" cx="${cx}" cy="${cy}" r="3" fill="${colors[j%colors.length]}"/>`;}svg+=`<polyline class="ma" data-period="${periods[j]}" points="${points.join(' ')}" fill="none" stroke="${colors[j%colors.length]}" stroke-width="${config.bold.includes(periods[j])?(barCycle==='day'&&periods[j]===20?2.4:3):1.3}"/>`;});
 const mint=isLight?'#087d79':'#a8f5e5';
 const shifted=bb.concat(future);const bbpoints=shifted.flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]);
 if(barCycle==='day')svg+=`<polyline class="bb-shift" points="${bbpoints.join(' ')}" fill="none" stroke="${mint}" stroke-width="2.4" stroke-dasharray="1 5" stroke-linecap="round"/>`;
 if(showOriginal)svg+=`<polyline class="bb-original" points="${upper.slice(offset,view.end).flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]).join(' ')}" fill="none" stroke="${colors[2]}" stroke-width="1" stroke-dasharray="3 4"/>`;
 if(showRefs)references.forEach((r,i)=>{svg+=`<line class="reference" x1="25" y1="${y(r.candle.close)}" x2="1170" y2="${y(r.candle.close)}" stroke="${colors[i]}" stroke-dasharray="5 5"/><text x="30" y="${y(r.candle.close)-5}" fill="${colors[i]}" font-size="11">수식${i+1}: ${r.candle.date} 종가 ${r.candle.close.toLocaleString()}</text>`;});
 if(futureCount)svg+=`<line x1="${x(rows.length-1)+step/2}" y1="25" x2="${x(rows.length-1)+step/2}" y2="550" stroke="${grid}" stroke-dasharray="4 5"/><text x="${x(rows.length)+4}" y="550" fill="${text}" font-size="10">${futureCount}봉 이동 표시 공간</text>`;
 svg+=`<text x="25" y="585" fill="${text}">${rows[0].date}</text><text x="${x(rows.length-1)-55}" y="585" fill="${text}">${rows.at(-1).date}</text>`;
 document.getElementById('chart').innerHTML=svg;document.getElementById('legend').innerHTML=periods.map((n,i)=>`<span style="color:${colors[i%colors.length]};border-color:${colors[i%colors.length]}">${n}${config.unit}${avgs[i].every(v=>v===null)?' (이력 부족)':''}</span>`).join('')+(config.cloud?`<span>산·우물 구름 ${config.cloud.join('·')}${config.unit}</span>`:barCycle==='month'?'<span>피보나치 구름 · 기준 종가선 수식 확인 대기</span>':'')+(barCycle==='day'?`<span style="color:${mint};border-color:${mint}">BB ${bbSettings.period} / ${bbSettings.multiplier} → +${bbSettings.shift}봉</span>`:'');document.getElementById('period').textContent=`수신 기간 ${all[0].firstDate} ~ ${all.at(-1).date} · 일봉 ${dataset.candles.length}개 → ${config.label} ${all.length}개 · 모든 이동평균은 ${config.label} 종가 단순평균${barCycle==='year'?' · 첫 연봉은 수신 시작 이전 OHLC 미확인':barCycle!=='day'?' · 첫 집계봉은 이력 시작 전 자료 미확인으로 이평 계산에서 제외':''}${live?' · 가격 조정 기준 미확인'+(dataset.metadata.omittedRows?' · OHLC 미제공 '+dataset.metadata.omittedRows+'행 제외':'')+(dataset.metadata.normalizedBounds?' · OHLC 1원 이내 상하한 정규화 '+dataset.metadata.normalizedBounds+'행':''):''}${periods.some((_,i)=>avgs[i].every(v=>v===null))?' · 일부 이평선은 이력 부족':''}`;
 if(barCycle!=='year')renderPressure(all,isLight);else window.pressureEvidence=null;
 window.chartEvidence={stockCode:dataset.metadata.stockCode,sourceType:dataset.metadata.sourceType||'recorded',count:all.length,sourceCount:dataset.candles.length,displayed:rows.length,barCycle,indicatorCycle,viewRange,periods,cloudCount,cloudPeriods:config.cloud,cloudLast:config.cloud?[cloudA.at(-1),cloudB.at(-1)]:null,bbShift:shift,bbPeriod:barCycle==='day'?bbSettings.period:null,bbMultiplier:barCycle==='day'?bbSettings.multiplier:null,referenceBaseCount:referenceBase.length,references,lastAverages:avgs.map((a,i)=>({period:periods[i],value:a.at(-1)}))};window.renderDone=true;
 model={all,rows,offset,end:view.end,count:rows.length,x,y,step,futureCount,periods:[...periods],averages:avgs,config,stockCode:dataset.metadata.stockCode,name:dataset.metadata.name,priceForY:v=>hi+pad-(v-30)*(hi-lo+2*pad)/490};
}
// Independent OHLCV estimate, not the encrypted HTS indicator or actual trade-side volume.
function estimatePressure(all){return all.map((c,i)=>{const prior=all.slice(Math.max(0,i-20),i);const baseline=prior.length===20?prior.reduce((s,r)=>s+r.volume,0)/20:null;const location=c.high===c.low?0:Math.max(-1,Math.min(1,(2*c.close-c.high-c.low)/(c.high-c.low)));return {date:c.date,volume:c.volume,baseline,aboveAverage:baseline===null?null:c.volume>=baseline,location,pressure:location*c.volume};});}
function renderPressure(all,isLight){
 const rows=(pressureCache??=estimatePressure(all)).slice(offset,view.end),step=1140/(rows.length+futureCount),x=i=>25+(i+.5)*step,max=Math.max(1,...rows.map(r=>r.volume));
 const svgEl=document.getElementById('pressureChart'),scale=Math.max(.1,svgEl.clientWidth/(mode==='compact'?1155:1280)),width=Math.min(step*.65,24/scale),baseline=72,top=mode==='compact'?6:24,available=baseline-top;
 svgEl.setAttribute('viewBox',mode==='compact'?'15 0 1155 80':'0 0 1280 80');svgEl.setAttribute('preserveAspectRatio','none');
 const muted=isLight?'#526079':'#b8c2d2',red=isLight?'#c9263c':'#ff3030',cyan=isLight?'#087da0':'#46def5',yellow=isLight?'#9d7900':'#fff34a';
 let svg=mode==='compact'?'':`<text x="25" y="16" fill="${muted}" font-size="12">거래량·매매세 · 빨강/하늘: 거래량 · 노랑/검정: 추정 매수/매도 압력</text>`;
 svg+=`<line x1="25" y1="${baseline}" x2="1170" y2="${baseline}" stroke="${muted}" opacity=".4"/>`;
 rows.forEach((r,i)=>{const h=r.volume/max*available,p=Math.min(h,Math.abs(r.pressure)/max*available);svg+=`<rect class="pressure-volume" data-volume="${r.volume}" x="${x(i)-width/2}" y="${baseline-h}" width="${width}" height="${h}" fill="${r.aboveAverage===null?muted:r.aboveAverage?red:cyan}"/><rect class="pressure-estimate" data-direction="${r.pressure>0?'buy':r.pressure<0?'sell':'neutral'}" x="${x(i)-width*.325}" y="${baseline-p}" width="${width*.65}" height="${p}" fill="${r.pressure>=0?yellow:'#080808'}" stroke="${isLight?'#ffffff':'#b8c2d2'}" stroke-width=".35" vector-effect="non-scaling-stroke"/>`;});
 svgEl.innerHTML=svg;window.pressureEvidence={count:rows.length,buy:rows.filter(r=>r.pressure>0).length,sell:rows.filter(r=>r.pressure<0).length,neutral:rows.filter(r=>r.pressure===0).length};
}
// Actual provider-reported net purchases; never infer personal purchases as a residual.
const investorGroups=[['foreign','외국인'],['institution','기관'],['individual','개인']];
function parseInvestorQuantity(value){
 if(typeof value==='number'&&Number.isSafeInteger(value))return value;
 if(typeof value!=='string'||!/^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value.trim()))throw Error('순매수 수량 누락 또는 형식 오류');
 const n=Number(value.trim().replaceAll(',',''));if(!Number.isSafeInteger(n))throw Error('순매수 수량 범위 오류');return n;
}
function normalizeInvestorRows(input){
 if(!Array.isArray(input)||!input.length)throw Error('투자자별 순매수 자료 없음');
 const seen=new Set();return input.map(row=>{const raw=row.bizdate;if(typeof raw!=='string'||!/^\d{8}$/.test(raw))throw Error('수급 날짜 오류');const date=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6)}`;if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||seen.has(date))throw Error('수급 날짜 중복 또는 오류');seen.add(date);return {date,foreign:parseInvestorQuantity(row.foreignerPureBuyQuant),institution:parseInvestorQuantity(row.organPureBuyQuant),individual:parseInvestorQuantity(row.individualPureBuyQuant)};}).sort((a,b)=>a.date.localeCompare(b.date));
}
function cumulativeInvestors(rows){const sums={foreign:0,institution:0,individual:0};return rows.map(row=>{const cumulative={};for(const [key] of investorGroups)cumulative[key]=sums[key]+=row[key];return {...row,cumulative};});}
let investorSnapshot=dataset.investors,investorFailure='';
function renderInvestorPanel(){
 const chart=document.getElementById('investorChart'),info=document.getElementById('investorInfo'),table=document.getElementById('investorTable');
 if(!investorSnapshot){chart.replaceChildren();info.textContent=investorFailure||'이 종목의 투자자별 순매수 자료는 연결되지 않았습니다.';table.replaceChildren();return;}
 const isLight=document.body.classList.contains('light'),text=isLight?'#334155':'#c6cfdd',grid=isLight?'#ccd5e1':'#344053',colors=isLight?['#b52964','#957100','#243e89']:['#ff94c4','#fff16c','#3e5eb8'];
 const rows=cumulativeInvestors(normalizeInvestorRows(investorSnapshot.rows));const values=[0,...rows.flatMap(r=>investorGroups.map(([k])=>r.cumulative[k]))],lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||1,scale=v=>65+(hi-v)/span*180;const x=i=>65+(i+1)*(1040/(rows.length+1));
 let svg='';for(let i=0;i<=4;i++){const v=lo+span*i/4;svg+=`<line x1="65" y1="${scale(v)}" x2="1130" y2="${scale(v)}" stroke="${grid}"/><text x="1140" y="${scale(v)+4}" fill="${text}" font-size="12">${(v/10000).toFixed(1)}만 주</text>`;}
 svg+=`<line x1="65" y1="${scale(0)}" x2="1130" y2="${scale(0)}" stroke="${text}" opacity=".6" stroke-dasharray="4 4"/><text x="45" y="270" fill="${text}" font-size="11">시작 전 0</text>`;
 investorGroups.forEach(([k,name],j)=>{const points=[`65,${scale(0)}`,...rows.map((r,i)=>`${x(i)},${scale(r.cumulative[k])}`)];svg+=`<text x="${65+j*300}" y="28" fill="${colors[j]}" font-size="14">${name} ${rows.at(-1).cumulative[k].toLocaleString()}주</text><polyline class="investor-line" data-group="${k}" points="${points.join(' ')}" fill="none" stroke="${colors[j%colors.length]}" stroke-width="2"/>`;rows.forEach((r,i)=>{svg+=`<circle class="investor-point" cx="${x(i)}" cy="${scale(r.cumulative[k])}" r="3.5" fill="${colors[j]}"><title>${r.date} ${name} 일별 ${r[k].toLocaleString()}주 / 누적 ${r.cumulative[k].toLocaleString()}주</title></circle>`;});});
 rows.forEach((r,i)=>svg+=`<text x="${x(i)-35}" y="270" fill="${text}" font-size="11">${r.date}</text>`);chart.innerHTML=svg;
 info.textContent=`${rows[0].date} ~ ${rows.at(-1).date} · 실제 수신 ${rows.length}거래일 확대 · 첫날 직전 0 기준 · 보유량/보유율 아님 · 오늘 자료나 없는 날짜를 0으로 채우지 않음`;
 table.innerHTML='<thead><tr><th>날짜</th><th>외국인 순매수(주)</th><th>기관 순매수(주)</th><th>개인 순매수(주)</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${r.date}</td>${investorGroups.map(([k])=>`<td>${r[k].toLocaleString()}</td>`).join('')}</tr>`).join('')+'</tbody>';
 window.investorEvidence={dates:rows.map(r=>r.date),count:rows.length,totals:rows.at(-1).cumulative,source:investorSnapshot.source};
}

 // Compress indicator coordinates, keeping label font sizes readable and candles unchanged.
 function fitIndicator(id,top,bottom,height){
  const svg=document.getElementById(id),ratio=(height-20)/(bottom-top);
  svg.setAttribute('viewBox',`0 0 1280 ${height}`);
  svg.setAttribute('preserveAspectRatio','none');
  for(const el of svg.querySelectorAll('*')){
   const ys=['y','y1','y2','cy'].filter(a=>el.hasAttribute(a)).map(a=>Number(el.getAttribute(a)));
   if(el.hasAttribute('points'))ys.push(...el.getAttribute('points').split(/\s+/).map(p=>Number(p.split(',')[1])));
   if(ys.length && (Math.max(...ys)<top || Math.min(...ys)>bottom)){el.remove();continue;}

   for(const attr of ['y','y1','y2','cy'])if(el.hasAttribute(attr))el.setAttribute(attr,10+(Number(el.getAttribute(attr))-top)*ratio);
   if(el.hasAttribute('height'))el.setAttribute('height',Number(el.getAttribute('height'))*ratio);
   if(el.hasAttribute('points'))el.setAttribute('points',el.getAttribute('points').split(/\s+/).map(point=>{const [x,y]=point.split(',');return `${x},${10+(Number(y)-top)*ratio}`;}).join(' '));
  }
 }
 function draw(){render(all);if(barCycle!=='year')renderInvestorPanel();
 if(mode!=='compact'&&barCycle!=='year')fitIndicator('investorChart',0,290,84);
 host.chartEvidence={...window.chartEvidence,pressure:window.pressureEvidence,investors:window.investorEvidence};host.dispatchEvent(new root.CustomEvent('stockbook:chart-render'));}
 draw();for(const id of ['refs','original'])document.getElementById(id).onchange=draw;
 return {getModel:()=>model,refresh:draw,updateTheme:value=>{lightMode=value;draw();},
 setView:(count,end=view.end)=>{view.count=Math.max(1,Math.min(all.length,Math.round(count)));view.end=Math.max(view.count,Math.min(all.length,Math.round(end)));draw();},resetView:()=>{view.count=all.length-initialOffset;view.end=all.length;draw();},
 setSettings:values=>{const next=series.indicatorSettings(barCycle,values);periods=next.periods;config.cloud=next.cloud;bbSettings=next.bb;futureCount=barCycle==='day'?bbSettings.shift:0;draw();}};
}
root.StockBookChartRenderer=Object.freeze({mount});
})(window);
