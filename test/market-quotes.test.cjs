const {test}=require('node:test'),assert=require('node:assert/strict');const quotes=require('../src/market/quotes.js');const {createMarketProvider}=require('../src/market/provider.cjs');
const reply=(symbol,price=24000)=>({chart:{result:[{meta:{symbol,regularMarketPrice:price,previousClose:price-10,regularMarketTime:1794027600}}],error:null}});
test('market symbols distinguish Nasdaq cash/futures and Treasury yield; S&P/Dow are not requested',()=>{
 assert.equal(quotes.symbols.nasdaq,'^IXIC');assert.equal(quotes.symbols.nasdaqFuture,'NQ=F');assert.equal(quotes.symbols.us10y,'^TNX');assert.equal(quotes.symbols.sox,'^SOX');assert.equal('sp500' in quotes.symbols,false);assert.equal('dow' in quotes.symbols,false);
 const yieldData=reply('^TNX',4.25);yieldData.chart.result[0].meta.previousClose=4.23;const parsed=quotes.parse('us10y',yieldData,'2026-11-08T00:00:00Z');assert.equal(parsed.unit,'percent');assert.equal(parsed.regularMarketPrice,4.25);assert.equal(quotes.display('us10y',parsed).value,'4.250%');assert.equal(quotes.display('us10y',parsed).change,'▲2.0bp');assert.equal(quotes.display('us10y',parsed).absolute,'+0.020%p');
 assert.throws(()=>quotes.parse('us10y',reply('ZN=F',113),'now'));assert.throws(()=>quotes.parse('sox',reply('^IXIC'),'now'));assert.equal(quotes.display('us10y',null).value,'미수신');
});
test('quotes without a previous close never fabricate a zero-percent change',()=>{
 const data=reply('^SOX',5000);delete data.chart.result[0].meta.previousClose;const value=quotes.parse('sox',data,'2026-11-08');assert.equal(value.previousClose,null);assert.equal(quotes.display('sox',value).change,'');
});
test('each Yahoo symbol is independent, fallbacks are bounded and concurrent clients share a cache',async()=>{
 let calls=[];const p=createMarketProvider({fetch:async(url,opt)=>{calls.push({url,opt});const symbol=decodeURIComponent(new URL(url).pathname.split('/').at(-1));if(symbol==='^IXIC')return new Response('',{status:503});if(symbol==='^SOX'&&url.includes('query1'))return new Response('',{status:429});return new Response(JSON.stringify(reply(symbol,symbol==='^TNX'?4.2:5000)));}});
 const [a,b]=await Promise.all([p.get(),p.get()]);assert.deepEqual(a,b);assert.equal(a.nasdaq,null);assert.equal(a.sox.symbol,'^SOX');assert.equal(a.nasdaqFuture.symbol,'NQ=F');assert.equal(a.us10y.unit,'percent');assert.ok(calls.length<=Object.keys(quotes.symbols).length*2);assert.ok(calls.every(x=>x.opt.redirect==='error'&&x.opt.signal));await p.get();assert.ok(calls.length<=Object.keys(quotes.symbols).length*2);
});
