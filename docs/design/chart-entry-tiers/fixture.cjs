'use strict';
// Deliberately synthetic: shared by standalone preview and visual verification.
function createFixture(){
 const candles=Array.from({length:240},(_,i)=>{const close=i<15?200:i<210?100:106+Math.sin(i*.65)*5,open=i<210?close:close-4;return {date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),open,high:close+(i<210?0:3),low:open-(i<210?0:3),close,volume:100000};});
 candles[239]={...candles[239],open:110,high:125,low:108,close:120};
 const data={ok:true,candles,investors:null,metadata:{stockCode:'000002',name:'기호·조건 합성 검증 (실수신 아님)',sourceType:'naver-daily',snapshotDate:candles.at(-1).date,fetchedAt:'2026-10-29T00:00:00Z'}};
 const money={ok:true,stockCode:'000002',source:'KIS',market:'KRX',currency:'KRW',unit:'원',fetchedAt:'2026-10-29T00:00:00Z',rows:candles.slice(-100).map((c,i)=>({date:c.date,volume:c.volume,value:i%2?5000e8:500e8}))};
 return {data,money};
}
module.exports={createFixture};
