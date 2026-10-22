let investorSnapshot=null,investorFailure='';
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
fetch('investor-snapshot.json').then(r=>{if(!r.ok)throw Error('수급 스냅샷 HTTP '+r.status);return r.json();}).then(d=>{normalizeInvestorRows(d.rows);investorSnapshot=d;renderInvestorPanel();window.investorReady=true;}).catch(e=>{investorFailure='수급 표시 실패: '+e.message;renderInvestorPanel();window.investorError=e.message;});
new MutationObserver(()=>renderInvestorPanel()).observe(document.body,{attributes:true,attributeFilter:['class']});
