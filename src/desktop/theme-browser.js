(function(root){
 'use strict';
 let group='',leaf='';
 root.StockBookThemeBrowser={render({stocks,host,query='',getHint,onChange}){
  if(!host||!root.StockBookThemes)return [];
  const records=root.StockBookThemes.index(stocks,getHint),q=query.toLowerCase().trim();
  const matched=records.filter(r=>!q||[r.stock.name,r.stock.code,r.stock.industry,...r.paths.flatMap(p=>[p.group,p.leaf])].some(v=>String(v||'').toLowerCase().includes(q)));
  const groupCounts=new Map();
  for(const r of matched)for(const g of new Set(r.paths.map(p=>p.group)))groupCounts.set(g,(groupCounts.get(g)||0)+1);
  if(!groupCounts.has(group)){group='';leaf='';}
  const groupRows=matched.filter(r=>r.paths.some(p=>p.group===group));
  const leafCounts=new Map();
  for(const r of groupRows)for(const l of new Set(r.paths.filter(p=>p.group===group).map(p=>p.leaf)))leafCounts.set(l,(leafCounts.get(l)||0)+1);
  if(leaf&&!leafCounts.has(leaf))leaf='';
  host.replaceChildren();
  const heading=document.createElement('strong');heading.textContent='큰 테마 → 세부 테마 → 종목';host.appendChild(heading);
  const note=document.createElement('p');note.className='sb-data-note';note.textContent='투자 테마 · 여러 테마에 중복 포함 가능 · 수신한 종목 기준';host.appendChild(note);
  const grid=document.createElement('div');grid.className='sb-theme-grid';grid.setAttribute('aria-label','큰 테마');host.appendChild(grid);
  function button(parent,label,active,action){const b=document.createElement('button');b.type='button';b.className='sb-btn sb-btn--sm';b.textContent=label;b.setAttribute('aria-pressed',String(active));b.onclick=action;parent.appendChild(b);return b;}
  const select=(g,l)=>{group=g;leaf=l;onChange();};
  button(grid,'전체 테마',!group,()=>select('',''));
  for(const g of Object.keys(root.StockBookThemes.groups))if(groupCounts.has(g)){
   const b=button(grid,g+' · '+groupCounts.get(g),group===g,()=>select(g,''));b.dataset.themeGroup=g;
  }
  const children=document.createElement('div');children.className='sb-theme-children';children.setAttribute('aria-label','세부 테마');host.appendChild(children);
  if(group){
   button(children,group+' 전체',!leaf,()=>select(group,''));
   for(const l of leafCounts.keys()) {const b=button(children,l+' · '+leafCounts.get(l),leaf===l,()=>select(group,l));b.dataset.themeLeaf=l;}
  }
  const selected=group?groupRows.filter(r=>!leaf||r.paths.some(p=>p.group===group&&p.leaf===leaf)):[];
  const status=document.createElement('p');status.className='sb-data-note';status.setAttribute('role','status');
  status.textContent=group?group+' / '+(leaf||'전체')+' · '+selected.length+'종목':'큰 테마를 선택하세요. 검색은 종목명·코드·테마명으로 가능합니다.';
  host.appendChild(status);
  if(!records.length){const b=button(host,'KOSPI·KOSDAQ 종목 불러오기',false,()=>root._loadSectorData());b.id='sbThemeLoad';}
  else if(!stocks.some(s=>s.market==='KOSDAQ'))button(host,'전체 시장 자료 확인·불러오기',false,()=>root._loadSectorData());
  return selected.map(r=>({...r.stock,themeLabel:r.paths.filter(p=>p.group===group&&(!leaf||p.leaf===leaf)).map(p=>p.leaf).join(' · '),themeBasis:[...new Set(r.paths.filter(p=>p.group===group).map(p=>p.basis))].join(' · ')})).sort((a,b)=>(b.marketCap||0)-(a.marketCap||0));
 }};
})(window);
