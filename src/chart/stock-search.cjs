'use strict';
function cleanStock(row){
 const code=row?.code||row?.stockCode,name=row?.name||row?.stockName;
 return typeof code==='string'&&/^\d{6}$/.test(code)&&typeof name==='string'&&name.trim()?{code,name:name.trim().slice(0,120),market:typeof row.market==='string'?row.market.slice(0,20):''}:null;
}
function createStockSearch({loadMarket,loadBasic,timeoutMs=8000,now=()=>Date.now()}){
 let catalog=null,catalogTask=null,catalogAt=0;const known=new Map(),queries=new Map();
 const remember=stock=>{if(stock)known.set(stock.code,stock);while(known.size>6000)known.delete(known.keys().next().value);return stock;};
 const normalize=value=>value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
 function deadline(task){let timer;return Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('검색 시간 초과')),timeoutMs);})]).finally(()=>clearTimeout(timer));}
 function catalogRows(){
  if(catalog&&now()-catalogAt<1800000)return Promise.resolve(catalog);
  if(!catalogTask){catalogTask=Promise.allSettled(['KOSPI','KOSDAQ','ETF'].map(market=>loadMarket(market))).then(results=>{
   const map=new Map();for(const result of results)if(result.status==='fulfilled'&&result.value?.ok&&Array.isArray(result.value.data))for(const row of result.value.data){const stock=remember(cleanStock(row));if(stock&&!map.has(stock.code))map.set(stock.code,stock);}
   if(!map.size)throw Error('종목 목록 없음');catalog=[...map.values()];catalogAt=now();return catalog;
  }).finally(()=>{catalogTask=null;});}
  return catalogTask;
 }
 async function resolve(code){
  if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
  if(known.has(code))return known.get(code);
  try{const row=await deadline(Promise.resolve().then(()=>loadBasic(code))),stock=cleanStock(row);return stock?.code===code?remember(stock):null;}catch{return null;}
 }
 return {resolve,async search(input){
  if(typeof input!=='string'||!input.trim()||input.trim().length>40||/[\u0000-\u001f]/.test(input))return {ok:false,error:'종목명 또는 국내 6자리 코드를 입력하세요.'};
  const query=input.trim(),key=normalize(query),old=queries.get(key);if(old&&now()-old.at<30000)return old.task;
  const entry={at:now(),task:null};entry.task=(async()=>{
   if(/^\d{6}$/.test(query)){const stock=await resolve(query);return stock?{ok:true,items:[stock]}:{ok:false,error:'해당 종목코드를 확인할 수 없습니다. 기존 차트는 유지합니다.'};}
   const rows=await deadline(catalogRows()),rank=stock=>{const name=normalize(stock.name);return name===key||stock.code===key?0:name.startsWith(key)||stock.code.startsWith(key)?1:2;};
   const items=rows.filter(stock=>normalize(stock.name).includes(key)||stock.code.includes(key)).sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name,'ko')).slice(0,20);
   return {ok:true,items};
  })().catch(()=>({ok:false,error:'종목 목록을 불러오지 못했습니다. 다시 검색하거나 6자리 코드를 입력하세요.'}));
  queries.set(key,entry);while(queries.size>30)queries.delete(queries.keys().next().value);const value=await entry.task;if(!value.ok&&queries.get(key)===entry)queries.delete(key);return value;
 }};
}
module.exports={createStockSearch};
