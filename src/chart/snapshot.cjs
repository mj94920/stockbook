'use strict';
const fs=require('node:fs');const path=require('node:path');
function readSnapshot(code,appDir){
 if(code!=='005930')return {ok:false,error:'이 종목의 일봉 공급자가 아직 연결되지 않았습니다.'};
 try{
  const folder=path.join(appDir,'src/chart/proof-data');
  const metadata=JSON.parse(fs.readFileSync(path.join(folder,'metadata.json'),'utf8'));
  const candles=JSON.parse(fs.readFileSync(path.join(folder,'long-candles.json'),'utf8'));
  const investors=JSON.parse(fs.readFileSync(path.join(folder,'investor-snapshot.json'),'utf8'));
  if(metadata.stockCode!==code || !Array.isArray(candles)||!candles.length)throw Error('snapshot');
  return {ok:true,metadata,candles,investors};
 }catch{return {ok:false,error:'보존 차트 자료를 읽지 못했습니다.'};}
}
module.exports={readSnapshot};
