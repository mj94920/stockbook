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
 const view={count:visibleCount,end:all.length,position:1};let model=null,bbSettings={period:40,multiplier:1.9,shift:25},tradingAmounts=all.map(()=>null),tradingInfo=null,tradingStatus='KIS 연결이 필요한 실제 거래대금입니다.',moneyOpened=false;
 const window={};
 const document={getElementById:id=>host.querySelector('[data-chart-id="'+id+'"]'),body:{classList:{contains:()=>lightMode}}};
 host.className='sb-proof-chart '+(mode==='compact'?'sb-proof-compact':'sb-proof-detail');
 host.innerHTML=`<div data-chart-id="notice" class="sb-chart-notice"></div>
 <div class="sb-proof-options"><label><input type="checkbox" data-chart-id="refs">기준선 비교</label><label><input type="checkbox" data-chart-id="original">이동 전 BB 비교</label></div>
 <div data-chart-id="legend" class="sb-proof-legend"></div>
 <svg data-chart-id="chart" viewBox="0 0 1280 600" role="img" aria-label="${dataset.metadata.sourceType==='naver-daily'?'조회':'보존'} ${config.label} 가격 차트"></svg>
 <svg data-chart-id="pressureChart" viewBox="0 0 1280 210" role="img" aria-label="거래량과 추정 매매 압력"></svg>
 <details class="sb-proof-money" data-chart-id="moneyPanel"><summary data-chart-id="moneySummary">거래대금 · 실제 금액 미수신</summary><p data-chart-id="moneyStatus"></p><button type="button" class="sb-btn sb-btn--sm" data-chart-id="moneyRetry">거래대금 다시 조회</button><div class="sb-money-legend" data-chart-id="moneyLegend"></div><svg data-chart-id="moneyChart" role="img" aria-label="실제 거래대금 기준 거래량" viewBox="0 0 1280 100"></svg></details>
 <div class="sb-proof-extended">
 <details ${dataset.investors?'open':''} data-chart-id="investorPanel" class="sb-proof-investors"><summary data-chart-id="investorSummary">${dataset.investors?'투자자별 순매수 · 별도 5거래일 축':'투자자별 순매수 · 자료 없음'}</summary><div class="sb-investor-controls"><label>표시 <select class="sb-input" data-chart-id="investorMode" aria-label="수급 표시 방식"><option value="daily">일별 순매수</option><option value="cumulative">수신 자료 누적</option></select></label><button type="button" class="sb-btn sb-btn--sm" data-chart-id="investorRetry">수급 다시 조회</button></div><p data-chart-id="investorStatus"></p><div class="sb-investor-legend" data-chart-id="investorLegend"></div><svg data-chart-id="investorChart" viewBox="0 0 1280 200" role="img" aria-label="외국인 기관 개인 일별 순매수"></svg><details><summary>일별 수량·자료 안내</summary><p data-chart-id="investorInfo"></p><table data-chart-id="investorTable"></table></details></details></div>
 <div data-chart-id="period" class="sb-chart-notice"></div>`;
 document.getElementById('chart').setAttribute('preserveAspectRatio','none');
 if(mode==='compact'){
   document.getElementById('chart').setAttribute('viewBox','0 0 1280 600');
   document.getElementById('chart').setAttribute('preserveAspectRatio','none');
   document.getElementById('pressureChart').setAttribute('viewBox','15 30 1155 165');
   document.getElementById('pressureChart').setAttribute('preserveAspectRatio','none');
 }
 const live=dataset.metadata.sourceType==='naver-daily';
 document.getElementById('notice').textContent=live?dataset.metadata.name+' · 네이버 일봉 · 기준일 '+dataset.metadata.snapshotDate+' · 조회 '+new Date(dataset.metadata.fetchedAt).toLocaleString('ko-KR')+' · 자동 갱신 아님 · 마지막 봉 완성 여부 미확인':dataset.metadata.name+' · '+dataset.metadata.snapshotDate+' 보존 자료 · 자동 갱신 아님'+(all.at(-1).incompleteEnd?' · 마지막 '+config.label+' 미완성':'');
 const sourceNotice=document.getElementById('notice').textContent;
 if(barCycle!=='day')host.querySelector('.sb-proof-options').hidden=true;
 if(barCycle==='year'){host.classList.add('sb-proof-year');document.getElementById('pressureChart').setAttribute('hidden','');host.querySelector('.sb-proof-extended').hidden=true;}
