'use strict';
const {stockCode}=require('./provider.cjs');
function parseTradingValues(body,code,fetchedAt,{start,end,allowEmpty=false}){
 stockCode(code);if(typeof body!=='string'||body.length>2000000)throw Error('거래대금 응답 형식 오류');
 const data=JSON.parse(body);
 if(data.rt_cd!=='0'||data.output1?.stck_shrn_iscd!==code||!Array.isArray(data.output2)||data.output2.length>100)throw Error('거래대금 종목/응답 오류');
 const rows=[],seen=new Set();
 for(const row of data.output2){
  // The provider sometimes pads its array with empty rows, not zero-value trading days.
  if(!row?.stck_bsop_date&&Object.values(row||{}).every(value=>value===''||value===null))continue;
  const raw=row?.stck_bsop_date;
  if(typeof raw!=='string'||!/^\d{8}$/.test(raw)||raw<start||raw>end)throw Error('거래대금 거래일 오류');
  const date=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6);
  if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||seen.has(date))throw Error('거래대금 거래일 오류');seen.add(date);
  const values=[row.acml_tr_pbmn,row.acml_vol];
  if(values.some(value=>typeof value!=='string'||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))))throw Error('거래대금 수량/금액 오류');
  rows.push({date,value:Number(values[0]),volume:Number(values[1])});
 }
 if(!rows.length&&!allowEmpty)throw Error('거래대금 자료 없음');
 rows.sort((a,b)=>a.date.localeCompare(b.date));
 return {ok:true,stockCode:code,source:'KIS',market:'KRX',currency:'KRW',unit:'원',fetchedAt,rows};
}
function tradingRange(input,at=Date.now()){
 if(input===undefined)return null;
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['start','end'].includes(k)))throw Error('거래대금 조회 범위 오류');
 const today=new Date(at+9*3600000).toISOString().slice(0,10);
 for(const value of [input.start,input.end])if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>today||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('거래대금 조회 날짜 오류');
 if(input.start>input.end)throw Error('거래대금 조회 순서 오류');return {start:input.start.replaceAll('-',''),end:input.end.replaceAll('-','')};
}
function createTradingValueProvider({httpsGet,getAuth,now=()=>Date.now(),timeoutMs=8000,minPageIntervalMs=500}){
 const cache=new Map();let nextPageAt=0;
 return {async get(code,range){
  try{
   stockCode(code);const requested=tradingRange(range,now()),key=code+':'+(requested?requested.start+':'+requested.end:'recent');const old=cache.get(key);if(old&&now()-old.at<60000)return await old.task;
   const entry={at:now(),task:null};
   entry.task=(async()=>{
    const controller=new AbortController();let timer;
    try{
     const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('거래대금 수신 시간 초과'));},timeoutMs);});
     const request=(async()=>{
      const auth=await getAuth();if(!auth)return {ok:false,error:'KIS 연결 후 실제 거래대금을 조회할 수 있습니다.'};if(controller.signal.aborted)throw Error('거래대금 수신 시간 초과');
      const at=new Date(now()),end=requested?.end||new Date(at.getTime()+9*3600000).toISOString().slice(0,10).replaceAll('-',''),start=requested?.start||new Date(at.getTime()-366*86400000+9*3600000).toISOString().slice(0,10).replaceAll('-','');
      if(requested){const wait=Math.max(0,nextPageAt-Date.now());nextPageAt=Math.max(nextPageAt,Date.now())+minPageIntervalMs;if(wait)await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(delay);reject(Error('거래대금 추가 조회 중단'));},delay=setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},wait);controller.signal.addEventListener('abort',abort,{once:true});});if(controller.signal.aborted)throw Error('거래대금 추가 조회 중단');}
      const params=new URLSearchParams({FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,FID_INPUT_DATE_1:start,FID_INPUT_DATE_2:end,FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'1'});
      const body=await httpsGet('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?'+params,timeoutMs,{authorization:'Bearer '+auth.token,appkey:auth.appKey,appsecret:auth.appSecret,tr_id:'FHKST03010100',custtype:'P'},{signal:controller.signal});
      return parseTradingValues(body,code,at.toISOString(),{start,end,allowEmpty:!!requested});
     })();
     return await Promise.race([request,deadline]);
    }finally{clearTimeout(timer);}
   })();
   cache.set(key,entry);while(cache.size>20)cache.delete(cache.keys().next().value);
   try{const value=await entry.task;if(!value.ok&&cache.get(key)===entry)cache.delete(key);return value;}catch(error){if(cache.get(key)===entry)cache.delete(key);throw error;}
  }catch{return {ok:false,error:'실제 거래대금을 불러오지 못했습니다. 가격 차트는 계속 사용할 수 있습니다.'};}
 }};
}
module.exports={parseTradingValues,createTradingValueProvider,tradingRange};
