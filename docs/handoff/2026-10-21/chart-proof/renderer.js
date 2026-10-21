const statusEl=document.getElementById('status');
const chart=document.getElementById('chart');
function render(candles){
  const all=candles;const offset=Math.max(0,all.length-120),rows=all.slice(offset);
  const low=Math.min(...rows.map(c=>c.low)), high=Math.max(...rows.map(c=>c.high));
  const maxVol=Math.max(1,...rows.map(c=>c.volume));
  const y=value=>30+(high-value)/(high-low||1)*270, step=1000/rows.length;
  const x=i=>55+(i+.5)*step;
  let svg='';
  for(let j=0;j<=4;j++){const value=low+(high-low)*j/4,yy=y(value);svg+=`<line x1="50" y1="${yy}" x2="1060" y2="${yy}" stroke="#e5e9f0"/><text x="1065" y="${yy+4}" font-size="11">${Math.round(value).toLocaleString()}</text>`;}
  rows.forEach((c,i)=>{const color=c.close>=c.open?'#ed3150':'#2866dc',xx=x(i),w=Math.max(1,step*.65);svg+=`<line x1="${xx}" y1="${y(c.high)}" x2="${xx}" y2="${y(c.low)}" stroke="${color}"/><rect x="${xx-w/2}" y="${Math.min(y(c.open),y(c.close))}" width="${w}" height="${Math.max(1,Math.abs(y(c.open)-y(c.close)))}" fill="${color}"/><rect x="${xx-w/2}" y="${415-c.volume/maxVol*85}" width="${w}" height="${c.volume/maxVol*85}" fill="${color}" opacity=".5"/>`;});
  const points=rows.flatMap((c,i)=>{const index=i+offset;if(index<19)return [];const avg=all.slice(index-19,index+1).reduce((s,r)=>s+r.close,0)/20;return [`${x(i)},${y(avg)}`];});
  svg+=`<polyline points="${points.join(' ')}" fill="none" stroke="#c99800" stroke-width="1.5"/><text x="50" y="445" font-size="12">${rows[0].date}</text><text x="960" y="445" font-size="12">${rows.at(-1).date}</text>`;
  chart.innerHTML=svg;
}
for(const button of document.querySelectorAll('button'))button.addEventListener('click',async()=>{
  document.querySelectorAll('button').forEach(b=>b.disabled=true);chart.innerHTML='';statusEl.textContent='조회 중…';
  try{
    const r=await window.chartProof.fetch(button.dataset.mode);
    if(!r.ok){statusEl.textContent=`조회 실패 · ${r.error}`;document.getElementById('detail').textContent=JSON.stringify(r,null,2);return;}
    render(r.candles);
    statusEl.textContent=`${r.mode==='sample'?'수신자료 표시 검증 (실조회 아님)':'실조회 성공'} · ${r.source} · ${r.candles.length}봉 · ${r.candles[0].date} ~ ${r.candles.at(-1).date} · ${r.elapsedMs}ms`;
    const {candles,...meta}=r;document.getElementById('detail').textContent=JSON.stringify({...meta,count:candles.length,first:candles[0],last:candles.at(-1)},null,2);
  }catch(e){statusEl.textContent=`실행 실패 · ${e.message}`;}
  finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}
});
