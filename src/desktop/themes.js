(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockBookThemes=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 // App-maintained investment themes, not an official industry taxonomy.
 // Exact security codes take precedence over historical name-based broad hints.
 const groups={
  '반도체':['제조','설계·IP','장비','소재','검사·패키징','세부분류 확인 필요'],
  '전기전자':['전자부품','디스플레이','가전','세부분류 확인 필요'],
  'AI·로봇':['인공지능','로봇','세부분류 확인 필요'],
  '인터넷·통신':['플랫폼·소프트웨어','통신','보안','데이터센터','세부분류 확인 필요'],
  '이차전지':['배터리','소재','장비','세부분류 확인 필요'],
  '자동차':['완성차','부품','세부분류 확인 필요'],
  '에너지·전력':['원자력','전력기기·전선','수소·가스','정유·석유화학','세부분류 확인 필요'],
  '바이오·의료':['제약·바이오','의료기기'],
  '방산·우주':['방위산업','항공우주'],
  '조선·운송':['조선·해양','항공·해운·물류'],
  '건설·기계':['건설','기계장비','세부분류 확인 필요'],
  '금융':['은행','보험','증권','세부분류 확인 필요'],
  '소비·유통':['식품·유통','소비재'],
  '문화·콘텐츠':['게임','엔터테인먼트'],
  '소재':['철강·금속','화학·소재'],
  '지주·부동산':['지주','부동산·리츠'],
  'ETF·ETN':['상장지수상품'],
  '분류 확인 필요':['미분류']
 };
 const codes={};
 function assign(group,leaf,list){for(const code of list.split(' '))codes[code]=[{group,leaf,basis:'종목 코드 관리분류'}];}
 assign('반도체','제조','005930 005935 000660 000990');
 assign('반도체','설계·IP','108320 094170 092600 394280 399720 396270');
 assign('반도체','장비','042700 036930 240810 084370 319660 083310 039440 039030 403870 089970');
 assign('반도체','소재','036830 357780 064760 183300 166090 014680 425040 005290');
 assign('반도체','검사·패키징','058470 095340 131970 067310 036540 033640 061970 089030 445680');
 assign('전기전자','가전','066570');
 assign('방산·우주','항공우주','047810');
 codes['012450']=[{group:'방산·우주',leaf:'방위산업',basis:'종목 코드 관리분류'},{group:'방산·우주',leaf:'항공우주',basis:'종목 코드 관리분류'}];
 const legacy={
  '반도체':['반도체',null],'전기전자/반도체':['전기전자','세부분류 확인 필요'],'전자부품':['전기전자','전자부품'],'디스플레이':['전기전자','디스플레이'],
  '인공지능/로봇':['AI·로봇',null],'4차산업':['AI·로봇',null],'IT/플랫폼':['인터넷·통신','플랫폼·소프트웨어'],'통신/보안/서버':['인터넷·통신',null],
  '이차전지/배터리':['이차전지',null],'자동차':['자동차',null],'원자력/에너지':['에너지·전력',null],'수소/가스':['에너지·전력','수소·가스'],'석유에너지':['에너지·전력','정유·석유화학'],
  '제약/바이오':['바이오·의료','제약·바이오'],'의료장비':['바이오·의료','의료기기'],'방위산업':['방산·우주','방위산업'],'항공우주':['방산·우주','항공우주'],
  '조선/해양산업':['조선·운송','조선·해양'],'운송':['조선·운송','항공·해운·물류'],'건설/기계장비':['건설·기계',null],'금융/은행':['금융',null],
  '소비재':['소비·유통','소비재'],'식품/유통':['소비·유통','식품·유통'],'게임':['문화·콘텐츠','게임'],'엔터테인먼트':['문화·콘텐츠','엔터테인먼트'],
  '철강/금속':['소재','철강·금속'],'화학/소재':['소재','화학·소재'],'지주':['지주·부동산','지주'],'부동산/임대':['지주·부동산','부동산·리츠'],'ETF/인덱스':['ETF·ETN','상장지수상품']
 };
 const rules=[
  ['반도체','설계·IP',/팹리스|반도체\s*설계|반도체\s*ip/i],['반도체','장비',/반도체\s*장비|웨이퍼\s*장비/i],['반도체','소재',/반도체\s*소재|웨이퍼\s*소재/i],['반도체','검사·패키징',/반도체\s*(검사|패키징|테스트)/i],['반도체','제조',/메모리\s*반도체|반도체\s*제조|파운드리/i],
  ['이차전지','장비',/(이차전지|2차전지|배터리)\s*장비/i],['이차전지','소재',/(이차전지|2차전지|배터리)\s*소재/i],
  ['AI·로봇','인공지능',/인공지능/i],['AI·로봇','로봇',/로봇/i],['인터넷·통신','보안',/정보보안|보안솔루션/i],['인터넷·통신','데이터센터',/데이터센터/i],
  ['자동차','완성차',/완성차/i],['자동차','부품',/자동차\s*부품/i],['금융','보험',/보험/i],['금융','증권',/증권/i],['금융','은행',/은행/i],
  ['에너지·전력','원자력',/원자력|핵연료/i],['에너지·전력','전력기기·전선',/전력기기|변압기|전선/i],['건설·기계','건설',/건설업/i],['건설·기계','기계장비',/기계장비|중장비/i]
 ];
 function classify(stock,broadHint){
  const name=String(stock.name||'').replace(/\s/g,''),type=String(stock.stockType||stock.stockEndType||'');
  if(/ETF|ETN/i.test(type)||/^(KIWOOM|KODEX|TIGER|KINDEX|KBSTAR|ACE|PLUS|SOL|HANARO|ARIRANG|KOSEF|TIMEFOLIO|RISE|히어로즈|마이티)/i.test(name))return [{group:'ETF·ETN',leaf:'상장지수상품',basis:'상품 구분'}];
  if(codes[stock.code])return codes[stock.code].map(p=>({...p}));
  const industry=String(stock.industry||'');const matches=rules.filter(r=>r[2].test(industry)).map(([group,leaf])=>({group,leaf,basis:'수신 업종 키워드'}));
  if(matches.length)return matches;
  const hint=legacy[broadHint];
  if(hint)return [{group:hint[0],leaf:hint[1]||'세부분류 확인 필요',basis:'기존 키워드 추정'}];
  return [{group:'분류 확인 필요',leaf:'미분류',basis:'업종·테마 정보 미확인'}];
 }
 function index(stocks,getHint=()=>null){
  const seen=new Set();return stocks.filter(s=>s&&s.code&&!seen.has(s.code)&&seen.add(s.code)).map(stock=>({stock,paths:classify(stock,getHint(stock))}));
 }
 return Object.freeze({groups,classify,index});
});
