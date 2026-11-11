'use strict';
const {stockCode}=require('./provider.cjs');
let queue=Promise.resolve(),nextAt=0;
function scheduled(task,signal){const next=queue.then(async()=>{const delay=Math.max(0,nextAt-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));if(signal.aborted)throw Error('취소된 기간 조회');nextAt=Date.now()+100;let onAbort;const stopped=new Promise((_,reject)=>{onAbort=()=>reject(Error('기간 자료 수신 시간 초과'));signal.addEventListener('abort',onAbort,{once:true});});return Promise.race([Promise.resolve().then(task),stopped]).finally(()=>signal.removeEventListener('abort',onAbort));});queue=next.catch(()=>{});return next;}
function countOption(options,defaultCount){
 if(options===undefined)return defaultCount;
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='count')||!Number.isInteger(options.count)||options.count<1||options.count>1000)throw Error('조회 건수는 1~1000입니다.');return options.count;
}
function createHistory({httpsGet,getAuth,now=()=>Date.now(),timeoutMs=8000,kind,pageSize,defaultCount,request,parse}){
 const cache=new Map();
 return {async get(code,options){
  try{
   stockCode(code);const count=countOption(options,defaultCount),key=code+':'+count,old=cache.get(key);if(old&&now()-old.at<60000)return await old.task;
   const entry={at:now(),task:null};entry.task=(async()=>{
    const controller=new AbortController(),budget=Math.min(60000,timeoutMs*Math.ceil(count/pageSize));let timer;
    try{
     const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('기간 자료 수신 시간 초과'),{safeCode:'KIS_TIMEOUT'}));},budget);});
     const work=(async()=>{
      const auth=await getAuth();if(!auth)return {ok:false,error:'KIS 연결 후 '+kind+'를 조회할 수 있습니다.',errorCode:'KIS_AUTH'};
      const at=new Date(now()),today=new Date(+at+9*3600000).toISOString().slice(0,10);let end=today,meta=null,pages=0,warning='',exhausted=false,omittedRows=0;const found=new Map();
      const maxPages=count<=pageSize?1:40;
      while(found.size<count&&pages<maxPages){
       let part;
       try{
        if(pages)await new Promise(resolve=>setTimeout(resolve,150));
        const body=await scheduled(()=>{if(controller.signal.aborted)throw Object.assign(Error('기간 자료 수신 시간 초과'),{safeCode:'KIS_TIMEOUT'});const spec=request(code,end.replaceAll('-',''));return httpsGet(spec.url,timeoutMs,{authorization:'Bearer '+auth.token,appkey:auth.appKey,appsecret:auth.appSecret,tr_id:spec.tr,custtype:'P'},{signal:controller.signal});},controller.signal);
        if(controller.signal.aborted)throw Object.assign(Error('기간 자료 수신 시간 초과'),{safeCode:'KIS_TIMEOUT'});
        part=parse(body,code,at.toISOString(),{start:'20100101',end:end.replaceAll('-','')});pages++;
        if(part.rows.some(row=>row.date>end||row.date<'2010-01-01'))throw Error('기간 조회 날짜 범위 오류');
       }catch(e){if(!found.size)throw e;warning='이전 날짜 추가 조회가 중단됐습니다. 수신한 자료만 표시합니다.';break;}
       meta=part;omittedRows+=part.omittedRows||0;
       const rows=part.rows;if(!rows.length){exhausted=true;break;}
       for(const row of rows){if(found.has(row.date))throw Error('기간 조회 날짜 중복');found.set(row.date,row);}
       const oldest=rows[0].date,next=new Date(Date.parse(oldest+'T00:00:00Z')-86400000).toISOString().slice(0,10);
       if(next>=end||next<'2010-01-01'){exhausted=true;break;}end=next;
      }
      if(!found.size)throw Error('기간 자료 없음');
      const rows=[...found.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-count);
      return {...meta,rows,omittedRows,requestedCount:count,receivedCount:rows.length,pages,partial:rows.length<count,warning,exhausted,from:rows[0].date,to:rows.at(-1).date};
     })();return await Promise.race([work,deadline]);
    }finally{clearTimeout(timer);}
   })().catch(error=>{const errorCode=error?.safeCode||(/^HTTP \d{3}$/.test(error?.message||'')?error.message.replace(' ','_'):'KIS_FORMAT_OR_NETWORK');return {ok:false,error:'KIS '+kind+'를 불러오지 못했습니다. ('+errorCode+')',errorCode};});
   cache.set(key,entry);while(cache.size>20)cache.delete(cache.keys().next().value);
   const value=await entry.task;if((!value.ok||value.warning||(count>pageSize&&value.partial))&&cache.get(key)===entry)cache.delete(key);return value;
  }catch{return {ok:false,error:'조회 종목·건수 또는 기간 자료를 확인하세요.'};}
 }};
}
module.exports={createHistory,countOption};
