// Actual provider-reported net purchases; never infer personal purchases as a residual.
const investorGroups=[['foreign','외국인'],['institution','기관'],['individual','개인']];
function parseInvestorQuantity(value){
 if(typeof value==='number'&&Number.isSafeInteger(value))return value;
 if(typeof value!=='string'||!/^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value.trim()))throw Error('순매수 수량 누락 또는 형식 오류');
 const n=Number(value.trim().replaceAll(',',''));if(!Number.isSafeInteger(n))throw Error('순매수 수량 범위 오류');return n;
}
function normalizeInvestorRows(input){
 if(!Array.isArray(input)||!input.length)throw Error('투자자별 순매수 자료 없음');
 const seen=new Set();return input.map(row=>{const raw=row.bizdate;if(typeof raw!=='string'||!/^\d{8}$/.test(raw))throw Error('수급 날짜 오류');const date=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6)}`;if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||seen.has(date))throw Error('수급 날짜 중복 또는 오류');seen.add(date);return {date,foreign:parseInvestorQuantity(row.foreignerPureBuyQuant),institution:parseInvestorQuantity(row.organPureBuyQuant),individual:parseInvestorQuantity(row.individualPureBuyQuant)};}).sort((a,b)=>a.date.localeCompare(b.date));
}
function cumulativeInvestors(rows){const sums={foreign:0,institution:0,individual:0};return rows.map(row=>{const cumulative={};for(const [key] of investorGroups)cumulative[key]=sums[key]+=row[key];return {...row,cumulative};});}
if(typeof module!=='undefined')module.exports={parseInvestorQuantity,normalizeInvestorRows,cumulativeInvestors};
