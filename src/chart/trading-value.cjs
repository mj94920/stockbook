'use strict';
const {stockCode}=require('./provider.cjs');
function parseTradingValues(body,code,fetchedAt,{start,end}){
 stockCode(code);if(typeof body!=='string'||body.length>2000000)throw Error('거래대금 응답 형식 오류');
 const data=JSON.parse(body);
 if(data.rt_cd!=='0'||data.output1?.stck_shrn_iscd!==code||!Array.isArray(data.output2)||data.output2.length>100)throw Error('거래대금 종목/응답 오류');
 const rows=[],seen=new Set();
 for(const row of data.output2){
  // The provider sometimes pads its array with empty rows, not zero-value trading days.
  if(!row?.stck_bsop_date&&Object.values(row||{}).every(value=>value===''||value===null))continue;
  const raw=row?.stck_bsop_date;
  if(typeof raw!=='string'||!/^\d{8}$/.test(raw)||raw<start||raw>end)throw Error('거래대금 거래일 오류');
  const date=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6);
  if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||seen.has(date))throw Error('거래대금 거래일 오류');seen.add(date);
  const values=[row.acml_tr_pbmn,row.acml_vol];
  if(values.some(value=>typeof value!=='string'||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))))throw Error('거래대금 수량/금액 오류');
  rows.push({date,value:Number(values[0]),volume:Number(values[1])});
 }
 if(!rows.length)throw Error('거래대금 자료 없음');
 rows.sort((a,b)=>a.date.localeCompare(b.date));
 return {ok:true,stockCode:code,source:'KIS',market:'KRX',currency:'KRW',unit:'원',fetchedAt,rows};
}
function createTradingValueProvider({httpsGet,getAuth,now=()=>Date.now(),timeoutMs=8000}){
 return require('./history.cjs').createHistory({httpsGet,getAuth,now,timeoutMs,kind:'거래대금',pageSize:100,defaultCount:100,
  request:(code,end)=>({url:'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?'+new URLSearchParams({FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code,FID_INPUT_DATE_1:'20100101',FID_INPUT_DATE_2:end,FID_PERIOD_DIV_CODE:'D',FID_ORG_ADJ_PRC:'1'}),tr:'FHKST03010100'}),parse:parseTradingValues});
}
module.exports={parseTradingValues,createTradingValueProvider};
