(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StockBookSelection=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function create(){
  const transient=new Map();
  function resolve(code,{watchlist=[],portfolio=[],catalog=[]}={}){
   if(!code)return null;
   const watch=watchlist.find(s=>s.ticker===code);if(watch)return watch;
   if(transient.has(code))return transient.get(code);
   const quote=catalog.find(s=>(s.code||s.ticker)===code),holding=portfolio.find(s=>s.ticker===code),source=quote||holding;
   if(!source)return null;
   const stock={ticker:code,name:source.name||code,market:source.market||'',price:quote?.price??holding?.currentPrice??null,change:quote?.changePct??holding?.changeRatio??null,quoteSource:quote?'전종목 목록':'',quoteAt:null};
   transient.set(code,stock);while(transient.size>40)transient.delete(transient.keys().next().value);return stock;
  }
  function select(code,name,lists){
   if(typeof code!=='string'||!/^[a-z0-9.^=_-]{1,32}$/i.test(code))return null;
   let stock=resolve(code,lists);
   if(!stock){stock={ticker:code,name:name||code,price:null,change:null};transient.set(code,stock);while(transient.size>40)transient.delete(transient.keys().next().value);}
   transient.set(code,stock);while(transient.size>40)transient.delete(transient.keys().next().value);
   if(name && (!stock.name||stock.name===code))stock.name=name;
   return stock;
  }
  return {resolve,select};
 }
 return Object.freeze({create});
});