let periods=mode==='compact'&&barCycle==='day'?[5,10,20,60]:config.periods;
const dark=['#f8b4cf','#87cefa','#ffe34d','#48bc70','#9ca3af','#ff2929','#b98b48','#b48af0'];
const light=['#b52664','#1177ad','#9b7300','#168542','#666c76','#c91c28','#8d5c1f','#763cb5'];
const averageCache=new Map(),bbCache=new Map();let pressureCache=null;let hiddenIndicators=new Set(),chartType='candle',horizontal=null;const profileCache=new Map();
function average(all,n){if(!averageCache.has(n)){averageCache.set(n,series.average(all,n,{includePartialStart:barCycle==='year'}));while(averageCache.size>32)averageCache.delete(averageCache.keys().next().value);}return averageCache.get(n);}
function bbUpper(all,n=40,m=1.9){const key=n+':'+m;if(bbCache.has(key))return bbCache.get(key);const result=all.map((_,i)=>{if(i<n-1)return null;const a=all.slice(i-n+1,i+1).map(c=>c.close),mean=a.reduce((s,v)=>s+v,0)/n;return mean+m*Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/n);});bbCache.set(key,result);while(bbCache.size>8)bbCache.delete(bbCache.keys().next().value);return result;}
function render(all){
 const typeNotes={candle:'',hollow:' · 빈 캔들: 양봉·음봉 모두 비움',volume:' · 볼륨캔들: 거래량 비례 너비·최소 폭 적용',profile:' · 매물대 추정: 표시 범위 일봉 고저 구간에 거래량 균등 배분·12구간'};document.getElementById('notice').textContent=sourceNotice+typeNotes[chartType];
 const isLight=document.body.classList.contains('light'),palette=isLight?light:dark,colors=config.colors.map(i=>palette[i]),grid=isLight?'#dfe5ee':'#2b3547',text=isLight?'#526079':'#a4adbd';
 futureCount=barCycle==='day'&&!hiddenIndicators.has('bb')?bbSettings.shift:0;
 offset=Math.max(0,view.end-view.count);visibleCount=view.end-offset;
 const rows=all.slice(offset,view.end),avgs=periods.map(n=>average(all,n).slice(offset,view.end));
 const upper=barCycle==='day'&&!hiddenIndicators.has('bb')?bbUpper(all,bbSettings.period,bbSettings.multiplier):[],shift=futureCount,bb=barCycle==='day'&&!hiddenIndicators.has('bb')?rows.map((_,i)=>upper[offset+i-shift]??null):[];
 const referenceBase=all.slice(-600),references=barCycle==='day'?[60,20,5].map(n=>({n,candle:referenceBase[600-n-1]})).filter(r=>r.candle):[];
 const showRefs=barCycle==='day'&&document.getElementById('refs').checked,showOriginal=barCycle==='day'&&!hiddenIndicators.has('bb')&&document.getElementById('original').checked;
 const future=Array.from({length:futureCount},(_,i)=>upper[view.end-futureCount+i]??null);
 const cloudA=config.cloud&&!hiddenIndicators.has('cloud')?average(all,config.cloud[0]).slice(offset,view.end):[],cloudB=config.cloud&&!hiddenIndicators.has('cloud')?average(all,config.cloud[1]).slice(offset,view.end):[];
 const values=bb.concat(future,showOriginal?upper.slice(offset,view.end):[],showRefs?references.map(r=>r.candle.close):[]).filter(v=>v!==null).concat(rows.flatMap(c=>[c.low,c.high]).concat(avgs.filter((_,i)=>!hiddenIndicators.has('ma:'+periods[i])).flat().filter(v=>v!==null),cloudA.filter(v=>v!==null),cloudB.filter(v=>v!==null)));const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.04,1);
 const y=v=>30+(hi+pad-v)/(hi-lo+2*pad)*490;horizontal=series.barLayout(rows,futureCount,chartType==='volume');const {x,step,indexForX}=horizontal;
 let svg='';for(let i=0;i<=5;i++){const v=lo+(hi-lo)*i/5;svg+=`<line x1="25" y1="${y(v)}" x2="1170" y2="${y(v)}" stroke="${grid}"/><text x="1180" y="${y(v)+4}" fill="${text}" font-size="12">${Math.round(v).toLocaleString()}</text>`;}
 let profile=null;
 if(chartType==='profile'&&!hiddenIndicators.has('profile')){
  const first=rows[0].firstDate,last=rows.at(-1).date,key=first+':'+last;
  if(!profileCache.has(key)){profileCache.set(key,series.volumeProfile(dataset.candles.filter(c=>c.date>=first&&c.date<=last)));while(profileCache.size>16)profileCache.delete(profileCache.keys().next().value);}
  profile=profileCache.get(key);if(profile.total===0)document.getElementById('notice').textContent+=' · 표시 범위 거래량 없음';const max=Math.max(1,...profile.bins.map(bin=>bin.volume));
  for(const bin of profile.bins){if(bin.volume<=0)continue;const width=bin.volume/max*420,top=y(bin.high),height=Math.max(2,y(bin.low)-top),ratio=profile.total?bin.volume/profile.total*100:0;
   svg+=`<rect class="sb-chart-profile-bin" data-chart-indicator="profile" data-low="${bin.low}" data-high="${bin.high}" data-volume="${bin.volume}" x="25" y="${top}" width="${width}" height="${height}" fill="${text}" opacity=".18"/>`;
   if(mode==='detail'&&width>90&&height>=16)svg+=`<text class="sb-chart-profile-label" x="30" y="${top+Math.min(height-2,14)}" fill="${text}" font-size="11">${Math.round(bin.volume).toLocaleString()}주 (${ratio.toFixed(1)}%)</text>`;
  }
 }
 // Split each cloud segment at its exact crossing so no polygon straddles the two regimes.
 const a=cloudA,b=cloudB;let cloudCount=0;
 function cloud(x1,a1,b1,x2,a2,b2,positive){svg+=`<polygon class="ma-cloud" data-chart-indicator="cloud" points="${x1},${y(a1)} ${x2},${y(a2)} ${x2},${y(b2)} ${x1},${y(b1)}" fill="${positive?palette[0]:palette[1]}" opacity="${isLight?.30:.65}"/>`;cloudCount++;}
 for(let i=1;config.cloud&&!hiddenIndicators.has('cloud')&&i<rows.length;i++){if([a[i-1],a[i],b[i-1],b[i]].some(v=>v===null))continue;const d0=a[i-1]-b[i-1],d1=a[i]-b[i];if(d0*d1<0){const t=d0/(d0-d1),xx=x(i-1)+(x(i)-x(i-1))*t,mid=a[i-1]+(a[i]-a[i-1])*t;cloud(x(i-1),a[i-1],b[i-1],xx,mid,mid,d0>=0);cloud(xx,mid,mid,x(i),a[i],b[i],d1>=0);}else cloud(x(i-1),a[i-1],b[i-1],x(i),a[i],b[i],d1>=0);}
 rows.forEach((c,i)=>{
  const color=c.close>=c.open?(isLight?'#cd2746':'#ed6076'):(isLight?'#2563c4':'#6196ef'),w=horizontal.width(i)*.65,top=Math.max(c.open,c.close),bottom=Math.min(c.open,c.close);
  svg+=`<line x1="${x(i)}" y1="${y(c.high)}" x2="${x(i)}" y2="${y(top)}" stroke="${color}"/><line x1="${x(i)}" y1="${y(bottom)}" x2="${x(i)}" y2="${y(c.low)}" stroke="${color}"/><rect class="candle" x="${x(i)-w/2}" y="${y(top)}" width="${w}" height="${Math.max(1,Math.abs(y(c.open)-y(c.close)))}" fill="${chartType==='hollow'?'none':color}" stroke="${color}" vector-effect="non-scaling-stroke" data-date="${c.date}" data-volume="${c.volume}"/>`;
 });
 avgs.forEach((arr,j)=>{if(hiddenIndicators.has('ma:'+periods[j]))return;const points=arr.flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]);if(points.length===1){const [cx,cy]=points[0].split(',');svg+=`<circle class="ma-point" data-period="${periods[j]}" data-chart-indicator="ma:${periods[j]}" cx="${cx}" cy="${cy}" r="3" fill="${colors[j%colors.length]}"/>`;}svg+=`<polyline class="ma" data-period="${periods[j]}" data-chart-indicator="ma:${periods[j]}" points="${points.join(' ')}" fill="none" stroke="${colors[j%colors.length]}" stroke-width="${config.bold.includes(periods[j])?(barCycle==='day'&&periods[j]===20?2.4:3):1.3}"/>`;});
 const mint=isLight?'#087d79':'#a8f5e5';
 const shifted=bb.concat(future);const bbpoints=shifted.flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]);
 if(barCycle==='day'&&!hiddenIndicators.has('bb'))svg+=`<polyline class="bb-shift" data-chart-indicator="bb" points="${bbpoints.join(' ')}" fill="none" stroke="${mint}" stroke-width="2.4" stroke-dasharray="1 5" stroke-linecap="round"/>`;
 if(showOriginal)svg+=`<polyline class="bb-original" points="${upper.slice(offset,view.end).flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]).join(' ')}" fill="none" stroke="${colors[2]}" stroke-width="1" stroke-dasharray="3 4"/>`;
 if(showRefs)references.forEach((r,i)=>{svg+=`<line class="reference" x1="25" y1="${y(r.candle.close)}" x2="1170" y2="${y(r.candle.close)}" stroke="${colors[i]}" stroke-dasharray="5 5"/><text x="30" y="${y(r.candle.close)-5}" fill="${colors[i]}" font-size="11">수식${i+1}: ${r.candle.date} 종가 ${r.candle.close.toLocaleString()}</text>`;});
 if(futureCount)svg+=`<line x1="${x(rows.length-1)+step/2}" y1="25" x2="${x(rows.length-1)+step/2}" y2="550" stroke="${grid}" stroke-dasharray="4 5"/><text x="${x(rows.length)+4}" y="550" fill="${text}" font-size="10">${futureCount}봉 이동 표시 공간</text>`;
 svg+=`<text x="25" y="585" fill="${text}">${rows[0].date}</text><text x="${x(rows.length-1)-55}" y="585" fill="${text}">${rows.at(-1).date}</text>`;
 document.getElementById('chart').innerHTML=svg;document.getElementById('legend').innerHTML=periods.map((n,i)=>indicatorLabel('ma:'+n,n+config.unit+(avgs[i].every(v=>v===null)?' (이력 부족)':''),colors[i%colors.length])).join('')+(config.cloud?indicatorLabel('cloud','산·우물 구름 '+config.cloud.join('·')+config.unit):barCycle==='month'?'<span>피보나치 구름 · 기준 종가선 수식 확인 대기</span>':'')+(barCycle==='day'?indicatorLabel('bb','BB '+bbSettings.period+' / '+bbSettings.multiplier+' → +'+bbSettings.shift+'봉',mint):'')+(chartType==='profile'?indicatorLabel('profile','매물대 (추정)'):'')+(barCycle!=='year'?indicatorLabel('pressure','거래량·매매세')+(investorSnapshot?indicatorLabel('investors','투자자별 순매수'):''):'');document.getElementById('period').textContent=`수신 기간 ${all[0].firstDate} ~ ${all.at(-1).date} · 일봉 ${dataset.candles.length}개 → ${config.label} ${all.length}개 · 모든 이동평균은 ${config.label} 종가 단순평균${barCycle==='year'?' · 첫 연봉은 수신 시작 이전 OHLC 미확인':barCycle!=='day'?' · 첫 집계봉은 이력 시작 전 자료 미확인으로 이평 계산에서 제외':''}${live?' · 가격 조정 기준 미확인'+(dataset.metadata.omittedRows?' · OHLC 미제공 '+dataset.metadata.omittedRows+'행 제외':'')+(dataset.metadata.normalizedBounds?' · OHLC 1원 이내 상하한 정규화 '+dataset.metadata.normalizedBounds+'행':''):''}${periods.some((_,i)=>avgs[i].every(v=>v===null))?' · 일부 이평선은 이력 부족':''}`;
 if(barCycle!=='year')renderPressure(all,isLight);else window.pressureEvidence=null;
 renderTradingValues();
 window.chartEvidence={stockCode:dataset.metadata.stockCode,sourceType:dataset.metadata.sourceType||'recorded',count:all.length,sourceCount:dataset.candles.length,displayed:rows.length,barCycle,indicatorCycle,viewRange,periods,cloudCount,cloudPeriods:config.cloud,cloudLast:config.cloud?[cloudA.at(-1),cloudB.at(-1)]:null,bbShift:shift,bbPeriod:barCycle==='day'?bbSettings.period:null,bbMultiplier:barCycle==='day'?bbSettings.multiplier:null,referenceBaseCount:referenceBase.length,references,chartType,profile:profile?{method:'uniform-daily-range',totalVolume:profile.total,bins:profile.bins}:null,hiddenIndicators:[...hiddenIndicators],lastAverages:avgs.map((a,i)=>({period:periods[i],value:a.at(-1)}))};window.renderDone=true;
 model={all,rows,tradingAmounts:tradingAmounts.slice(offset,view.end),offset,end:view.end,count:rows.length,scrollPosition:view.position,x,y,step,indexForX,barWidth:horizontal.width,chartType,futureCount,periods:periods.filter(n=>!hiddenIndicators.has('ma:'+n)),averages:avgs.filter((_,i)=>!hiddenIndicators.has('ma:'+periods[i])),config,stockCode:dataset.metadata.stockCode,name:dataset.metadata.name,priceForY:v=>hi+pad-(v-30)*(hi-lo+2*pad)/490};
}
// Independent OHLCV estimate, not the encrypted HTS indicator or actual trade-side volume.
function renderTradingValues(){
 const panel=document.getElementById('moneyPanel'),summary=document.getElementById('moneySummary'),status=document.getElementById('moneyStatus'),svg=document.getElementById('moneyChart'),known=tradingAmounts.filter(value=>value!==null).length;
 panel.hidden=barCycle==='year'||hiddenIndicators.has('money')||(mode==='compact'&&!known);
 summary.textContent=known?(mode==='compact'?'거래대금 · KIS · 300억 이상':'거래대금 · KIS · 색상은 금액 / 막대 높이는 거래량'):'거래대금 · 실제 금액 미수신';summary.title=tradingStatus+' · 색상은 금액, 막대 높이는 거래량';status.textContent=tradingStatus;
 document.getElementById('moneyLegend').innerHTML=known?series.tradingValueThresholds.map(n=>`<span style="color:var(--sb-chart-money-${n})">${n===10000?'1조':n+'억'} 이상</span>`).join(''):'';
 const height=Math.max(32,svg.getBoundingClientRect().height||100),baseline=height-8,rows=all.slice(offset,view.end),max=Math.max(1,...rows.map(row=>row.volume));
 svg.setAttribute('viewBox','0 0 1280 '+height);svg.setAttribute('preserveAspectRatio','none');
 let markup=`<line x1="25" y1="${baseline}" x2="1170" y2="${baseline}" stroke="var(--sb-border)"/>`;
 const widthScale=Math.max(.1,svg.clientWidth/1280);
 for(let i=0;i<rows.length;i++){const value=tradingAmounts[offset+i],band=series.tradingValueBand(value);if(band===null)continue;const h=rows[i].volume/max*(height-16),width=Math.min(horizontal.width(i)*.72,24/widthScale);markup+=`<rect class="sb-money-bar" data-date="${rows[i].date}" data-amount="${value}" data-band="${band}" x="${horizontal.x(i)-width/2}" y="${baseline-h}" width="${width}" height="${h}" fill="var(--sb-chart-money-${band})" data-chart-indicator="money"/>`;}
 svg.innerHTML=markup;
 window.moneyEvidence={source:'KIS',market:'KRX',unit:'원',known,total:all.length,matched:tradingInfo?.matched||0,mismatched:tradingInfo?.mismatched||0,received:tradingInfo?.received||0,fetchedAt:tradingInfo?.fetchedAt||null};
}
// OHLCV-only estimate, not the encrypted HTS indicator or actual trade-side volume.
function estimatePressure(all){return all.map((c,i)=>{const prior=all.slice(Math.max(0,i-20),i);const baseline=prior.length===20?prior.reduce((s,r)=>s+r.volume,0)/20:null;const location=c.high===c.low?0:Math.max(-1,Math.min(1,(2*c.close-c.high-c.low)/(c.high-c.low)));return {date:c.date,volume:c.volume,baseline,aboveAverage:baseline===null?null:c.volume>=baseline,location,pressure:location*c.volume};});}
function renderPressure(all,isLight){
 const rows=(pressureCache??=estimatePressure(all)).slice(offset,view.end),x=horizontal.x,max=Math.max(1,...rows.map(r=>r.volume));
 const svgEl=document.getElementById('pressureChart'),scale=Math.max(.1,svgEl.clientWidth/1280),height=svgEl.getBoundingClientRect().height||(mode==='compact'?64:80),baseline=Math.max(0,height-8),top=mode==='compact'?6:24,available=Math.max(0,baseline-top);
 svgEl.setAttribute('viewBox','0 0 1280 '+height);svgEl.setAttribute('preserveAspectRatio','none');
 const muted=isLight?'#526079':'#b8c2d2',red=isLight?'#c9263c':'#ff3030',cyan=isLight?'#087da0':'#46def5',yellow=isLight?'#9d7900':'#fff34a';
 let svg=mode==='compact'?'':`<text x="25" y="16" fill="${muted}" font-size="12">거래량·매매세 · 빨강/하늘: 거래량 · 노랑/검정: 추정 매수/매도 압력</text>`;
 svg+=`<line x1="25" y1="${baseline}" x2="1170" y2="${baseline}" stroke="${muted}" opacity=".4"/>`;
 rows.forEach((r,i)=>{const width=Math.min(horizontal.width(i)*.65,24/scale),h=r.volume/max*available,p=Math.min(h,Math.abs(r.pressure)/max*available);svg+=`<rect class="pressure-volume" data-volume="${r.volume}" x="${x(i)-width/2}" y="${baseline-h}" width="${width}" height="${h}" fill="${r.aboveAverage===null?muted:r.aboveAverage?red:cyan}"/><rect class="pressure-estimate" data-direction="${r.pressure>0?'buy':r.pressure<0?'sell':'neutral'}" x="${x(i)-width*.325}" y="${baseline-p}" width="${width*.65}" height="${p}" fill="${r.pressure>=0?yellow:'#080808'}" stroke="${isLight?'#ffffff':'#b8c2d2'}" stroke-width=".35" vector-effect="non-scaling-stroke"/>`;});
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
function cumulativeInvestors(rows){return series.investorSeries(rows);}
let investorSnapshot=dataset.investors,investorFailure='',investorDisplay='daily',investorOpened=false,investorLoading=false;
function renderInvestorPanel(){
 const chart=document.getElementById('investorChart'),info=document.getElementById('investorInfo'),table=document.getElementById('investorTable'),summary=document.getElementById('investorSummary'),status=document.getElementById('investorStatus');
 document.getElementById('investorMode').value=investorDisplay;
 const wrapper=host.querySelector('.sb-proof-extended');wrapper.hidden=barCycle==='year'||(mode==='compact'&&!investorSnapshot);
 if(!investorSnapshot){chart.replaceChildren();summary.textContent=investorLoading?'투자자별 순매수 · 조회 중…':'투자자별 순매수 · 자료 없음';status.textContent=investorLoading?'투자자별 순매수를 불러오는 중…':investorFailure||'KIS 연결 후 투자자별 순매수를 조회할 수 있습니다.';info.textContent=status.textContent;table.replaceChildren();document.getElementById('investorLegend').replaceChildren();window.investorEvidence=null;return;}
 const rows=cumulativeInvestors(['KIS','Naver'].includes(investorSnapshot.source)?investorSnapshot.rows:normalizeInvestorRows(investorSnapshot.rows)),current=row=>investorDisplay==='daily'?row:row.cumulative;
 const values=[0,...rows.flatMap(r=>investorGroups.map(([k])=>current(r)[k]))];let lo=Math.min(...values),hi=Math.max(...values);if(lo===hi){lo=-1;hi=1;}
 const height=Math.max(mode==='compact'?32:80,chart.getBoundingClientRect().height||180),top=mode==='compact'?8:30,bottom=height-22,scale=v=>top+(hi-v)/(hi-lo)*Math.max(1,bottom-top),x=i=>rows.length===1?597:65+i*1040/(rows.length-1);
 const colors=['var(--sb-chart-investor-foreign)','var(--sb-chart-investor-institution)','var(--sb-chart-investor-individual)'];let svg='';
 chart.setAttribute('viewBox','0 0 1280 '+height);chart.setAttribute('preserveAspectRatio','none');chart.setAttribute('aria-label',investorDisplay==='daily'?'외국인 기관 개인 일별 순매수':'외국인 기관 개인 수신 자료 누적 순매수');
 for(let i=0;i<=4;i++){const value=lo+(hi-lo)*i/4;svg+=`<line x1="65" y1="${scale(value)}" x2="1130" y2="${scale(value)}" stroke="var(--sb-border)"/><text x="1140" y="${scale(value)+4}" fill="var(--sb-text-2)" font-size="11">${Math.round(value).toLocaleString()}주</text>`;}
 svg+=`<line x1="65" y1="${scale(0)}" x2="1130" y2="${scale(0)}" stroke="var(--sb-text-2)" stroke-dasharray="4 4"/>`;
 investorGroups.forEach(([key,name],j)=>{svg+=`<text x="${65+j*350}" y="18" fill="${colors[j]}" font-size="12">${name} ${current(rows.at(-1))[key].toLocaleString()}주</text><polyline class="investor-line" data-chart-indicator="investors" data-group="${key}" points="${rows.map((r,i)=>x(i)+','+scale(current(r)[key])).join(' ')}" fill="none" stroke="${colors[j]}" stroke-width="2"/>`;rows.forEach((row,i)=>{svg+=`<circle class="investor-point" data-chart-indicator="investors" data-date="${row.date}" data-group="${key}" cx="${x(i)}" cy="${scale(current(row)[key])}" r="3" fill="${colors[j]}"><title>${row.date} ${name} 일별 ${row[key].toLocaleString()}주 / 수신 누적 ${row.cumulative[key].toLocaleString()}주</title></circle>`;});});
 document.getElementById('investorLegend').innerHTML=investorGroups.map(([key,name],i)=>`<span style="color:${colors[i]}">${name} ${current(rows.at(-1))[key].toLocaleString()}주</span>`).join('');
 const stride=Math.max(1,Math.ceil(rows.length/6));rows.forEach((row,i)=>{if(i%stride===0||i===rows.length-1)svg+=`<text x="${x(i)-30}" y="${height-5}" fill="var(--sb-text-2)" font-size="11">${row.date.slice(5)}</text>`;});chart.innerHTML=svg;
 summary.textContent='투자자별 순매수 · '+(investorSnapshot.source==='KIS'?'KIS':investorSnapshot.source==='Naver'?'네이버':'보존')+' · 별도 일별 축 '+rows.length+'일'+(investorLoading?' · 다시 조회 중…':'');
 const caption=(investorSnapshot.source==='KIS'?'KIS · KRX · ':investorSnapshot.source==='Naver'?'네이버 제공 기준 · ':'')+rows[0].date+' ~ '+rows.at(-1).date+' · '+(investorDisplay==='daily'?'일별 순매수(주)':'수신 자료만 합산 · 첫 수신일 직전 0 기준')+' · 보유량/보유율 아님'+(investorSnapshot.source==='KIS'?' · 당일 자료는 공급자 기준 장 종료 후 제공':' · 제공된 최근 수신일만 표시')+(investorSnapshot.omittedRows?' · 미제공 수량 '+investorSnapshot.omittedRows+'일 제외':'')+(investorSnapshot.source==='Naver'?' · KIS 조회 실패로 네이버 수신 자료 표시 ('+(investorSnapshot.primaryErrorCode||'KIS_UNAVAILABLE')+')':'');status.textContent=caption;summary.title=caption;info.textContent=caption+(investorSnapshot.fetchedAt?' · 조회 '+new Date(investorSnapshot.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'')+' · 누락일은 0으로 채우지 않으며 기타 주체를 빼서 개인 수량을 계산하지 않습니다.';
 table.innerHTML='<thead><tr><th>날짜</th><th>외국인 순매수(주)</th><th>기관 순매수(주)</th><th>개인 순매수(주)</th></tr></thead><tbody>'+rows.map(row=>`<tr><td>${row.date}</td>${investorGroups.map(([key])=>`<td>${row[key].toLocaleString()}</td>`).join('')}</tr>`).join('')+'</tbody>';
 window.investorEvidence={dates:rows.map(row=>row.date),count:rows.length,mode:investorDisplay,totals:rows.at(-1).cumulative,lastDaily:{foreign:rows.at(-1).foreign,institution:rows.at(-1).institution,individual:rows.at(-1).individual},loading:investorLoading,source:investorSnapshot.source,market:investorSnapshot.market||null,primaryErrorCode:investorSnapshot.primaryErrorCode||null,omittedRows:investorSnapshot.omittedRows||0,unit:'주',fetchedAt:investorSnapshot.fetchedAt||null};
}

 function getIndicators(){return [...periods.map(n=>({id:'ma:'+n,label:n+config.unit+' 이평선',available:true})),...(config.cloud?[{id:'cloud',label:'산·우물 구름 '+config.cloud.join('·')+config.unit,available:true}]:[]),...(barCycle==='day'?[{id:'bb',label:'BB 상한선',available:true}]:[]),...(chartType==='profile'?[{id:'profile',label:'매물대 (추정)',available:true}]:[]),...(barCycle!=='year'?[{id:'money',label:'거래대금 (KIS)',available:true},{id:'pressure',label:'거래량·매매세',available:true},{id:'investors',label:'투자자별 순매수'+(investorSnapshot?'':' (자료 없음)'),available:!!investorSnapshot}]:[])];}
 function indicatorLabel(id,label,color='var(--sb-text-2)'){return hiddenIndicators.has(id)?'':`<button type="button" class="sb-btn sb-chart-indicator" data-chart-indicator="${id}" aria-pressed="false" style="color:${color};border-color:${color}">${label}</button>`;}
 function draw(){render(all);if(barCycle!=='year')renderInvestorPanel();
 const noPressure=barCycle==='year'||hiddenIndicators.has('pressure');document.getElementById('pressureChart').toggleAttribute('hidden',noPressure);host.classList.toggle('sb-proof-no-pressure',noPressure);document.getElementById('investorPanel').hidden=hiddenIndicators.has('investors');

 host.chartEvidence={...window.chartEvidence,pressure:window.pressureEvidence,money:window.moneyEvidence,investors:window.investorEvidence};host.dispatchEvent(new root.CustomEvent('stockbook:chart-render'));}
 function applyView(count,position){
  const nextCount=Math.max(1,Math.min(all.length,Math.round(count))),nextPosition=Math.max(0,Math.min(1,position)),end=nextCount+Math.round((all.length-nextCount)*nextPosition);
  if(view.count===nextCount&&view.end===end&&view.position===nextPosition)return;
  view.count=nextCount;view.end=end;view.position=nextPosition;draw();
 }
 document.getElementById('investorMode').addEventListener('change',event=>{investorDisplay=event.target.value==='cumulative'?'cumulative':'daily';draw();});
 draw();for(const id of ['refs','original'])document.getElementById(id).onchange=draw;
 return {setInvestorLoading:()=>{investorLoading=true;draw();},setInvestors:data=>{
  investorLoading=false;
  if(data?.ok){if(data.stockCode!==dataset.metadata.stockCode||!((data.source==='KIS'&&data.market==='KRX')||(data.source==='Naver'&&data.market==='provider'))||data.unit!=='주')throw Error('수급 종목/출처 불일치');series.investorSeries(data.rows);investorSnapshot=data;investorFailure='';if(!investorOpened){investorOpened=true;if(mode!=='compact')document.getElementById('investorPanel').open=true;}}
  else{investorSnapshot=null;investorFailure=typeof data?.error==='string'?data.error:'투자자별 순매수를 불러오지 못했습니다.';}
  draw();
 },setTradingValues:data=>{
  tradingAmounts=all.map(()=>null);tradingInfo=null;
  if(data?.ok){if(data.stockCode!==dataset.metadata.stockCode)throw Error('거래대금 종목 불일치');const joined=series.tradingValues(all,dataset.candles,data);tradingAmounts=joined.amounts;tradingInfo={...joined,fetchedAt:data.fetchedAt};tradingStatus='KIS · KRX · 원 · 최근 최대 100거래일 중 일봉 거래량 일치 '+joined.matched+'일'+(joined.mismatched?' · 거래량 불일치 '+joined.mismatched+'일 제외':'')+' · 수신하지 못한 날짜와 일부만 수신한 주·월은 빈칸 · 마지막 거래일은 장중 변동 가능';if(!moneyOpened&&joined.amounts.some(value=>value!==null)){moneyOpened=true;document.getElementById('moneyPanel').open=true;}}
  else tradingStatus=typeof data?.error==='string'?data.error:'날짜별 실제 거래대금 자료가 없어 막대를 표시하지 않습니다.';
  draw();
 },getModel:()=>model,getIndicators,getType:()=>chartType,setType:value=>{if(!series.chartTypes.includes(value))throw Error('차트 유형 오류');if(chartType!==value){chartType=value;draw();}},getHiddenIndicators:()=>[...hiddenIndicators],setHiddenIndicators:ids=>{hiddenIndicators=new Set(ids.filter(id=>/^(ma:\d+|bb|cloud|pressure|money|investors|profile)$/.test(id)).slice(0,32));draw();},refresh:draw,updateTheme:value=>{lightMode=value;draw();},
 setView:(count,end=view.end)=>{const n=Math.max(1,Math.min(all.length,Math.round(count))),last=Math.max(n,Math.min(all.length,Math.round(end)));applyView(n,all.length>n?(last-n)/(all.length-n):view.position);},
 zoomTo:count=>applyView(count,view.position),scrollTo:position=>applyView(view.count,position),scrollBy:bars=>{const max=all.length-view.count;if(max)applyView(view.count,Math.max(0,Math.min(max,view.end-view.count+bars))/max);},resetView:()=>applyView(all.length-initialOffset,1),
 resetSettings:()=>{investorDisplay='daily';const defaults=series.cycleConfig(barCycle);periods=mode==='compact'&&barCycle==='day'?[5,10,20,60]:defaults.periods;config.cloud=defaults.cloud;bbSettings={period:40,multiplier:1.9,shift:25};hiddenIndicators.clear();chartType='candle';view.count=all.length-initialOffset;view.end=all.length;view.position=1;for(const id of ['refs','original'])document.getElementById(id).checked=false;draw();},
 setSettings:values=>{const next=series.indicatorSettings(barCycle,values);periods=next.periods;config.cloud=next.cloud;bbSettings=next.bb;futureCount=barCycle==='day'?bbSettings.shift:0;draw();}};
}
root.StockBookChartRenderer=Object.freeze({mount});
})(window);
