(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./series.js'));
 else root.StockBookChartHistory=factory(root.StockBookChartSeries);
})(typeof window==='object'?window:globalThis,function(series){
 'use strict';
 const previousDay=date=>new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 function validRows(data,code,limit,range){
  if(!data?.ok||data.stockCode!==code||data.source!=='KIS'||data.market!=='KRX'||data.currency!=='KRW'||data.unit!=='원'||!Array.isArray(data.rows)||data.rows.length>limit)throw Error('거래대금 응답 오류');
  const seen=new Set();return data.rows.map(r=>{
   if(typeof r?.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||new Date(r.date+'T00:00:00Z').toISOString().slice(0,10)!==r.date||seen.has(r.date)||[r.value,r.volume].some(v=>!Number.isSafeInteger(v)||v<0)||(range&&(r.date<range.start||r.date>range.end)))throw Error('거래대금 날짜/금액 오류');
   seen.add(r.date);return {date:r.date,value:r.value,volume:r.volume};
  }).sort((a,b)=>a.date.localeCompare(b.date));
 }
 async function load({code,candles,initial,fetchPage,onUpdate=()=>{},signal,maxPages=10,totalTimeoutMs=45000,pageTimeoutMs=9000}){
  if(typeof code!=='string'||!/^\d{6}$/.test(code)||typeof fetchPage!=='function'||!Number.isInteger(maxPages)||maxPages<1||maxPages>10||!Number.isFinite(totalTimeoutMs)||totalTimeoutMs<1||!Number.isFinite(pageTimeoutMs)||pageTimeoutMs<1)throw Error('과거 거래대금 조회 조건 오류');
  const target=series.aggregate(candles,'day').slice(-1000),dates=new Map(target.map(c=>[c.date,c.volume])),start=target[0].date,end=target.at(-1).date,values=new Map(),deadline=Date.now()+totalTimeoutMs;let pages=0,fetchedAt=null;
  if(initial?.ok){for(const row of validRows(initial,code,1000))if(dates.has(row.date))values.set(row.date,row);fetchedAt=initial.fetchedAt||null;}
  function result(status){
   const rows=[...values.values()].sort((a,b)=>a.date.localeCompare(b.date)),matched=rows.filter(r=>dates.get(r.date)===r.volume).length;
   const data={ok:true,stockCode:code,source:'KIS',market:'KRX',currency:'KRW',unit:'원',fetchedAt,rows,history:{status,pages,maxPages,target:target.length,start,end,received:rows.length,matched,missing:target.length-matched,partial:matched<target.length}};
   onUpdate(data);return data;
  }
  const matched=()=>[...values.values()].filter(r=>dates.get(r.date)===r.volume).length;
  let cursor=values.size?previousDay([...values.keys()].sort()[0]):end;
  if(signal?.aborted)return result('cancelled');if(matched()===target.length)return result('complete');
  while(cursor>=start&&pages<maxPages){
   if(signal?.aborted)return result('cancelled');if(Date.now()>=deadline)return result('timeout');pages++;result('loading');
   const range={start,end:cursor};let timer,abort;
   try{
    const stopped=new Promise((_,reject)=>{abort=()=>reject(Object.assign(Error('조회 취소'),{code:'CANCELLED'}));signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(Object.assign(Error('조회 시간 초과'),{code:'TIMEOUT'})),Math.max(1,Math.min(pageTimeoutMs,deadline-Date.now())));});
    const data=await Promise.race([Promise.resolve().then(()=>{if(signal?.aborted)throw Object.assign(Error('조회 취소'),{code:'CANCELLED'});return fetchPage(code,range);}),stopped]);
    if(signal?.aborted)return result('cancelled');if(Date.now()>=deadline)return result('timeout');
    const rows=validRows(data,code,100,range);if(!rows.length)return result('exhausted');
    const next=previousDay(rows[0].date);if(next>=cursor)throw Error('과거 거래대금 날짜 진전 없음');
    for(const row of rows)if(dates.has(row.date))values.set(row.date,row);fetchedAt=data.fetchedAt||fetchedAt;cursor=next;
    if(matched()===target.length)return result('complete');result('loading');
   }catch(error){return result(signal?.aborted||error?.code==='CANCELLED'?'cancelled':error?.code==='TIMEOUT'?'timeout':'request-failed');}
   finally{clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);}
  }
  return result(cursor<start?'range-end':'limit');
 }
 return Object.freeze({load,validRows});
});
