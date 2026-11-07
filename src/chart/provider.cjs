'use strict';
const {aggregate}=require('./series.js');
const {decode}=require('../news/article.cjs');
function stockCode(code){if(typeof code!=='string'||!/^\d{6}$/.test(code))throw Error('국내 6자리 종목코드를 확인하세요.');return code;}
function parseDaily(xml,code,at,{maxBars=1000}={}){
 stockCode(code);if(typeof xml!=='string'||xml.length>4000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('일봉 응답 형식 오류');
 const header=/<chartdata\b([^>]*)>/i.exec(xml);if(!header||!/<\/chartdata\s*>/i.test(xml))throw Error('일봉 자료 없음');
 const attr=Object.fromEntries([...header[1].matchAll(/([a-z]+)="([^"]*)"/gi)].map(m=>[m[1].toLowerCase(),m[2]]));
 if(attr.symbol!==code||attr.timeframe!=='day')throw Error('수신 종목/주기 불일치');
 const candles=[];let omitted=0,normalizedBounds=0,previousDate='';
 for(const tag of xml.matchAll(/<item\b[^>]*>/gi)){
  const data=/\bdata="([^"]*)"/.exec(tag[0]);if(!data)throw Error('일봉 행 누락');const fields=data[1].split('|');
  if(fields.length!==6||!/^\d{8}$/.test(fields[0])||fields.slice(1).some(v=>!/^\d+(?:\.\d+)?$/.test(v)))throw Error('일봉 값 오류');
  const [raw,open,high,low,close,volume]=fields.map((v,i)=>i?Number(v):v);
  if(!Number.isSafeInteger(volume))throw Error('거래량 범위 오류');
  const date=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6);
  if(!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<=previousDate)throw Error('일봉 날짜 오류');previousDate=date;
  // Do not invent OHLC for zero-volume rows which provide a close but no traded prices.
  if(open===0&&high===0&&low===0&&close>0&&volume===0){omitted++;continue;}
  let normalizedHigh=high,normalizedLow=low;
  const upper=Math.max(open,close),lower=Math.min(open,close);
  if(high<upper||low>lower){
   if(attr.precision==='0'&&open>0&&close>0&&high>0&&low>0&&high>=low&&Math.max(upper-high,low-lower)<=1){normalizedHigh=Math.max(high,upper);normalizedLow=Math.min(low,lower);normalizedBounds++;}
  }
  candles.push({date,open,high:normalizedHigh,low:normalizedLow,close,volume});
 }
 if(!candles.length||candles.length+omitted>maxBars)throw Error('유효한 일봉 자료 없음');aggregate(candles,'day');
 return {ok:true,candles,investors:null,metadata:{stockCode:code,name:decode(attr.name||code),snapshotDate:candles.at(-1).date,source:'Naver fchart',sourceType:'naver-daily',fetchedAt:at,automaticRefresh:false,lastBarComplete:null,omittedRows:omitted,normalizedBounds,priceAdjustment:'공급자 가격 조정 기준 미확인'}};
}
function createChartProvider({httpsGet,now=()=>Date.now(),requestTimeoutMs=12000}){
 const cache=new Map();
 return {async get(code,cycle='day'){
  try{
   stockCode(code);if(!['day','week','month','year'].includes(cycle))throw Error('지원하지 않는 봉 주기');
   const count=cycle==='year'?3000:1000,key=code+':'+count;const existing=cache.get(key);if(existing&&now()-existing.at<60000)return await existing.pending;
   const entry={at:now(),pending:null};
   entry.pending=Promise.resolve().then(async()=>{
    const controller=new AbortController();let timer;
    try{
     const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Object.assign(Error('Chart deadline'),{code:'CHART_TIMEOUT'}));controller.abort();},requestTimeoutMs);});
     const response=httpsGet(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${count}&requestType=0`,requestTimeoutMs,{'Referer':'https://finance.naver.com/'},{signal:controller.signal});
     const xml=await Promise.race([response,timeout]);return parseDaily(xml,code,new Date(now()).toISOString(),{maxBars:count});
    }finally{clearTimeout(timer);}
   });
   cache.set(key,entry);while(cache.size>20)cache.delete(cache.keys().next().value);
   entry.pending.catch(()=>{if(cache.get(key)===entry)cache.delete(key);});return await entry.pending;
  }catch(error){return {ok:false,error:error?.code==='CHART_TIMEOUT'?'차트 수신 시간이 초과됐습니다. 다시 시도해 주세요.':'선택 종목의 일봉을 불러오지 못했습니다. 다시 시도해 주세요.'};}
 }};
}
module.exports={stockCode,parseDaily,createChartProvider};
