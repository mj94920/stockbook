'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),https=require('node:https'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {entrySignalSeries}=require('../../../src/chart/series.js'),{createChartProvider}=require('../../../src/chart/provider.cjs');
const root=path.resolve(__dirname,'../../..'),calls=[];let agent;
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY){const lib=require('https-proxy-agent');agent=new(lib.HttpsProxyAgent||lib)(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);}
const read=(url,timeout,headers={},options={})=>new Promise((resolve,reject)=>{
 const req=https.get(url,{agent,signal:options.signal,headers:{'User-Agent':'Mozilla/5.0',...headers}},res=>{const chunks=[];let size=0;res.on('error',reject);res.on('data',b=>{size+=b.length;if(size>4000000)req.destroy(Error('Response too large'));else chunks.push(b);});res.on('end',()=>{if(res.statusCode!==200)return reject(Error('HTTP '+res.statusCode));const data=Buffer.concat(chunks);calls.push({url,status:res.statusCode,bytes:size,sha256:crypto.createHash('sha256').update(data).digest('hex')});const charset=/charset=(euc-kr|euc_kr|ks_c_5601|cp949)/i.test(res.headers['content-type']||'')?'euc-kr':'utf-8';resolve(new(require('node:util').TextDecoder)(charset).decode(data));});});req.on('error',reject);req.setTimeout(timeout,()=>req.destroy(Error('Timeout')));
});
(async()=>{
 const data=await createChartProvider({httpsGet:read}).get('090430');assert.equal(data.ok,true);
 const rows=entrySignalSeries(data.candles),target='2025-06-20',index=data.candles.findIndex(row=>row.date===target),expected={open:134800,high:147600,low:134000,close:145800,volume:2324589};assert.ok(index>=225,'HTS target needs the full 226-bar history');
 const candle=data.candles[index],calculation=rows[index],sameOHLCV=Object.entries(expected).every(([key,value])=>candle[key]===value);
 assert.equal(calculation.signal,true,'The illustrated date should satisfy the price formula on this Naver source.');
 const result={verifiedAt:new Date().toISOString(),scope:'Actual public Naver daily response through production provider and price-only entry formula. User HTS screenshot reference is 090430/2025-06-20, entry output 145800. No Windows/NSIS or other signal parity claim.',calls,metadata:data.metadata,expected,candle,sameOHLCV,calculation};
 fs.writeFileSync(path.join(__dirname,'live-result.json'),JSON.stringify(result,null,2)+'\n');
 fs.writeFileSync('/tmp/stockbook-entry-live-data.json',JSON.stringify(data));
 console.log(JSON.stringify({date:target,candle,sameOHLCV,calculation}));
})().catch(error=>{console.error(error);process.exitCode=1;});
