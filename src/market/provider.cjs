'use strict';
const quotes=require('./quotes.js');
function createMarketProvider({fetch,now=()=>Date.now(),timeoutMs=5000}){
 let cached=null,pending=null;
 async function one(key){
  for(const host of ['query1','query2']){
   try{
    const url='https://'+host+'.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(quotes.symbols[key])+'?interval=1d&range=1d';
    const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json','Referer':'https://finance.yahoo.com/'}});
    if(!res.ok)continue;const text=await res.text();if(text.length>1000000)continue;
    return quotes.parse(key,JSON.parse(text),new Date(now()).toISOString());
   }catch{/* Each symbol fails independently. Never replace a missing yield with a bond price. */}
  }
  return null;
 }
 async function get(){
  if(cached&&now()-cached.at<60000)return cached.value;if(pending)return pending;
  const task=(async()=>{const result={};const keys=Object.keys(quotes.symbols);let position=0;
   await Promise.all(Array.from({length:3},async()=>{while(position<keys.length){const key=keys[position++];result[key]=await one(key);}}));
   cached={at:now(),value:result};return result;
  })();pending=task;try{return await task;}finally{if(pending===task)pending=null;}
 }
 return {get};
}
module.exports={createMarketProvider};
