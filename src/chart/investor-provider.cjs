'use strict';
const {stockCode}=require('./provider.cjs');
function quantity(value){
 if(typeof value==='number'&&Number.isSafeInteger(value))return value;
 if(typeof value==='string')value=value.trim();
 if(typeof value!=='string'||!/^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value))throw Error('순매수 수량 오류');
 const n=Number(value.replaceAll(',',''));if(!Number.isSafeInteger(n))throw Error('순매수 수량 범위 오류');return n;
}
function parseInvestors(body,code,fetchedAt){
 stockCode(code);if(typeof body!=='string'||body.length>2000000)throw Error('수급 응답 형식 오류');
 const data=JSON.parse(body),today=new Date(Date.parse(fetchedAt)+9*3600000).toISOString().slice(0,10),seen=new Set(),rows=[];let omittedRows=0;
 if(data.rt_cd!=='0'){const code=typeof data.msg_cd==='string'&&/^[A-Z0-9_-]{1,24}$/.test(data.msg_cd)?data.msg_cd:'KIS_RESPONSE';throw Object.assign(Error('KIS 수급 응답 오류 ('+code+')'),{safeCode:code});}
 if(!Array.isArray(data.output)||data.output.length>100)throw Object.assign(Error('KIS 수급 응답 형식 오류'),{safeCode:'KIS_FORMAT'});
 // This endpoint normally has no code echo. Bind the validated fixed request code;
 // if a response does include an identifier, reject contradictory identifiers.
 for(const value of [data.stockCode,data.output1?.stck_shrn_iscd])if(value!==undefined&&value!==code)throw Error('수급 종목 불일치');
 for(const row of data.output){
  if(!row?.stck_bsop_date&&Object.values(row||{}).every(v=>v===''||v===null))continue;
  if(row?.stck_shrn_iscd!==undefined&&row.stck_shrn_iscd!==code)throw Error('수급 종목 불일치');
  const raw=row?.stck_bsop_date;if(typeof raw!=='string'||!/^\d{8}$/.test(raw))throw Error('수급 날짜 오류');
  const date=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6);
  if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>today||seen.has(date))throw Error('수급 날짜 오류');seen.add(date);
  if([row.frgn_ntby_qty,row.orgn_ntby_qty,row.prsn_ntby_qty].some(value=>value===null||value===undefined||(typeof value==='string'&&!value.trim()))){omittedRows++;continue;}
  rows.push({date,foreign:quantity(row.frgn_ntby_qty),institution:quantity(row.orgn_ntby_qty),individual:quantity(row.prsn_ntby_qty)});
 }
 if(!rows.length)throw Object.assign(Error('수급 자료 없음'),{safeCode:'KIS_EMPTY'});rows.sort((a,b)=>a.date.localeCompare(b.date));
 require('./series.js').investorSeries(rows);
 return {ok:true,stockCode:code,source:'KIS',market:'KRX',unit:'주',fetchedAt,omittedRows,rows};
}
function parseNaverInvestors(body,code,fetchedAt){
 stockCode(code);if(typeof body!=='string'||body.length>4000000)throw Error('네이버 수급 응답 형식 오류');
 const data=JSON.parse(body);if(data.itemCode!==code||!Array.isArray(data.dealTrendInfos)||data.dealTrendInfos.length>100)throw Error('네이버 수급 종목/응답 오류');
 const output=data.dealTrendInfos.map(row=>{if(row.itemCode!==code)throw Error('네이버 수급 종목 불일치');return {stck_bsop_date:row.bizdate,frgn_ntby_qty:row.foreignerPureBuyQuant,orgn_ntby_qty:row.organPureBuyQuant,prsn_ntby_qty:row.individualPureBuyQuant};});
 const parsed=parseInvestors(JSON.stringify({rt_cd:'0',stockCode:code,output}),code,fetchedAt);
 return {...parsed,source:'Naver',market:'provider'};
}
function parseDailyInvestors(body,code,fetchedAt){
 if(typeof body!=='string'||body.length>2000000)throw Error('수급 응답 형식 오류');
 const data=JSON.parse(body);
 if(data.rt_cd==='0'&&!Array.isArray(data.output2))throw Error('일별 수급 응답 형식 오류');
 return {...parseInvestors(JSON.stringify({...data,output:data.output2}),code,fetchedAt),endpoint:'investor-trade-by-stock-daily'};
}
function createInvestorProvider({httpsGet,getAuth,now=()=>Date.now(),timeoutMs=8000,naverFallback=false,fallbackTimeoutMs=5000}){
 const history=require('./history.cjs').createHistory({httpsGet,getAuth,now,timeoutMs,kind:'수급',pageSize:30,defaultCount:30,
  request:(code,end)=>({url:'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily?'+new URLSearchParams({FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,FID_INPUT_DATE_1:end,FID_ORG_ADJ_PRC:'',FID_ETC_CLS_CODE:''}),tr:'FHPTJ04160001'}),parse:parseDailyInvestors});
 const fallbackCache=new Map();
 return {async get(code,options){
  try{stockCode(code);const count=require('./history.cjs').countOption(options,30),key=code+':'+count,old=fallbackCache.get(key);if(old&&now()-old.at<60000)return old.task;const primary=await history.get(code,options);if(primary.ok||!naverFallback)return primary;
   const entry={at:now(),task:null};entry.task=(async()=>{const controller=new AbortController();let timer;
    try{const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('네이버 수급 시간 초과'));},fallbackTimeoutMs);});
     const body=await Promise.race([httpsGet('https://m.stock.naver.com/api/stock/'+code+'/integration',fallbackTimeoutMs,{'Referer':'https://m.stock.naver.com/'},{signal:controller.signal}),deadline]);
     const parsed=parseNaverInvestors(body,code,new Date(now()).toISOString()),rows=parsed.rows.slice(-count);
     return {...parsed,rows,requestedCount:count,receivedCount:rows.length,partial:rows.length<count,primaryError:primary.error,primaryErrorCode:primary.errorCode};
    }catch{return {ok:false,error:primary.error+' · 네이버 수급도 불러오지 못했습니다. 다시 조회해 주세요.',errorCode:primary.errorCode};}finally{clearTimeout(timer);}
   })();fallbackCache.set(key,entry);while(fallbackCache.size>20)fallbackCache.delete(fallbackCache.keys().next().value);const result=await entry.task;if(!result.ok)fallbackCache.delete(key);return result;
  }catch{return {ok:false,error:'조회 종목·건수 또는 수급 자료를 확인하세요.'};}
 }};
}
module.exports={parseInvestors,parseDailyInvestors,parseNaverInvestors,createInvestorProvider};
