'use strict';
function createFixture(){
 const candles=Array.from({length:400},(_,i)=>{const c=i<15?200:100;return {date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),open:c,high:c,low:c,close:c,volume:100000};});
 candles[239]={...candles[239],open:110,high:125,low:110,close:120};candles[399]={...candles[399],open:105,high:120,low:100,close:115};
 const rows=candles.map(c=>({date:c.date,volume:c.volume,value:500000000000})),data={ok:true,candles,investors:null,metadata:{stockCode:'000009',name:'과거 조회 합성 검증 · 실수신 아님',sourceType:'naver-daily',snapshotDate:candles.at(-1).date,fetchedAt:'2026-10-29T00:00:00Z'}},money={ok:true,stockCode:'000009',source:'KIS',market:'KRX',currency:'KRW',unit:'원',fetchedAt:'2026-10-29T00:00:00Z',rows:rows.slice(-100)};
 return {data,money,rows};
}
module.exports={createFixture};
