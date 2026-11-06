"""Read-only public Naver industry survey; no authentication or application changes."""
import concurrent.futures,csv,datetime,json,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
INDEX='https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=100'
def fetch(url):
 return json.loads(subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--max-time','20',url],stderr=subprocess.PIPE))
def collect(group):
 rows=[];pages=[];expected=group['totalCount'];code=group['no']
 for page in range(1,21):
  url=f'https://m.stock.naver.com/api/stocks/industry/{code}?page={page}&pageSize=100'
  data=fetch(url)
  assert data.get('groupInfo',{}).get('no')==code,(code,'group mismatch')
  assert data.get('page')==page,(code,'page mismatch')
  assert data.get('totalCount')==expected,(code,'count changed')
  items=data.get('stocks');assert isinstance(items,list),(code,'missing stocks')
  pages.append({'page':page,'count':len(items)})
  for s in items:
   assert s.get('itemCode') and s.get('stockName'),(code,'missing stock ID')
   market=s.get('stockExchangeType') or {}
   rows.append({'industryCode':code,'industryName':group['name'],'stockCode':s['itemCode'],'stockName':s['stockName'],'exchangeCode':market.get('code',''),'productType':s.get('stockEndType',''),'stockType':s.get('stockType','')})
  if len(rows)>=expected or not items:break
 assert len(rows)==expected,(code,'row count',len(rows),expected)
 assert len({r['stockCode'] for r in rows})==expected,(code,'duplicate members')
 return {'group':group,'pages':pages,'rows':rows}
def main():
 started=datetime.datetime.now(datetime.timezone.utc).isoformat()
 index=fetch(INDEX);(ROOT/'industry-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2));groups=index['groups'];assert len(groups)==index['totalCount'];assert len({g['no'] for g in groups})==len(groups)
 results=[];failures=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  jobs={pool.submit(collect,g):g for g in groups}
  for job in concurrent.futures.as_completed(jobs):
   group=jobs[job]
   try:results.append(job.result())
   except Exception as e:failures.append({'industryCode':group['no'],'industryName':group['name'],'error':str(e)})
   if (len(results)+len(failures))%10==0:print('Groups finished:',len(results),'failed:',len(failures),flush=True)
 results.sort(key=lambda r:r['group']['no']);rows=[r for result in results for r in result['rows']]
 from collections import Counter,defaultdict
 memberships=defaultdict(list)
 for r in rows:memberships[r['stockCode']].append(r['industryCode'])
 summary={'startedAtUTC':started,'finishedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':INDEX,'expectedGroups':len(groups),'verifiedGroups':len(results),'failedGroups':failures,'expectedMemberships':sum(g['totalCount'] for g in groups),'receivedMemberships':len(rows),'uniqueSecurities':len(memberships),'productTypes':dict(Counter(r['productType'] for r in rows)),'overlappingCodes':{k:v for k,v in memberships.items() if len(v)>1},'groups':[{'industryCode':r['group']['no'],'industryName':r['group']['name'],'reportedCount':r['group']['totalCount'],'receivedCount':len(r['rows']),'productTypes':dict(Counter(x['productType'] for x in r['rows'])),'pages':r['pages']} for r in results]}
 (ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
 with (ROOT/'industry-members.csv').open('w',encoding='utf-8-sig',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=['industryCode','industryName','stockCode','stockName','exchangeCode','productType','stockType']);writer.writeheader();writer.writerows(rows)
 with (ROOT/'industry-list.csv').open('w',encoding='utf-8-sig',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=['industryCode','industryName','reportedCount','receivedCount']);writer.writeheader();writer.writerows({k:g[k] for k in writer.fieldnames} for g in summary['groups'])
 print(json.dumps({k:v for k,v in summary.items() if k not in ['groups','overlappingCodes']},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
