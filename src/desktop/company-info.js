(function(root){
 'use strict';
 const cache=new Map();let selected=null,sequence=0,pending=null;
 const el=id=>document.getElementById(id),present=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&String(value).trim()!=='-';
 const number=value=>{if(!present(value))return '—';const text=String(value).trim(),n=Number(text.replace(/,/g,''));return Number.isFinite(n)?n.toLocaleString('ko-KR',{maximumFractionDigits:4}):text;};
 const value=(data,keys)=>keys.map(key=>data?.[key]).find(present);
 const unit=(value,suffix)=>present(value)?number(value)+(Number.isFinite(Number(String(value).replace(/,/g,'')))?suffix:''):'—';
 function cell(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
 function empty(){el('sbCompanyMetrics')?.replaceChildren();el('sbCompanyFinance')?.replaceChildren();}
 function select(stock){
  const code=stock?.ticker||'';if(selected===code)return false;
  selected=code;++sequence;pending=null;empty();
  if(el('sbCompanyRefresh'))el('sbCompanyRefresh').disabled=false;
  if(el('sbCompanyStatus'))el('sbCompanyStatus').textContent=code?'기업정보 조회 대기':'종목을 선택하세요.';
  return true;
 }
 function render(data,finance){
  const metrics=el('sbCompanyMetrics'),host=el('sbCompanyFinance');if(!metrics||!host)return;empty();
  if(data){
   const rows=[['업종',value(data,['industryGroupName','industryName','industry'])||'—'],['상장일',value(data,['listingDate','ipoDate'])||'—'],['시가총액 (제공값)',number(value(data,['marketValue','marketCap','marketValueAmount']))],['상장주식수',unit(value(data,['issuedShareCount','shares']),'주')],['PER',unit(data.per,'배')],['PBR',unit(data.pbr,'배')],['EPS',unit(data.eps,'원')],['BPS',unit(data.bps,'원')],['ROE',unit(data.roe,'%')],['영업이익률',unit(data.operatingMargin,'%')],['배당수익률',unit(data.dividendYield,'%')],['주당배당금',unit(value(data,['dividend','dividendPerShare']),'원')]];
   for(const [label,text]of rows){metrics.append(cell('dt',label),cell('dd',String(text)));}
  }
  const info=finance?.annual?.financeInfo,titles=Array.isArray(info?.trTitleList)?info.trTitleList.filter(t=>t.isConsensus==='N'&&present(t.key)).slice(-3):[];
  const wanted=['매출액','영업이익','당기순이익','영업이익률','ROE','부채비율','EPS','BPS'];
  const rows=Array.isArray(info?.rowList)?wanted.map(name=>info.rowList.find(row=>row.title===name)).filter(Boolean):[];
  if(!titles.length||!rows.length){host.textContent='연간 재무 자료를 받지 못했습니다.';return;}
  const table=document.createElement('table'),caption=cell('caption','연간 재무 · 제공사 표기 단위 · 예상치 제외'),head=document.createElement('thead'),header=document.createElement('tr'),body=document.createElement('tbody');
  header.append(cell('th','항목'));for(const title of titles)header.append(cell('th',String(title.title||title.key)));head.append(header);
  for(const row of rows){const tr=document.createElement('tr'),label=cell('th',row.title+(row.unit?' ('+row.unit+')':' (단위 미제공)'));label.scope='row';tr.append(label);for(const title of titles)tr.append(cell('td',number(row.columns?.[title.key]?.value)));body.append(tr);}
  table.append(caption,head,body);host.append(table);
 }
 function request(fn,code){
  if(typeof fn!=='function')return Promise.resolve(null);let timer;
  return Promise.race([Promise.resolve().then(()=>fn(code)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('조회 지연')),12000);})]).finally(()=>clearTimeout(timer));
 }
 async function open(stock,force=false){
  select(stock);const code=selected,status=el('sbCompanyStatus'),button=el('sbCompanyRefresh');if(!status||!button)return;
  if(!code){status.textContent='종목을 선택하세요.';return;}
  if(!/^\d{6}$/.test(code)){empty();status.textContent='국내 종목의 기업정보만 지원합니다.';return;}
  const api=root.electronAPI;
  if(typeof api?.fetchStockDetail!=='function'){empty();status.textContent='기업정보 연결 필요 · 데스크톱 앱에서 조회하세요.';return;}
  if(!force&&pending?.code===code)return pending.task;
  if(force)cache.delete(code);
  const saved=cache.get(code);
  if(!force&&saved&&saved.detailSource===api.fetchStockDetail&&saved.financeSource===api.fetchNaverFinance&&Date.now()-saved.at<300000){render(saved.data,saved.finance);status.textContent='출처 네이버 금융 · 조회 '+new Date(saved.at).toLocaleString('ko-KR')+' · 최근 조회 자료';return;}
  const id=++sequence;empty();button.disabled=true;status.textContent='기업·재무정보 조회 중…';
  const state={code,task:null};pending=state;
  state.task=(async()=>{
   const [detailResult,financeResult]=await Promise.allSettled([request(api.fetchStockDetail,code),request(api.fetchNaverFinance,code)]);
   if(sequence!==id||selected!==code)return;
   const detail=detailResult.status==='fulfilled'?detailResult.value:null,data=detail?.ok&&detail.data&&typeof detail.data==='object'&&!Array.isArray(detail.data)&&Object.keys(detail.data).length?detail.data:null;
   const received=financeResult.status==='fulfilled'?financeResult.value:null;
   const finance=Array.isArray(received?.annual?.financeInfo?.rowList)&&received.annual.financeInfo.rowList.length&&Array.isArray(received.annual.financeInfo.trTitleList)&&received.annual.financeInfo.trTitleList.some(title=>title.isConsensus==='N')?received:null;
   render(data,finance);const at=Date.now();
   status.textContent=data||finance?.annual?'출처 네이버 금융 · 조회 '+new Date(at).toLocaleString('ko-KR')+' · 시세와 재무 기준일은 다를 수 있습니다.'+(data?'':' · 기업정보 조회 실패')+(finance?.annual?'':' · 연간 재무 조회 실패'):'조회 실패 · 기업·재무정보를 받지 못했습니다. 다시 조회하세요.';
   if(data&&finance?.annual){cache.set(code,{data,finance,at,detailSource:api.fetchStockDetail,financeSource:api.fetchNaverFinance});while(cache.size>20)cache.delete(cache.keys().next().value);}
  })().finally(()=>{if(sequence===id)button.disabled=false;if(pending===state)pending=null;});
  return state.task;
 }
 root.StockBookCompanyInfo=Object.freeze({select,open});
})(window);
