/* Adapted from chart-proof commit 6d143e4. Recorded data, not a live price source.
 * The original SMA/BB, pressure and investor calculations are kept in this scoped renderer. */
(function(root){
'use strict';
function mount(host,dataset,{mode='detail',period='6m',light:lightMode=false}={}){
 const visibleCount=({'1m':22,'3m':66,'6m':132,'1y':260})[period]||132;
 const window={};
 const document={getElementById:id=>host.querySelector('[data-chart-id="'+id+'"]'),body:{classList:{contains:()=>lightMode}}};
 host.className='sb-proof-chart '+(mode==='compact'?'sb-proof-compact':'sb-proof-detail');
 host.innerHTML=`<div data-chart-id="notice" class="sb-chart-notice"></div>
 <div class="sb-proof-options"><label><input type="checkbox" data-chart-id="refs">기준선 비교</label><label><input type="checkbox" data-chart-id="original">이동 전 BB 비교</label></div>
 <div data-chart-id="legend" class="sb-proof-legend"></div>
 <svg data-chart-id="chart" viewBox="0 0 1280 600" role="img" aria-label="보존 일봉 가격 차트"></svg>
 <svg data-chart-id="pressureChart" viewBox="0 0 1280 210" role="img" aria-label="거래량과 추정 매매 압력"></svg>
 <div class="sb-proof-extended"><details class="sb-proof-money"><summary>거래대금 · 실제 금액 미수신</summary><p>날짜별 실제 거래대금 자료가 없어 막대를 표시하지 않습니다.</p></details>
 <details open data-chart-id="adPanel"><summary>A/D 추정선 · 실제 보유량 아님</summary><svg data-chart-id="adChart" viewBox="0 375 1280 215" role="img" aria-label="누적 매매 압력 추정"></svg></details>
 <details open data-chart-id="investorPanel"><summary>투자자별 순매수 · 별도 5거래일 축</summary><svg data-chart-id="investorChart" viewBox="0 0 1280 290" role="img" aria-label="보존 투자자별 누적 순매수"></svg><details><summary>일별 수량·자료 안내</summary><p data-chart-id="investorInfo"></p><table data-chart-id="investorTable"></table></details></details></div>
 <div data-chart-id="period" class="sb-chart-notice"></div>`;
 if(mode==='compact'){
   document.getElementById('chart').setAttribute('viewBox','15 20 1155 515');
   document.getElementById('chart').setAttribute('preserveAspectRatio','none');
   document.getElementById('pressureChart').setAttribute('viewBox','15 30 1155 165');
   document.getElementById('pressureChart').setAttribute('preserveAspectRatio','none');
 }
 document.getElementById('notice').textContent=dataset.metadata.name+' · '+dataset.metadata.snapshotDate+' 보존 자료 · 자동 갱신 아님 · 마지막 일봉 미완성';
const periods=mode==='compact'?[5,10,20,60]:[5,10,20,60,120,200,350,480];
const dark=['#f8b4cf','#87cefa','#ffe34d','#48bc70','#9ca3af','#ff2929','#b98b48','#b48af0'];
const light=['#b52664','#1177ad','#9b7300','#168542','#666c76','#c91c28','#8d5c1f','#763cb5'];
function average(all,n){return all.map((_,i)=>i<n-1?null:all.slice(i-n+1,i+1).reduce((s,c)=>s+c.close,0)/n);}
function bbUpper(all,n=40,m=1.9){return all.map((_,i)=>{if(i<n-1)return null;const a=all.slice(i-n+1,i+1).map(c=>c.close),mean=a.reduce((s,v)=>s+v,0)/n;return mean+m*Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/n);});}
function render(all){
 const isLight=document.body.classList.contains('light'),colors=isLight?light:dark,grid=isLight?'#dfe5ee':'#2b3547',text=isLight?'#526079':'#a4adbd';
 const offset=Math.max(0,all.length-visibleCount),rows=all.slice(offset),avgs=periods.map(n=>average(all,n).slice(offset));
 const upper=bbUpper(all),shift=25,bb=rows.map((_,i)=>upper[offset+i-shift]??null);
 const referenceBase=all.slice(-600),references=[60,20,5].map(n=>({n,candle:referenceBase[600-n-1]}));
 const showRefs=document.getElementById('refs').checked,showOriginal=document.getElementById('original').checked;
 const future=Array.from({length:25},(_,i)=>upper[all.length-25+i]);
 const values=bb.concat(future,showOriginal?upper.slice(offset):[],showRefs?references.map(r=>r.candle.close):[]).filter(v=>v!==null).concat(rows.flatMap(c=>[c.low,c.high]).concat(avgs.flat().filter(v=>v!==null)));const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.04,1);
 const y=v=>30+(hi+pad-v)/(hi-lo+2*pad)*490,step=1140/(rows.length+25),x=i=>25+(i+.5)*step;
 let svg='';for(let i=0;i<=5;i++){const v=lo+(hi-lo)*i/5;svg+=`<line x1="25" y1="${y(v)}" x2="1170" y2="${y(v)}" stroke="${grid}"/><text x="1180" y="${y(v)+4}" fill="${text}" font-size="12">${Math.round(v).toLocaleString()}</text>`;}
 // Split each cloud segment at its exact crossing so no polygon straddles the two regimes.
 const a=avgs[0],b=avgs[1];let cloudCount=0;
 function cloud(x1,a1,b1,x2,a2,b2,positive){svg+=`<polygon class="ma-cloud" points="${x1},${y(a1)} ${x2},${y(a2)} ${x2},${y(b2)} ${x1},${y(b1)}" fill="${positive?colors[0]:colors[1]}" opacity="${isLight?.30:.65}"/>`;cloudCount++;}
 for(let i=1;i<rows.length;i++){if([a[i-1],a[i],b[i-1],b[i]].some(v=>v===null))continue;const d0=a[i-1]-b[i-1],d1=a[i]-b[i];if(d0*d1<0){const t=d0/(d0-d1),xx=x(i-1)+step*t,mid=a[i-1]+(a[i]-a[i-1])*t;cloud(x(i-1),a[i-1],b[i-1],xx,mid,mid,d0>=0);cloud(xx,mid,mid,x(i),a[i],b[i],d1>=0);}else cloud(x(i-1),a[i-1],b[i-1],x(i),a[i],b[i],d1>=0);}
 const maxVol=Math.max(...rows.map(c=>c.volume),1);rows.forEach((c,i)=>{const color=c.close>=c.open?(isLight?'#cd2746':'#ed6076'):(isLight?'#2563c4':'#6196ef'),w=step*.65;svg+=`<line x1="${x(i)}" y1="${y(c.high)}" x2="${x(i)}" y2="${y(c.low)}" stroke="${color}"/><rect class="candle" x="${x(i)-w/2}" y="${Math.min(y(c.open),y(c.close))}" width="${w}" height="${Math.max(1,Math.abs(y(c.open)-y(c.close)))}" fill="${color}"/>`;});
 avgs.forEach((arr,j)=>{const points=arr.flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]);svg+=`<polyline class="ma" data-period="${periods[j]}" points="${points.join(' ')}" fill="none" stroke="${colors[j]}" stroke-width="${periods[j]===200?3:periods[j]===20?2.4:1.3}"/>`;});
 const mint=isLight?'#087d79':'#a8f5e5';
 const shifted=bb.concat(future);const bbpoints=shifted.flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]);
 svg+=`<polyline class="bb-shift" points="${bbpoints.join(' ')}" fill="none" stroke="${mint}" stroke-width="2.4" stroke-dasharray="1 5" stroke-linecap="round"/>`;
 if(showOriginal)svg+=`<polyline class="bb-original" points="${upper.slice(offset).flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]).join(' ')}" fill="none" stroke="${colors[2]}" stroke-width="1" stroke-dasharray="3 4"/>`;
 if(showRefs)references.forEach((r,i)=>{svg+=`<line class="reference" x1="25" y1="${y(r.candle.close)}" x2="1170" y2="${y(r.candle.close)}" stroke="${colors[i]}" stroke-dasharray="5 5"/><text x="30" y="${y(r.candle.close)-5}" fill="${colors[i]}" font-size="11">수식${i+1}: ${r.candle.date} 종가 ${r.candle.close.toLocaleString()}</text>`;});
 svg+=`<line x1="${x(rows.length-1)+step/2}" y1="25" x2="${x(rows.length-1)+step/2}" y2="550" stroke="${grid}" stroke-dasharray="4 5"/><text x="${x(rows.length)+4}" y="550" fill="${text}" font-size="10">미래 25봉 표시 공간</text>`;
 svg+=`<text x="25" y="585" fill="${text}">${rows[0].date}</text><text x="${x(rows.length-1)-55}" y="585" fill="${text}">${rows.at(-1).date}</text>`;
 document.getElementById('chart').innerHTML=svg;document.getElementById('legend').innerHTML=periods.map((n,i)=>`<span style="color:${colors[i]};border-color:${colors[i]}">${n}일</span>`).join('')+`<span style="color:${mint};border-color:${mint}">BB 40 / 1.9 → +25봉</span>`;document.getElementById('period').textContent=`수신 기간 ${all[0].date} ~ ${all.at(-1).date} · ${all.length}봉 · 모든 이동평균은 종가 단순평균`;
 renderPressure(all,isLight);
 window.chartEvidence={count:all.length,displayed:rows.length,periods,cloudCount,bbShift:shift,bbPeriod:40,bbMultiplier:1.9,referenceBaseCount:referenceBase.length,references,lastAverages:avgs.map((a,i)=>({period:periods[i],value:a.at(-1)}))};window.renderDone=true;
}
// Independent OHLCV estimate, not the encrypted HTS indicator or actual trade-side volume.
function estimatePressure(all){return all.map((c,i)=>{const prior=all.slice(Math.max(0,i-20),i);const baseline=prior.length===20?prior.reduce((s,r)=>s+r.volume,0)/20:null;const location=c.high===c.low?0:Math.max(-1,Math.min(1,(2*c.close-c.high-c.low)/(c.high-c.low)));return {date:c.date,volume:c.volume,baseline,aboveAverage:baseline===null?null:c.volume>=baseline,location,pressure:location*c.volume};});}
function cumulativePressure(all){let total=0;return estimatePressure(all).map(r=>({...r,cumulative:total+=r.pressure}));}
function renderPressure(all,isLight){
 const rows=estimatePressure(all).slice(-visibleCount),step=1140/(rows.length+25),x=i=>25+(i+.5)*step,max=Math.max(1,...rows.map(r=>r.volume));
 const muted=isLight?'#526079':'#b8c2d2',red=isLight?'#c9263c':'#ff3030',cyan=isLight?'#087da0':'#46def5',yellow=isLight?'#9d7900':'#fff34a';
 let svg=`<text x="25" y="20" fill="${muted}" font-size="13">거래량·매매세 · 바깥 빨강/하늘색: 거래량 · 안쪽 노랑/검정: 추정 매수/매도 압력</text><line x1="25" y1="185" x2="1170" y2="185" stroke="${muted}" opacity=".4"/><line x1="0" y1="210" x2="1280" y2="210" stroke="${muted}" opacity=".3"/><text x="25" y="235" fill="${muted}" font-size="13">거래대금 구간 · 실제 금액 미수신</text>`;
 rows.forEach((r,i)=>{const w=step*.88,h=r.volume/max*150,p=r.pressure/max*150;svg+=`<rect class="pressure-volume" x="${x(i)-w/2}" y="${185-h}" width="${w}" height="${h}" fill="${r.aboveAverage===null?muted:r.aboveAverage?red:cyan}"/><rect class="pressure-estimate" data-direction="${p>0?'buy':p<0?'sell':'neutral'}" x="${x(i)-w*.30}" y="${185-Math.abs(p)}" width="${w*.60}" height="${Math.abs(p)}" fill="${p>=0?yellow:'#080808'}" stroke="${isLight?'#ffffff':'#b8c2d2'}" stroke-width=".35"/>`;});
 const labels=['300억↑','500억↑','1000억↑','3000억↑','5000억↑','1조↑'];
 const moneyColors=isLight?['#174ed6','#467c00','#b15b00','#cf253c','#8055b4','#283447']:['#346dff','#a8ee49','#ff9a34','#ff354f','#d2afff','#ffffff'];
 labels.forEach((t,i)=>{svg+=`<text x="${25+i*130}" y="260" fill="${moneyColors[i]}" font-size="12">${t}</text>`;});
 svg+=`<text x="25" y="305" fill="${muted}" font-size="13">날짜별 실제 거래대금 미수신 · 막대 표시 보류 · 종가×거래량으로 대체하지 않음</text><text x="25" y="360" fill="${muted}" font-size="11">${rows[0].date}</text><text x="${x(rows.length-1)-55}" y="360" fill="${muted}" font-size="11">${rows.at(-1).date}</text>`;
 const accumulated=cumulativePressure(all),visible=accumulated.slice(-visibleCount),vals=visible.map(r=>r.cumulative),low=Math.min(...vals),high=Math.max(...vals),span=high-low||1,yy=v=>415+(high-v)/span*130;
 svg+=`<line x1="0" y1="375" x2="1280" y2="375" stroke="${muted}" opacity=".3"/><text x="25" y="398" fill="${muted}" font-size="13">매집·분산 추정선(A/D) · 실제 세력 보유량 아님</text>`;
 for(let i=0;i<3;i++){const v=low+span*i/2;svg+=`<line x1="25" y1="${yy(v)}" x2="1170" y2="${yy(v)}" stroke="${muted}" opacity=".17"/><text x="1180" y="${yy(v)+4}" fill="${muted}" font-size="10">${(v/1e6).toFixed(1)}M</text>`;}
 svg+=`<polyline class="accumulation-line" points="${visible.map((r,i)=>`${x(i)},${yy(r.cumulative)}`).join(' ')}" fill="none" stroke="${yellow}" stroke-width="1.7"/><text x="25" y="570" fill="${muted}" font-size="11">${visible[0].date}</text><text x="${x(visible.length-1)-55}" y="570" fill="${muted}" font-size="11">${visible.at(-1).date}</text>`;
 window.accumulationEvidence={sourceCount:accumulated.length,displayed:visible.length,start:accumulated[0].date,last:visible.at(-1).cumulative,min:low,max:high};
 document.getElementById('pressureChart').innerHTML=svg;window.pressureEvidence={count:rows.length,buy:rows.filter(r=>r.pressure>0).length,sell:rows.filter(r=>r.pressure<0).length,neutral:rows.filter(r=>r.pressure===0).length};
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
 if(!investorSnapshot){chart.replaceChildren();info.textContent=investorFailure||'수급 스냅샷을 불러오는 중…';table.replaceChildren();return;}
 const isLight=document.body.classList.contains('light'),text=isLight?'#334155':'#c6cfdd',grid=isLight?'#ccd5e1':'#344053',colors=isLight?['#b52964','#957100','#243e89']:['#ff94c4','#fff16c','#3e5eb8'];
 const rows=cumulativeInvestors(normalizeInvestorRows(investorSnapshot.rows));const values=[0,...rows.flatMap(r=>investorGroups.map(([k])=>r.cumulative[k]))],lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||1,scale=v=>65+(hi-v)/span*180;const x=i=>65+(i+1)*(1040/(rows.length+1));
 let svg='';for(let i=0;i<=4;i++){const v=lo+span*i/4;svg+=`<line x1="65" y1="${scale(v)}" x2="1130" y2="${scale(v)}" stroke="${grid}"/><text x="1140" y="${scale(v)+4}" fill="${text}" font-size="12">${(v/10000).toFixed(1)}만 주</text>`;}
 svg+=`<line x1="65" y1="${scale(0)}" x2="1130" y2="${scale(0)}" stroke="${text}" opacity=".6" stroke-dasharray="4 4"/><text x="45" y="270" fill="${text}" font-size="11">시작 전 0</text>`;
 investorGroups.forEach(([k,name],j)=>{const points=[`65,${scale(0)}`,...rows.map((r,i)=>`${x(i)},${scale(r.cumulative[k])}`)];svg+=`<text x="${65+j*300}" y="28" fill="${colors[j]}" font-size="14">${name} ${rows.at(-1).cumulative[k].toLocaleString()}주</text><polyline class="investor-line" data-group="${k}" points="${points.join(' ')}" fill="none" stroke="${colors[j]}" stroke-width="2"/>`;rows.forEach((r,i)=>{svg+=`<circle class="investor-point" cx="${x(i)}" cy="${scale(r.cumulative[k])}" r="3.5" fill="${colors[j]}"><title>${r.date} ${name} 일별 ${r[k].toLocaleString()}주 / 누적 ${r.cumulative[k].toLocaleString()}주</title></circle>`;});});
 rows.forEach((r,i)=>svg+=`<text x="${x(i)-35}" y="270" fill="${text}" font-size="11">${r.date}</text>`);chart.innerHTML=svg;
 info.textContent=`${rows[0].date} ~ ${rows.at(-1).date} · 실제 수신 ${rows.length}거래일 확대 · 첫날 직전 0 기준 · 보유량/보유율 아님 · 오늘 자료나 없는 날짜를 0으로 채우지 않음`;
 table.innerHTML='<thead><tr><th>날짜</th><th>외국인 순매수(주)</th><th>기관 순매수(주)</th><th>개인 순매수(주)</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${r.date}</td>${investorGroups.map(([k])=>`<td>${r[k].toLocaleString()}</td>`).join('')}</tr>`).join('')+'</tbody>';
 window.investorEvidence={dates:rows.map(r=>r.date),count:rows.length,totals:rows.at(-1).cumulative,source:investorSnapshot.source};
}

 const all=dataset.candles;
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
 function draw(){render(all);renderInvestorPanel();document.getElementById('adChart').innerHTML=document.getElementById('pressureChart').innerHTML;
 if(mode!=='compact'){fitIndicator('pressureChart',0,210,56);fitIndicator('adChart',410,590,60);fitIndicator('investorChart',0,290,84);}
 host.chartEvidence={...window.chartEvidence,pressure:window.pressureEvidence,accumulation:window.accumulationEvidence,investors:window.investorEvidence};}
 draw();for(const id of ['refs','original'])document.getElementById(id).onchange=draw;
 return {updateTheme:value=>{lightMode=value;draw();}};
}
root.StockBookChartRenderer=Object.freeze({mount});
})(window);
