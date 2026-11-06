import csv,json,hashlib
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Export the reviewed 2026-11-06 public industry snapshot')
parser.add_argument('source',type=Path,help='Directory with audited summary.json and industry-members.csv')
source=parser.parse_args().source
root=Path(__file__).resolve().parents[3]
summary=json.loads((source/'summary.json').read_text());assert summary['finishedAtUTC'].startswith('2026-11-06');assert summary['verifiedGroups']==79 and not summary['failedGroups'] and not summary['overlappingCodes']
rows=list(csv.DictReader((source/'industry-members.csv').open(encoding='utf-8-sig')));assert len(rows)==summary['expectedMemberships']==4425
members=[];excluded=[]
market={'KS':'KOSPI','KQ':'KOSDAQ','KN':'KONEX'}
for r in rows:
 if r['industryCode']=='25' and r['productType'] in ('stock','konex'):assert r['stockCode'] in ('0120X0','0106J0'), 'Review newly unclassified equities before export'
 if r['productType'] in ('stock','konex') and r['industryCode']!='25':
  members.append([r['stockCode'],r['stockName'],market[r['exchangeCode']],r['industryCode']])
 else:excluded.append([r['stockCode'],r['productType'],'원본 기타의 펀드성 상품' if r['industryCode']=='25' and r['productType']=='stock' else r['productType']])
assert len(members)==2876 and len(excluded)==1549
codes={r[3] for r in members}
d={'asOf':'2026-11-06','source':'네이버 증권 업종','sourceUrl':summary['source'],'collectedAt':summary['finishedAtUTC'],'industries':[[str(g['industryCode']),g['industryName']] for g in summary['groups'] if str(g['industryCode']) in codes],'members':sorted(members),'excluded':sorted(excluded)}
assert len(d['industries'])==78
payload=json.dumps(d,ensure_ascii=False,separators=(',',':'))
(root/'src/desktop/industry-data.js').write_text('// Public industry membership snapshot. No prices or private account data. See docs/design/industry-classification/README.md.\n(function(root,data){if(typeof module==="object"&&module.exports)module.exports=data;else root.StockBookIndustryData=data;})(typeof window==="object"?window:globalThis,'+payload+');\n',encoding='utf8')
(root/'docs/design/industry-classification/source-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print('industry-data.js:',len(payload.encode()),'bytes;',len(members),'stocks;',len(d['industries']),'industries')
