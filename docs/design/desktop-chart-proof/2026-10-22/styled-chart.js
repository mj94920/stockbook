const periods=[5,10,20,60,120,200,350,480];
const dark=['#f8b4cf','#87cefa','#ffe34d','#48bc70','#9ca3af','#ff2929','#b98b48','#b48af0'];
const light=['#b52664','#1177ad','#9b7300','#168542','#666c76','#c91c28','#8d5c1f','#763cb5'];
function average(all,n){return all.map((_,i)=>i<n-1?null:all.slice(i-n+1,i+1).reduce((s,c)=>s+c.close,0)/n);}
function bbUpper(all,n=40,m=1.9){return all.map((_,i)=>{if(i<n-1)return null;const a=all.slice(i-n+1,i+1).map(c=>c.close),mean=a.reduce((s,v)=>s+v,0)/n;return mean+m*Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/n);});}
const chartView={count:160,end:null};
function render(all){
 const isLight=document.body.classList.contains('light'),colors=isLight?light:dark,grid=isLight?'#dfe5ee':'#2b3547',text=isLight?'#526079':'#a4adbd';
 const end=chartView.end??all.length,offset=Math.max(0,end-chartView.count),rows=all.slice(offset,end),avgs=periods.map(n=>average(all,n).slice(offset,end));
 const upper=bbUpper(all),shift=25,bb=rows.map((_,i)=>upper[offset+i-shift]??null);
 const referenceBase=all.slice(-600),references=[60,20,5].map(n=>({n,candle:referenceBase[600-n-1]}));
 const showRefs=document.getElementById('refs').checked,showOriginal=document.getElementById('original').checked;
 const future=Array.from({length:25},(_,i)=>upper[end-25+i]);
 const values=bb.concat(future,showOriginal?upper.slice(offset,end):[],showRefs?references.map(r=>r.candle.close):[]).filter(v=>v!==null).concat(rows.flatMap(c=>[c.low,c.high]).concat(avgs.flat().filter(v=>v!==null)));const lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo)*.04;
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
 if(showOriginal)svg+=`<polyline class="bb-original" points="${upper.slice(offset,end).flatMap((v,i)=>v===null?[]:[`${x(i)},${y(v)}`]).join(' ')}" fill="none" stroke="${colors[2]}" stroke-width="1" stroke-dasharray="3 4"/>`;
 if(showRefs)references.forEach((r,i)=>{svg+=`<line class="reference" x1="25" y1="${y(r.candle.close)}" x2="1170" y2="${y(r.candle.close)}" stroke="${colors[i]}" stroke-dasharray="5 5"/><text x="30" y="${y(r.candle.close)-5}" fill="${colors[i]}" font-size="11">수식${i+1}: ${r.candle.date} 종가 ${r.candle.close.toLocaleString()}</text>`;});
 svg+=`<line x1="${x(rows.length-1)+step/2}" y1="25" x2="${x(rows.length-1)+step/2}" y2="550" stroke="${grid}" stroke-dasharray="4 5"/><text x="${x(rows.length)+4}" y="550" fill="${text}" font-size="10">미래 25봉 표시 공간</text>`;
 svg+=`<text x="25" y="585" fill="${text}">${rows[0].date}</text><text x="${x(rows.length-1)-55}" y="585" fill="${text}">${rows.at(-1).date}</text>`;
 document.getElementById('chart').innerHTML=svg;document.getElementById('legend').innerHTML=periods.map((n,i)=>`<span style="color:${colors[i]};border-color:${colors[i]}">${n}일</span>`).join('')+`<span style="color:${mint};border-color:${mint}">BB 40 / 1.9 → +25봉</span>`;document.getElementById('period').textContent=`수신 기간 ${all[0].date} ~ ${all.at(-1).date} · ${all.length}봉 · 모든 이동평균은 종가 단순평균`;
 renderPressure(all,isLight,{offset,end});
 window.chartModel={all,rows,offset,end,x,y,step,periods,averages:avgs,priceForY:v=>hi+pad-(v-30)/490*(hi-lo+2*pad)};
 restoreChartInteraction();
 syncViewNavigation();
 document.getElementById("viewRange").textContent=`${rows.length}봉 · ${rows[0].date} ~ ${rows.at(-1).date}`;
 window.chartEvidence={count:all.length,displayed:rows.length,periods,cloudCount,bbShift:shift,bbPeriod:40,bbMultiplier:1.9,referenceBaseCount:referenceBase.length,references,lastAverages:avgs.map((a,i)=>({period:periods[i],value:a.at(-1)}))};window.renderDone=true;
}
fetch('long-candles.json').then(r=>r.json()).then(all=>{render(all);for(const id of ['refs','original'])document.getElementById(id).onchange=()=>render(all);document.getElementById('theme').onclick=()=>{document.body.classList.toggle('light');document.getElementById('theme').textContent=document.body.classList.contains('light')?'다크 모드':'라이트 모드';render(all);};});
