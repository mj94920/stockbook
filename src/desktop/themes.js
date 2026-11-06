(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./industry-data.js'):root.StockBookIndustryData);if(typeof module==='object'&&module.exports)module.exports=api;else root.StockBookThemes=api;})(typeof window==='object'?window:globalThis,function(data){
 'use strict';
 // Navigation bundles are app labels. Leaves and membership are source-provided industries.
 const bundles={
  '반도체':['반도체와반도체장비'],
  'IT·전자':['IT서비스','소프트웨어','전자장비와기기','전자제품','컴퓨터와주변기기','사무용전자제품','핸드셋','통신장비','디스플레이패널','디스플레이장비및부품'],
  '통신':['무선통신서비스','다각화된통신서비스'],
  '인터넷·미디어':['양방향미디어와서비스','게임엔터테인먼트','방송과엔터테인먼트','광고','출판'],
  '자동차':['자동차','자동차부품'],
  '에너지·전력':['석유와가스','에너지장비및서비스','전기장비','전기제품','전기유틸리티','가스유틸리티','복합유틸리티'],
  '바이오·의료':['제약','생물공학','건강관리장비와용품','건강관리기술','건강관리업체및서비스','생명과학도구및서비스'],
  '방산·우주':['우주항공과국방'],
  '조선·운송':['조선','항공사','해운사','항공화물운송과물류','도로와철도운송','운송인프라'],
  '건설·기계':['건설','건축자재','건축제품','기계'],
  '금융':['은행','증권','생명보험','손해보험','카드','창업투자','기타금융'],
  '식품·생활':['식품','음료','담배','가정용품','가정용기기와용품','가구','화장품','문구류','섬유,의류,신발,호화품'],
  '유통·무역':['백화점과일반상점','전문소매','식품과기본식료품소매','인터넷과카탈로그소매','판매업체','무역회사와판매업체'],
  '여가·교육':['호텔,레스토랑,레저','레저용장비와제품','다각화된소비자서비스','교육서비스'],
  '소재':['화학','철강','비철금속','포장재','종이와목재'],
  '사업서비스':['상업서비스와공급품'],
  '지주·부동산':['복합기업','부동산']
 };
 const groups=Object.fromEntries(Object.keys(bundles).map(g=>[g,[]])),industries=new Map(),members=new Map(),excluded=new Set();
 for(const [code,name] of data?.industries||[]){
  const parent=Object.keys(bundles).find(g=>bundles[g].includes(name));
  // Never silently drop an upstream industry if a future snapshot adds one.
  const group=parent||'그 외 업종';if(!groups[group])groups[group]=[];groups[group].push(name);
  industries.set(code,{group,leaf:name,industryCode:code,basis:(data.source||'업종 원본')+' · '+data.asOf});
 }
 for(const [code,name,market,industryCode] of data?.members||[])if(industries.has(industryCode))members.set(code,{code,name,market,industryCode,stockEndType:market==='KONEX'?'konex':'stock'});
 for(const [code] of data?.excluded||[])excluded.add(code);
 groups['분류 확인 필요']=['원본 미확인'];
 function isExcluded(stock){
  if(excluded.has(stock.code))return true;
  return [stock.stockType,stock.stockEndType,stock.productType,stock.securityType].some(t=>typeof t==='string'&&/^(ETF|ETN|ELS|ELW|DLS|FUND|펀드|수익증권)$/i.test(t.trim()));
 }
 function classify(stock){
  if(!stock||isExcluded(stock))return [];
  const member=members.get(stock.code),path=member&&industries.get(member.industryCode);
  return path?[{...path}]:[{group:'분류 확인 필요',leaf:'원본 미확인',basis:'기준일 이후 신규·변경 종목 또는 원본 미수록'}];
 }
 function index(stocks=[],{complete=false}={}){
  const all=new Map(complete?[...members].map(([code,s])=>[code,{...s}]):[]);
  for(const stock of stocks){
   if(!stock||typeof stock.code!=='string'||!/^[0-9A-Z]{6}$/.test(stock.code))continue;
   if(isExcluded(stock)){all.delete(stock.code);continue;}
   const prior=all.get(stock.code)||members.get(stock.code)||{};
   all.set(stock.code,{...prior,...stock});
  }
  return [...all.values()].map(stock=>({stock,paths:classify(stock)})).filter(r=>r.paths.length);
 }
 return Object.freeze({groups,classify,index,isExcluded,asOf:data?.asOf||'',source:data?.source||'',size:members.size,industryCount:industries.size});
});
