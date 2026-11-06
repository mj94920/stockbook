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
  const focused=host.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
  host.replaceChildren();
  const toolbar=document.createElement('div');toolbar.className='sb-theme-toolbar';host.appendChild(toolbar);
  function field(labelText,accessibleName,items,value,change,disabled=false){
   const label=document.createElement('label');label.className='sb-theme-field';
   const text=document.createElement('span');text.textContent=labelText;label.appendChild(text);
   const input=document.createElement('select');input.className='sb-select';input.setAttribute('aria-label',accessibleName);input.disabled=disabled;
   for(const [key,caption] of items){const option=document.createElement('option');option.value=key;option.textContent=caption;input.appendChild(option);}
   input.value=value;input.onchange=()=>change(input.value);label.appendChild(input);toolbar.appendChild(label);return input;
  }
  const select=(g,l)=>{group=g;leaf=l;onChange();};
  const parents=[['','큰 테마 선택'],...Object.keys(root.StockBookThemes.groups).filter(g=>groupCounts.has(g)).map(g=>[g,g+' ('+groupCounts.get(g)+')'])];
  field('테마','큰 테마',parents,group,g=>select(g,''));
  const children=[['',group?'전체 ('+groupRows.length+')':'테마 선택 후 표시'],...[...leafCounts].map(([l,count])=>[l,l+' ('+count+')'])];
  field('세부','세부 테마',children,leaf,l=>select(group,l),!group);
  const selected=group?groupRows.filter(r=>!leaf||r.paths.some(p=>p.group===group&&p.leaf===leaf)):[];
  const status=document.createElement('p');status.className='sb-data-note';status.setAttribute('role','status');
  status.classList.add('sb-theme-path');status.title='투자 테마 · 여러 테마에 중복 포함 가능 · 수신한 종목 기준';
  status.textContent=group?group+(leaf?' › '+leaf:'')+' · '+selected.length+'종목':'큰 테마를 고르면 세부 테마와 종목을 볼 수 있습니다.';
  host.appendChild(status);
  if(!records.length||!stocks.some(s=>s.market==='KOSDAQ')){
   const load=document.createElement('button');load.type='button';load.className='sb-btn sb-btn--ghost sb-btn--sm';load.textContent=records.length?'시장 자료 추가':'종목 불러오기';load.id='sbThemeLoad';load.onclick=()=>root._loadSectorData();host.appendChild(load);
  }
  if(focused)for(const input of toolbar.querySelectorAll('select'))if(input.getAttribute('aria-label')===focused)input.focus({preventScroll:true});
  return selected.map(r=>({...r.stock,themeLabel:r.paths.filter(p=>p.group===group&&(!leaf||p.leaf===leaf)).map(p=>p.leaf).join(' · '),themeBasis:[...new Set(r.paths.filter(p=>p.group===group).map(p=>p.basis))].join(' · ')})).sort((a,b)=>(b.marketCap||0)-(a.marketCap||0));
 }};
})(window);
