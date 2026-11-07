(function(root){
 'use strict';
 const policy=root.StockBookAIPolicy;
 let selected=null,selection=0,busy=false,researchSeq=0,lastResult=null,lastBundle=null,homeReady=false,homeSequence=0;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const n=el('button',text,'sb-btn sb-btn--sm');n.type='button';n.onclick=fn;return n;};
 const api=()=>root.electronAPI;
 const current=()=>({code:selected?.code,period:document.getElementById('sbAIPeriod')?.value||'3m',pattern:document.getElementById('sbAIPattern')?.value||'stock',provider:document.getElementById('sbAIProvider')?.value||'auto'});
 function choice(label,entries,id,value){const s=el('select',undefined,'sb-select');s.id=id;s.setAttribute('aria-label',label);for(const [key,text] of entries){const o=el('option',text);o.value=key;s.appendChild(o);}s.value=value;return s;}
 function field(label,input){const wrap=el('label',undefined,'sb-ai-field');wrap.append(el('span',label),input);return wrap;}
 function link(text,url){try{const u=new URL(url);if(u.protocol!=='https:')throw Error();const a=el('a',text);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return el('span',text);}}
 function format(v){return v===null||v===undefined||v===''?'자료 없음':typeof v==='object'?JSON.stringify(v):String(v);}
 function stamp(v){if(!v)return '미제공';const text=String(v);if(/^\d{4}(-\d{2})?(-\d{2})?$/.test(text))return text;const d=new Date(text);return Number.isNaN(d.getTime())?text:d.toLocaleString('ko-KR');}
 function quality(source){
  if(source.status!=='received')return {label:'미수집',kind:'missing'};
  if(!source.asOf)return {label:'기준일 확인',kind:'check'};
  if(source.id==='finance'&&(source.data?.rows||[]).some(r=>!r.unit))return {label:'단위 확인',kind:'check'};
  if(source.id==='prices'&&source.data?.metadata?.lastBarComplete!==true)return {label:'마지막 봉 확인',kind:'check'};
  return {label:'수신',kind:'received'};
 }
 function badge(text,kind='neutral'){const node=el('span',text,'sb-evidence-badge');node.dataset.state=kind;return node;}
 function updateRun(){const run=document.getElementById('sbAIRun'),cancel=document.getElementById('sbAICancel');if(run)run.disabled=busy||!selected||!homeReady;if(cancel)cancel.disabled=!busy;}
 function updateData(){
  const host=document.getElementById('sbAIDataStatus');if(!host)return;host.replaceChildren();
  if(!lastBundle||lastBundle.code!==selected?.code){host.append(badge('자료 확인 전','check'),el('span','리서치에서 수집 범위와 출처를 먼저 확인하세요.'));return;}
  const records=lastBundle.evidence||[],received=records.filter(s=>s.status==='received').length,check=records.filter(s=>quality(s).kind==='check').length;
  const required=policy.patterns[current().pattern].needs,ids=new Set(records.filter(s=>s.status==='received').map(s=>s.id)),missing=[...new Set([...(lastBundle.missing||[]),...required.filter(id=>!ids.has(id))])];
  const mismatch=lastBundle.period!==current().period;
  host.append(badge(mismatch?'수집 범위 확인':'수신 '+received+'개',mismatch?'check':'neutral'),el('span',(mismatch?'선택 범위와 리서치 수집 범위가 다릅니다. · ':'')+(check?'기준 확인 '+check+'개 · ':'')+'필요 자료 확인 '+missing.length+'개'+(missing.length?' · '+missing.map(id=>policy.labels[id]||id).join(' · '):'')));
 }
 function settings(){root.openSettings?.();root.settingsGo?.('ai');checkHome();}
 async function checkHome(){
  const id=++homeSequence;homeReady=false;updateRun();
  const show=(text,kind)=>{for(const target of ['sbAIHomeStatus','sbAIConnection']){const node=document.getElementById(target);if(node){node.textContent=text;node.dataset.state=kind;}}};
  show('HOME 연결 상태 확인 중…','check');
  if(!api()?.aiStatus){show('HOME 연결 상태 미확인 · 데스크톱에서 확인하세요.','check');return;}
  try{const r=await api().aiStatus();if(id!==homeSequence)return;
   homeReady=!!(r?.ok&&r.configured&&r.providers?.some(p=>p.connected));
   const text=!r?.ok?(r?.error||'HOME 연결 확인 실패'):!r.configured?(r.message||'HOME 연동 경로 확인 필요'):r.providers.map(p=>(p.id==='codex'?'Codex':'Claude')+' '+(p.connected?'연결됨':'연결 확인 필요')).join(' · ');
   show(text,homeReady?'received':'check');
  }catch{if(id===homeSequence)show('HOME 연결 상태를 확인하지 못했습니다.','check');}
  finally{if(id===homeSequence)updateRun();}
 }
 function refs(parent,ids,bundle){for(const id of ids||[]){const source=bundle.evidence.find(s=>s.id===id);if(source){const a=link(source.title+' ↗',source.url);a.classList.add('sb-ai-source');parent.appendChild(a);}}}
 function journal(){if(selected)root.sbDesktopAction?.('journal');}
 function renderResult(value){
  const host=document.getElementById('sbAIResult');if(!host)return;host.replaceChildren();
  if(!value){const empty=el('div',undefined,'sb-ai-empty');empty.append(el('strong','근거를 확인하고 해석을 검토합니다.'),el('p','자료 수집 → 기업 리서치 → HOME 분석 → 사용자 판단 기록'),el('small','모델을 실행하지 않은 상태입니다. 연결 확인이나 화면 열기만으로 분석을 요청하지 않습니다.'));host.append(empty);return;}
  const intro=el('section',undefined,'sb-ai-summary');intro.append(badge('AI 해석'),el('p',value.result.summary));host.append(intro);
  const facts=el('details',undefined,'sb-ai-evidence');facts.append(el('summary','분석에 사용한 근거 '+value.bundle.evidence.length+'개'));
  for(const source of value.bundle.evidence){const row=el('div');row.append(link(source.title+' ↗',source.url),el('span','기준 '+stamp(source.asOf)));facts.append(row);}host.append(facts);
  for(const [key,title]of [['interpretations','해석과 가설'],['risks','위험과 자료 한계']]){const section=el('section',undefined,'sb-ai-result-section');section.append(el('h4',title));for(const entry of value.result[key]){section.append(el('p',entry.text));refs(section,entry.evidenceIds,value.bundle);}host.append(section);}
  const options=el('section',undefined,'sb-ai-result-section');options.append(el('h4','검토할 선택지'),el('p','투자 판단과 매매 결정은 사용자가 합니다.','sb-data-note'));
  for(const option of value.result.options){const article=el('article');article.append(el('strong',option.title));for(const [label,key]of [['이유','reason'],['위험','risk'],['다시 확인할 조건','reviewWhen']])article.append(el('p',label+': '+option[key]));refs(article,option.evidenceIds,value.bundle);options.append(article);}host.append(options);
  if(value.result.missing.length)host.append(el('p','미수집·확인 필요: '+value.result.missing.map(id=>policy.labels[id]||id).join(' · '),'sb-ai-missing'));
  for(const question of value.result.questions)host.append(el('p','확인 질문: '+question));
  host.append(button('내 판단 기록하기',journal));
  const meta=document.getElementById('sbAIMetadata');if(meta)meta.textContent='생성 '+stamp(value.createdAt)+' · 모델 '+value.provider+' · '+policy.patterns[value.pattern].label;
 }
 async function analyze(){
  const status=document.getElementById('sbAIStatus');if(busy)return;
  if(!selected){status.textContent='먼저 종목을 선택하세요.';return;}
  if(!homeReady||!api()?.aiAnalyze){status.textContent='HOME 연결 상태를 먼저 확인하세요.';return;}
  const token=selection,input=current();busy=true;updateRun();status.textContent='자료 수집 및 HOME 분석 요청 중…';
  try{const r=await api().aiAnalyze(input);if(token!==selection)return;if(!r?.ok){status.textContent=r?.error||'분석 요청 실패';return;}lastResult=r;lastBundle=r.bundle;updateData();renderResult(r);status.textContent='수집 근거에 대한 해석입니다. 선택지는 사용자 결정 전 제안입니다.';}
  catch{if(token===selection)status.textContent='HOME 분석 응답을 받지 못했습니다.';}
  finally{busy=false;updateRun();}
 }
 async function cancel(){const status=document.getElementById('sbAIStatus');if(status)status.textContent='HOME에 취소 요청 중…';try{const r=await api()?.aiCancel();if(status)status.textContent=r?.confirmed?'HOME에서 취소를 확인했습니다.':'취소 요청을 보냈습니다. HOME의 실행 상태를 확인하세요.';}catch{if(status)status.textContent='취소 상태를 HOME에서 확인하세요.';}}
 function select(stock){
  const label=document.querySelector('#sbAnalysis .sb-analysis-section .sb-analysis-stock');if(label)label.textContent=stock?(stock.name||stock.ticker||stock.code):'종목 선택';
  const next=stock?.ticker||stock?.code||null;if(next===(selected?.code||null))return;
  selected=next?{code:next,name:stock.name||next}:null;selection++;lastResult=null;lastBundle=null;
  if(busy)cancel();renderResult(null);updateData();updateRun();checkHome();
  const meta=document.getElementById('sbAIMetadata');if(meta)meta.textContent='생성 시각: -- · 분석 결과 없음';
 }
 function table(headers,rows){const t=el('table',undefined,'sb-research-table');const head=el('thead'),tr=el('tr');for(const h of headers)tr.append(el('th',h));head.append(tr);t.append(head);const body=el('tbody');for(const row of rows){const tr=el('tr');for(const cell of row)tr.append(el('td',format(cell)));body.append(tr);}t.append(body);return t;}
 function coverage(source){
  if(source.id==='finance')return '원문 결산기간 · '+((source.data?.rows||[]).some(r=>!r.unit)?'단위 확인 필요':'제공 단위');
  if(source.id==='news')return '최신 '+(source.data?.rows?.length||0)+'건 · 기간 전체 전수 조사 아님';
  if(source.id==='prices')return '수신 '+(source.data?.receivedCount??'—')+'봉 / 범위 내 '+(source.data?.periodCount??'—')+'봉';
  return '공급자 원문 기준';
 }
 function evidenceView(source){
  const section=el('section',undefined,'sb-research-source');section.dataset.source=source.id;
  const heading=el('div',undefined,'sb-research-source-head'),q=quality(source);heading.append(el('h3',source.title),badge(q.label,q.kind),link('출처 확인 ↗',source.url));section.append(heading);
  const meta=el('dl',undefined,'sb-research-source-meta');for(const [label,text]of [['기준일',stamp(source.asOf)],['수집 시각',stamp(source.fetchedAt)],['수집 범위·단위',coverage(source)]])meta.append(el('dt',label),el('dd',text));section.append(meta);
  if(source.status!=='received'){section.append(el('p','자료를 받지 못했습니다. 이 항목을 근거로 판단하지 않습니다.','sb-ai-missing'));return section;}
  if(source.id==='finance')section.append(table(['지표·단위','공시 기간별 값'],source.data.rows.map(r=>[r.metric+(r.unit?' ('+r.unit+')':' · 단위 확인 필요'),r.values.map(v=>v.period+': '+v.value+(v.estimate?' (예상)':'')).join(' / ')])));
  else if(source.id==='prices'){
   section.append(table(['주기','기준일','종가 · 단위 원문 확인','기본 이동평균'],Object.entries(source.data.indicators).map(([cycle,value])=>[({day:'일봉',week:'주봉',month:'월봉',year:'연봉'})[cycle],value.last.date,value.last.close,value.averages.map(a=>a.period+': '+(a.value===null?'이력 부족':Math.round(a.value).toLocaleString('ko-KR'))).join(' / ')])));
   section.append(el('p',(source.data.metadata.priceAdjustment||'가격 조정 기준 미확인')+' · 마지막 봉 완성 여부 '+(source.data.metadata.lastBarComplete===true?'확인':'미확인'),'sb-data-note'));
  }else if(source.id==='news')for(const n of source.data.rows){const item=el('article',undefined,'sb-research-news');item.append(link(n.title,n.url),el('p',n.source+' · '+stamp(n.time),'sb-data-note'));if(n.summary)item.append(el('p',n.summary));section.append(item);}
  else section.append(table(['항목','수집값'],Object.entries(source.data).filter(([k])=>k!=='note').map(([k,v])=>[({name:'기업명',market:'시장',industry:'업종',nation:'국가'})[k]||k,v])));
  if(source.id==='industry')section.append(el('p','업종과 사용자 테마는 별개입니다. ETF·ETN은 기업 업종 분류 대상에서 제외합니다.','sb-data-note'));
  if(source.data.note)section.append(el('p',source.data.note,'sb-data-note'));
  return section;
 }
 function renderResearch(bundle,content){
  content.replaceChildren();
  const sources=bundle.evidence||[],received=sources.filter(s=>s.status==='received').length,checks=sources.filter(s=>quality(s).kind==='check').length;
  const health=el('section',undefined,'sb-data-health');health.append(el('strong','이번 리서치의 자료 상태'),badge('수신 '+received+' / '+sources.length),badge('기준 확인 '+checks,checks?'check':'neutral'),badge('미수집 '+(bundle.missing||[]).length,(bundle.missing||[]).length?'missing':'neutral'));content.append(health);
  const scope=el('p','시세·뉴스는 '+bundle.since+' 이후 수신 범위입니다. 재무는 원문 공시 기간이며 자동 갱신 자료가 아닙니다.','sb-data-note');content.append(scope);
  if(bundle.missing?.length)content.append(el('p','이 입력에 포함되지 않은 자료: '+bundle.missing.map(id=>policy.labels[id]||id).join(' · '),'sb-ai-missing'));
  const layout=el('div',undefined,'sb-research-layout'),nav=el('nav',undefined,'sb-research-nav'),articles=el('div',undefined,'sb-research-articles');nav.setAttribute('aria-label','리서치 자료 분류');
  const sections=sources.map(evidenceView);const filters=[];
  const choose=id=>{for(const section of sections)section.hidden=!!id&&section.dataset.source!==id;for(const item of filters){const active=item.code===id;item.button.classList.toggle('active',active);item.button.setAttribute('aria-pressed',String(active));}};
  for(const [code,text]of [['','전체 자료'],...sources.map(s=>[s.id,s.title])]){const item=button(text,()=>choose(code));filters.push({code,button:item});nav.append(item);}
  articles.append(...sections);layout.append(nav,articles);content.append(layout);choose('');
  content.append(el('p','AI 해석과 분리된 근거 자료입니다. 수신은 완전성·최신성·이용 권한의 검증 완료를 뜻하지 않습니다.','sb-data-note'));
 }
 function researchToAI(stock,bundle){root.sbSelectInstrument?.(stock.code,stock.name);if(bundle?.code===stock.code){lastBundle=bundle;const period=document.getElementById('sbAIPeriod');if(period&&['1m','3m','1y'].includes(bundle.period))period.value=bundle.period;updateData();}root.closeAnalysisDrawer?.();document.getElementById('sbAnalysis')?.scrollIntoView({block:'nearest'});document.getElementById('sbAIPattern')?.focus({preventScroll:true});}
 async function openResearch(stock){
  if(!stock?.code)return;
  let viewedBundle=null;
  const seq=++researchSeq,drawer=document.getElementById('analysisDrawer'),body=document.getElementById('analysisDrawerBody'),title=document.getElementById('analysisDrawerTitle');if(!drawer||!body||!title)return;
  drawer.classList.add('open','sb-research-drawer');document.getElementById('analysisOverlay')?.classList.add('open');title.textContent=(stock.name||stock.code)+' · 기업 리서치';body.classList.add('sb-research-body');body.replaceChildren();
  const intro=el('header',undefined,'sb-research-intro');intro.append(el('span','RESEARCH / '+stock.code,'sb-research-eyebrow'),el('h2',(stock.name||stock.code)+'의 자료와 출처'),el('p','한 종목의 자료 범위·기준일·출처를 확인하고 AI 검토로 이어갑니다.'));
  const flow=el('ol',undefined,'sb-research-flow');for(const [i,label]of ['자료 수집','기업 리서치','HOME AI 검토','내 판단 기록'].entries()){const item=el('li');item.append(el('span',String(i+1)),el('strong',label));if(i===1)item.setAttribute('aria-current','step');flow.append(item);}intro.append(flow);body.append(intro);
  const controls=el('div',undefined,'sb-research-controls'),period=choice('시세·뉴스 수집 기간',[['1m','최근 1개월'],['3m','최근 3개월'],['1y','최근 1년']],'sbResearchPeriod','3m');controls.append(field('시세·뉴스 범위',period));
  const content=el('div'),status=el('p','자료 수집 전','sb-ai-status');status.setAttribute('role','status');body.append(controls,status,content);
  const collect=async()=>{
   const run=++researchSeq;viewedBundle=null;status.textContent='기업 자료 수집 중…';content.replaceChildren();
   if(!api()?.aiResearch){status.textContent='기업 리서치 자료 수집은 데스크톱 앱 연결이 필요합니다.';return;}
   try{const r=await api().aiResearch({code:stock.code,period:period.value});if(run!==researchSeq||!drawer.classList.contains('open'))return;if(!r?.ok){status.textContent=r?.error||'자료 수집 실패';return;}
    viewedBundle=r.bundle;title.textContent=r.bundle.name+' · 기업 리서치';status.textContent='수집 '+stamp(r.bundle.collectedAt)+' · 재무는 원문 공시 기간';renderResearch(r.bundle,content);
    if(selected?.code===r.bundle.code){lastBundle=r.bundle;updateData();}
   }catch{if(run===researchSeq)status.textContent='기업 자료를 받지 못했습니다.';}
  };
  controls.append(button('자료 다시 수집',collect),button('이 종목 AI 검토',()=>researchToAI(stock,viewedBundle)));period.onchange=collect;
  if(seq===researchSeq)await collect();
 }
 function mount(){
  const section=document.querySelector('#sbAnalysis .sb-analysis-section');if(!section||!policy)return;section.replaceChildren();section.classList.add('sb-ai-workbench');
  const title=el('div',undefined,'sb-region-title');title.append(el('h3','AI 분석'),el('span','종목 선택','sb-analysis-stock'));section.append(title);
  const connection=el('div',undefined,'sb-ai-connection');connection.append(el('span','HOME','sb-ai-eyebrow'));const connectionStatus=el('p','연결 상태 미확인');connectionStatus.id='sbAIConnection';connectionStatus.setAttribute('role','status');connection.append(connectionStatus,button('홈 연결',settings));section.append(connection);
  const data=el('div',undefined,'sb-ai-data-status');data.id='sbAIDataStatus';section.append(data,button('선택 종목 리서치',()=>selected&&openResearch(selected)));
  const controls=el('div',undefined,'sb-ai-controls');const pattern=choice('분석 패턴',Object.entries(policy.patterns).map(([k,v])=>[k,v.label]),'sbAIPattern','stock');
  controls.append(field('점검 주기·목적',pattern),field('HOME 모델 선호',choice('모델 선택',[['auto','HOME 자동 선택'],['codex','Codex'],['claude','Claude']],'sbAIProvider','auto')),field('시세·뉴스 범위',choice('분석 자료 기간',[['1m','1개월'],['3m','3개월'],['1y','1년']],'sbAIPeriod','3m')));section.append(controls);
  const focus=el('p',policy.patterns.stock.focus,'sb-ai-focus');focus.id='sbAIFocus';pattern.onchange=()=>{focus.textContent=policy.patterns[pattern.value].focus;updateData();};document.getElementById('sbAIPeriod').onchange=updateData;section.append(focus);
  const actions=el('div',undefined,'sb-ai-actions'),run=button('근거 수집 후 분석',analyze),stop=button('분석 취소',cancel);run.id='sbAIRun';run.classList.add('sb-btn--primary');stop.id='sbAICancel';actions.append(run,stop);section.append(actions);
  const status=el('p','모델 선택과 사용량은 HOME의 기존 연결을 따릅니다.','sb-ai-status');status.id='sbAIStatus';status.setAttribute('role','status');section.append(status);
  const result=el('div',undefined,'sb-ai-result');result.id='sbAIResult';section.append(result);
  const details=el('details');details.id='sbAiCheck';details.append(el('summary','분석 규칙·생성 정보'));const meta=el('p','생성 시각: -- · 분석 결과 없음');meta.id='sbAIMetadata';details.append(meta);for(const rule of policy.rules)details.append(el('p',rule));section.append(details);
  renderResult(null);updateData();updateRun();
  const settingsPage=document.querySelector('#settingsModal [data-page="ai"]');if(settingsPage){settingsPage.append(el('h3','HOME AI 연결'),el('p','HOME에 연결된 Codex·Claude를 재사용합니다. StockBook이 CLI에 다시 로그인하거나 인증 파일을 복사하지 않습니다.'));const home=el('p','홈 연결 확인 전','sb-ai-status');home.id='sbAIHomeStatus';settingsPage.append(home,button('홈 연결 확인',checkHome));}
  select(root.sbSelectedStock?.());checkHome();
 }
 root.StockBookAI={select,openResearch,closeResearch:()=>{researchSeq++;document.getElementById('analysisDrawer')?.classList.remove('sb-research-drawer');document.getElementById('analysisDrawerBody')?.classList.remove('sb-research-body');},checkHome};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})(window);
