// Independent OHLCV estimate, not the encrypted HTS indicator or actual trade-side volume.
function estimatePressure(all){return all.map((c,i)=>{const prior=all.slice(Math.max(0,i-20),i);const baseline=prior.length===20?prior.reduce((s,r)=>s+r.volume,0)/20:null;const location=c.high===c.low?0:Math.max(-1,Math.min(1,(2*c.close-c.high-c.low)/(c.high-c.low)));return {date:c.date,volume:c.volume,baseline,aboveAverage:baseline===null?null:c.volume>=baseline,location,pressure:location*c.volume};});}
function cumulativePressure(all){let total=0;return estimatePressure(all).map(r=>({...r,cumulative:total+=r.pressure}));}
function renderPressure(all,isLight){
 const rows=estimatePressure(all).slice(-160),step=1140/(rows.length+25),x=i=>25+(i+.5)*step,max=Math.max(1,...rows.map(r=>r.volume));
 const muted=isLight?'#526079':'#b8c2d2',red=isLight?'#c9263c':'#ff3030',cyan=isLight?'#087da0':'#46def5',yellow=isLight?'#9d7900':'#fff34a';
 let svg=`<text x="25" y="20" fill="${muted}" font-size="13">거래량·매매세 · 바깥 빨강/하늘색: 거래량 · 안쪽 노랑/검정: 추정 매수/매도 압력</text><line x1="25" y1="185" x2="1170" y2="185" stroke="${muted}" opacity=".4"/><line x1="0" y1="210" x2="1280" y2="210" stroke="${muted}" opacity=".3"/><text x="25" y="235" fill="${muted}" font-size="13">거래대금 구간 · 실제 금액 미수신</text>`;
 rows.forEach((r,i)=>{const w=step*.88,h=r.volume/max*150,p=r.pressure/max*150;svg+=`<rect class="pressure-volume" x="${x(i)-w/2}" y="${185-h}" width="${w}" height="${h}" fill="${r.aboveAverage===null?muted:r.aboveAverage?red:cyan}"/><rect class="pressure-estimate" data-direction="${p>0?'buy':p<0?'sell':'neutral'}" x="${x(i)-w*.30}" y="${185-Math.abs(p)}" width="${w*.60}" height="${Math.abs(p)}" fill="${p>=0?yellow:'#080808'}" stroke="${isLight?'#ffffff':'#b8c2d2'}" stroke-width=".35"/>`;});
 const labels=['300억↑','500억↑','1000억↑','3000억↑','5000억↑','1조↑'];
 const moneyColors=isLight?['#174ed6','#467c00','#b15b00','#cf253c','#8055b4','#283447']:['#346dff','#a8ee49','#ff9a34','#ff354f','#d2afff','#ffffff'];
 labels.forEach((t,i)=>{svg+=`<text x="${25+i*130}" y="260" fill="${moneyColors[i]}" font-size="12">${t}</text>`;});
 svg+=`<text x="25" y="305" fill="${muted}" font-size="13">날짜별 실제 거래대금 미수신 · 막대 표시 보류 · 종가×거래량으로 대체하지 않음</text><text x="25" y="360" fill="${muted}" font-size="11">${rows[0].date}</text><text x="${x(rows.length-1)-55}" y="360" fill="${muted}" font-size="11">${rows.at(-1).date}</text>`;
 const accumulated=cumulativePressure(all),visible=accumulated.slice(-160),vals=visible.map(r=>r.cumulative),low=Math.min(...vals),high=Math.max(...vals),span=high-low||1,yy=v=>415+(high-v)/span*130;
 svg+=`<line x1="0" y1="375" x2="1280" y2="375" stroke="${muted}" opacity=".3"/><text x="25" y="398" fill="${muted}" font-size="13">매집·분산 추정선(A/D) · 실제 세력 보유량 아님</text>`;
 for(let i=0;i<3;i++){const v=low+span*i/2;svg+=`<line x1="25" y1="${yy(v)}" x2="1170" y2="${yy(v)}" stroke="${muted}" opacity=".17"/><text x="1180" y="${yy(v)+4}" fill="${muted}" font-size="10">${(v/1e6).toFixed(1)}M</text>`;}
 svg+=`<polyline class="accumulation-line" points="${visible.map((r,i)=>`${x(i)},${yy(r.cumulative)}`).join(' ')}" fill="none" stroke="${yellow}" stroke-width="1.7"/><text x="25" y="570" fill="${muted}" font-size="11">${visible[0].date}</text><text x="${x(visible.length-1)-55}" y="570" fill="${muted}" font-size="11">${visible.at(-1).date}</text>`;
 window.accumulationEvidence={sourceCount:accumulated.length,displayed:visible.length,start:accumulated[0].date,last:visible.at(-1).cumulative,min:low,max:high};
 document.getElementById('pressureChart').innerHTML=svg;window.pressureEvidence={count:rows.length,buy:rows.filter(r=>r.pressure>0).length,sell:rows.filter(r=>r.pressure<0).length,neutral:rows.filter(r=>r.pressure===0).length};
}
