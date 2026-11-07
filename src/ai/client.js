(function(root){
 'use strict';
 const policy=root.StockBookAIPolicy;
 let selected=null,selection=0,busy=false,researchSeq=0,lastResult=null;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const n=el('button',text,'sb-btn sb-btn--sm');n.type='button';n.onclick=fn;return n;};
 const api=()=>root.electronAPI;
 const current=()=>({code:selected?.code,period:document.getElementById('sbAIPeriod')?.value||'3m',pattern:document.getElementById('sbAIPattern')?.value||'stock',provider:document.getElementById('sbAIProvider')?.value||'auto'});
 function choice(label,entries,id,value){const s=el('select',undefined,'sb-select');s.id=id;s.setAttribute('aria-label',label);for(const [key,text] of entries){const o=el('option',text);o.value=key;s.appendChild(o);}s.value=value;return s;}
 function link(text,url){try{const u=new URL(url);if(u.protocol!=='https:')throw Error();const a=el('a',text);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return el('span',text);}}
 function format(v){return v===null||v===undefined||v===''?'자료 없음':typeof v==='object'?JSON.stringify(v):String(v);}
 function settings(){root.openSettings?.();root.settingsGo?.('ai');checkHome();}
 async function checkHome(){
  const host=document.getElementById('sbAIHomeStatus');if(!host)return;
  host.textContent='홈 연결 확인 중…';
  if(!api()?.aiStatus){host.textContent='데스크톱 앱의 HOME 연결이 필요합니다.';return;}
  try{const r=await api().aiStatus();host.textContent=!r?.ok?(r?.error||'홈 연결 확인 실패'):!r.configured?r.message:r.providers.map(p=>(p.id==='codex'?'Codex':'Claude')+' '+(p.connected?'연결됨':'연결 확인 필요')).join(' · ');}
  catch{host.textContent='홈 연결 상태를 확인하지 못했습니다.';}
 }
 function renderResult(value){
  const host=document.getElementById('sbAIResult');if(!host)return;host.replaceChildren();
  if(!value){host.appendChild(el('p','분석 버튼을 누르면 선택 종목의 수집 자료를 HOME에 전달합니다.'));return;}
  host.appendChild(el('p',value.result.summary));
  const source=e=>value.bundle.evidence.find(s=>s.id===e);
  const refs=(parent,ids)=>{for(const id of ids){const item=source(id);if(item){const a=link('근거: '+item.title,item.url);a.classList.add('sb-ai-source');parent.appendChild(a);}}};
  for(const [key,title] of [['interpretations','해석'],['risks','위험']]){
   const section=el('section');section.appendChild(el('h4',title));
   for(const entry of value.result[key]){const p=el('p',entry.text);section.appendChild(p);refs(section,entry.evidenceIds);}host.appendChild(section);
  }
  host.appendChild(el('h4','선택지'));
  for(const option of value.result.options){const article=el('article');article.appendChild(el('strong',option.title));for(const [label,key] of [['이유','reason'],['위험','risk'],['다시 확인할 조건','reviewWhen']])article.appendChild(el('p',label+': '+option[key]));refs(article,option.evidenceIds);host.appendChild(article);}
  if(value.result.missing.length)host.appendChild(el('p','미수집·확인 필요: '+value.result.missing.map(id=>policy.labels[id]||id).join(' · ')));
  for(const question of value.result.questions)host.appendChild(el('p','확인 질문: '+question));
  const meta=document.getElementById('sbAIMetadata');if(meta)meta.textContent='생성 시각: '+value.createdAt+' · 모델: '+value.provider+' · '+policy.patterns[value.pattern].label;
 }
 async function analyze(){
  const status=document.getElementById('sbAIStatus');if(busy)return;
  if(!selected){status.textContent='먼저 종목을 선택하세요.';return;}
  if(!api()?.aiAnalyze){status.textContent='데스크톱 HOME 연결이 필요합니다.';return;}
  const token=selection,input=current();busy=true;document.getElementById('sbAIRun').disabled=true;status.textContent='자료 수집 및 HOME 분석 요청 중…';
  try{const r=await api().aiAnalyze(input);if(token!==selection)return;if(!r?.ok){status.textContent=r?.error||'분석 요청 실패';return;}lastResult=r;renderResult(r);status.textContent='받은 자료를 근거로 한 분석 · 선택지는 사용자 결정 전 제안입니다.';}
  catch{if(token===selection)status.textContent='HOME 분석 응답을 받지 못했습니다.';}
  finally{busy=false;const run=document.getElementById('sbAIRun');if(run)run.disabled=false;}
 }
 async function cancel(){const status=document.getElementById('sbAIStatus');if(status)status.textContent='홈에 취소 요청 중…';try{const r=await api()?.aiCancel();if(status)status.textContent=r?.confirmed?'홈에서 취소를 확인했습니다.':'취소 요청을 보냈습니다. 홈의 실행 상태를 확인하세요.';}catch{if(status)status.textContent='취소 상태를 홈에서 확인하세요.';}}
 function select(stock){
  const label=document.querySelector('#sbAnalysis .sb-analysis-section .sb-analysis-stock');if(label)label.textContent=stock?(stock.name||stock.ticker||stock.code):'종목 선택';
  const next=stock?.ticker||stock?.code||null;if(next===(selected?.code||null))return;
  selected=next?{code:next,name:stock.name||next}:null;selection++;lastResult=null;
  if(busy)cancel();renderResult(null);
  const meta=document.getElementById('sbAIMetadata');if(meta)meta.textContent='생성 시각: -- · 분석 결과 없음';
 }
 function table(headers,rows){const t=el('table',undefined,'sb-research-table');const head=el('thead'),tr=el('tr');for(const h of headers)tr.appendChild(el('th',h));head.appendChild(tr);t.appendChild(head);const body=el('tbody');for(const row of rows){const tr=el('tr');for(const cell of row)tr.appendChild(el('td',format(cell)));body.appendChild(tr);}t.appendChild(body);return t;}
 function evidenceView(source){
  const section=el('section',undefined,'sb-research-source');section.appendChild(el('h3',source.title));
  section.appendChild(link('출처 확인 ↗',source.url));section.appendChild(el('p','자료 기준: '+(source.asOf||'원문 확인 필요')+' · 수집: '+source.fetchedAt,'sb-data-note'));
  if(source.status!=='received'){section.appendChild(el('p','자료를 받지 못했습니다. 추정값으로 채우지 않았습니다.'));return section;}
  if(source.id==='finance')section.appendChild(table(['지표','공시 기간별 값'],source.data.rows.map(r=>[r.metric+(r.unit?' ('+r.unit+')':''),r.values.map(v=>v.period+': '+v.value+(v.estimate?' (예상)':'')).join(' / ')])));
  else if(source.id==='prices'){
   section.appendChild(table(['주기','기준일','종가','기본 이동평균'],Object.entries(source.data.indicators).map(([cycle,value])=>[({day:'일봉',week:'주봉',month:'월봉',year:'연봉'})[cycle],value.last.date,value.last.close,value.averages.map(a=>a.period+': '+(a.value===null?'이력 부족':Math.round(a.value).toLocaleString('ko-KR'))).join(' / ')])));
   section.appendChild(el('p',source.data.metadata.priceAdjustment+' · 마지막 봉 완성 여부 '+(source.data.metadata.lastBarComplete===true?'확인':'미확인'),'sb-data-note'));
  }else if(source.id==='news')for(const n of source.data.rows){const item=el('article');item.appendChild(link(n.title,n.url));item.appendChild(el('p',n.source+' · '+n.time,'sb-data-note'));if(n.summary)item.appendChild(el('p',n.summary));section.appendChild(item);}
  else section.appendChild(table(['항목','수집값'],Object.entries(source.data).map(([k,v])=>[({name:'기업명',market:'시장',industry:'업종',nation:'국가'})[k]||k,v])));
  if(source.data.note)section.appendChild(el('p',source.data.note,'sb-data-note'));
  return section;
 }
 async function openResearch(stock){
  if(!stock?.code)return;
  const seq=++researchSeq,drawer=document.getElementById('analysisDrawer'),body=document.getElementById('analysisDrawerBody'),title=document.getElementById('analysisDrawerTitle');if(!drawer||!body||!title)return;
  drawer.classList.add('open');document.getElementById('analysisOverlay')?.classList.add('open');title.textContent=(stock.name||stock.code)+' · 기업 리서치';body.classList.add('sb-research-body');body.replaceChildren();
  const controls=el('div',undefined,'sb-research-controls');const period=choice('시세·뉴스 수집 기간',[['1m','최근 1개월'],['3m','최근 3개월'],['1y','최근 1년']],'sbResearchPeriod','3m');controls.appendChild(period);
  const content=el('div');const status=el('p','자료 수집 전','sb-ai-status');body.append(controls,status,content);
  const collect=async()=>{
   const run=++researchSeq;status.textContent='기업 자료 수집 중…';content.replaceChildren();
   if(!api()?.aiResearch){status.textContent='기업 리서치 자료 수집은 데스크톱 앱 연결이 필요합니다.';return;}
   try{const r=await api().aiResearch({code:stock.code,period:period.value});if(run!==researchSeq||!drawer.classList.contains('open'))return;if(!r?.ok){status.textContent=r?.error||'자료 수집 실패';return;}
    title.textContent=r.bundle.name+' · 기업 리서치';status.textContent='수집 '+r.bundle.collectedAt+' · 시세·뉴스 기간 '+r.bundle.since+' 이후 · 재무는 원문 공시 기간';
    for(const source of r.bundle.evidence)content.appendChild(evidenceView(source));
    content.appendChild(el('p','AI 분석 결과와 분리된 근거 자료 페이지입니다. 없는 자료는 미수집으로 남깁니다.','sb-data-note'));
   }catch{if(run===researchSeq)status.textContent='기업 자료를 받지 못했습니다.';}
  };
  controls.appendChild(button('자료 다시 수집',collect));period.onchange=collect;
  if(seq===researchSeq)await collect();
 }
 function mount(){
  const section=document.querySelector('#sbAnalysis .sb-analysis-section');if(!section||!policy)return;section.replaceChildren();
  const title=el('div',undefined,'sb-region-title');title.append(el('h3','AI 분석'),el('span','종목 선택','sb-analysis-stock'));section.appendChild(title);
  section.appendChild(button('홈 연결',settings));const controls=el('div',undefined,'sb-ai-controls');
  controls.append(choice('분석 패턴',Object.entries(policy.patterns).map(([k,v])=>[k,v.label]),'sbAIPattern','stock'),choice('모델 선택',[['auto','홈 자동 선택'],['codex','Codex'],['claude','Claude']],'sbAIProvider','auto'));
  controls.appendChild(choice('분석 자료 기간',[['1m','1개월'],['3m','3개월'],['1y','1년']],'sbAIPeriod','3m'));
  const run=button('분석',analyze);run.id='sbAIRun';controls.appendChild(run);section.appendChild(controls);section.appendChild(button('분석 취소',cancel));
  const status=el('p','홈 연결 상태를 확인하고 분석을 실행하세요.','sb-ai-status');status.id='sbAIStatus';section.appendChild(status);
  const result=el('div',undefined,'sb-ai-result');result.id='sbAIResult';section.appendChild(result);
  const details=el('details');details.id='sbAiCheck';details.appendChild(el('summary','분석 규칙·상태'));
  const meta=el('p','생성 시각: -- · 분석 결과 없음');meta.id='sbAIMetadata';details.appendChild(meta);for(const rule of policy.rules)details.appendChild(el('p',rule));section.appendChild(details);
  renderResult(null);
  const settingsPage=document.querySelector('#settingsModal [data-page="ai"]');if(settingsPage){settingsPage.appendChild(el('h3','HOME AI 연결'));settingsPage.appendChild(el('p','HOME에 연결된 Codex·Claude를 재사용합니다. StockBook이 CLI에 다시 로그인하거나 인증 파일을 복사하지 않습니다.'));const status=el('p','홈 연결 확인 전','sb-ai-status');status.id='sbAIHomeStatus';settingsPage.appendChild(status);settingsPage.appendChild(button('홈 연결 확인',checkHome));}
  select(root.sbSelectedStock?.());
 }
 root.StockBookAI={select,openResearch,closeResearch:()=>{researchSeq++;},checkHome};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})(window);
