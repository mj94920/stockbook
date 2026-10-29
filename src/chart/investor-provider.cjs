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
function createInvestorProvider({httpsGet,getAuth,now=()=>Date.now(),timeoutMs=8000,naverFallback=false,fallbackTimeoutMs=5000}){
 const cache=new Map();
 return {async get(code){
  try{
   stockCode(code);const old=cache.get(code);if(old&&now()-old.at<60000)return await old.task;
   const entry={at:now(),task:null};entry.task=(async()=>{
    const controller=new AbortController();let timer;
    try{
     const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('수급 수신 시간 초과'),{safeCode:'KIS_TIMEOUT'}));},timeoutMs);});
     const request=(async()=>{
      const auth=await getAuth();if(!auth)return {ok:false,error:'KIS 연결 후 투자자별 순매수를 조회할 수 있습니다.',errorCode:'KIS_AUTH'};if(controller.signal.aborted)throw Error('수급 수신 시간 초과');
      const params=new URLSearchParams({FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code});
      const body=await httpsGet('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor?'+params,timeoutMs,{authorization:'Bearer '+auth.token,appkey:auth.appKey,appsecret:auth.appSecret,tr_id:'FHKST01010900',custtype:'P'},{signal:controller.signal});
      return parseInvestors(body,code,new Date(now()).toISOString());
     })();return await Promise.race([request,deadline]);
    }finally{clearTimeout(timer);}
   })().catch(error=>{const code=error?.safeCode||(/^HTTP \d{3}$/.test(error?.message||'')?error.message.replace(' ','_'):'KIS_FORMAT_OR_NETWORK');return {ok:false,error:'KIS 수급을 불러오지 못했습니다. ('+code+')',errorCode:code};}).then(async primary=>{
    if(primary.ok||!naverFallback)return primary;
    const controller=new AbortController();let timer;
    try{
     const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('네이버 수급 시간 초과'));},fallbackTimeoutMs);});
     // No KIS token or application headers go to the public fallback host.
     const body=await Promise.race([httpsGet('https://m.stock.naver.com/api/stock/'+code+'/integration',fallbackTimeoutMs,{'Referer':'https://m.stock.naver.com/'},{signal:controller.signal}),deadline]);
     return {...parseNaverInvestors(body,code,new Date(now()).toISOString()),primaryError:primary.error,primaryErrorCode:primary.errorCode};
    }catch{return {ok:false,error:primary.error+' · 네이버 수급도 불러오지 못했습니다. 다시 조회해 주세요.',errorCode:primary.errorCode};}finally{clearTimeout(timer);}
   });cache.set(code,entry);while(cache.size>20)cache.delete(cache.keys().next().value);
   try{const value=await entry.task;if(!value.ok&&cache.get(code)===entry)cache.delete(code);return value;}catch(error){if(cache.get(code)===entry)cache.delete(code);throw error;}
  }catch{return {ok:false,error:'투자자별 순매수를 불러오지 못했습니다. 가격 차트는 계속 사용할 수 있습니다.'};}
 }};
}
module.exports={parseInvestors,parseNaverInvestors,createInvestorProvider};
