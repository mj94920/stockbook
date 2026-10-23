const {test}=require('node:test');
const assert=require('node:assert/strict');
const {articleUrl,articleText}=require('../src/news/article.cjs');
test('only canonical HTTPS Naver article URLs can be requested',()=>{
 assert.equal(articleUrl('https://n.news.naver.com/mnews/article/001/0012345678?sid=101'),'https://n.news.naver.com/mnews/article/001/0012345678');
 for(const url of ['http://n.news.naver.com/mnews/article/001/123456','https://evil.test/','https://n.news.naver.com.evil.test/mnews/article/001/123456','https://user@n.news.naver.com/mnews/article/001/123456','https://n.news.naver.com:444/mnews/article/001/123456','https://n.news.naver.com/'])assert.throws(()=>articleUrl(url));
});
test('extracts article text with paragraph boundaries, entities and no executable markup',()=>{
 const html='<header>메뉴</header><article id="dic_area"><p>첫 문단 &amp; 인용 &#xAC00;</p><div>두 문단<br>다음 줄</div><script>steal()</script><!--광고--></article><footer>외부 내용</footer>';
 const text=articleText(html);assert.match(text,/첫 문단 & 인용 가/);assert.match(text,/두 문단\n다음 줄/);assert.doesNotMatch(text,/메뉴|steal|광고|외부 내용|<p>/);
});
test('legacy nested div body is complete and missing/paywall bodies fail instead of inventing content',()=>{
 assert.equal(articleText('<div id="articleBodyContents"><div>본문</div>끝</div><div>추천</div>'),'본문\n끝');
 for(const html of ['<p>로그인이 필요합니다</p>','<article id="dic_area">잘림','<article id="dic_area"></article>'])assert.throws(()=>articleText(html));
});

const {newsItems}=require('../src/news/list.cjs');
const {registerNews}=require('../src/news/service.cjs');
const market=require('./fixtures/news/market-20261023.json');
const stock=require('./fixtures/news/stock-20261023.json');

test('received market and stock payloads retain publisher, summary, canonical URL and KST seconds',()=>{
 const items=newsItems(market);
 assert.equal(items.length,3);
 assert.equal(items[0].title,'솔리다임 美 IPO 접은 SK하이닉스…주가 누르던 악재 걷힐까');
 assert.equal(items[0].source,'더팩트');assert.match(items[0].summary,/미국 기업공개/);
 assert.equal(items[0].time,'2026-10-23T11:26:11+09:00');
 assert.equal(items[0].url,'https://n.news.naver.com/mnews/article/629/0000544920');
 const related=newsItems(stock,'005930');assert.equal(related.length,3);
 assert.equal(related[0].source,'뉴스1');assert.equal(related[0].time,'2026-10-23T11:40:00+09:00');
 assert.equal(related[0].code,'005930');assert.match(related[1].title,/"병특 상시화/);
 assert.deepEqual(newsItems({items:[{title:'invalid',officeId:'../x',articleId:'123456'},{tit:'missing ids'}]}),[]);
});

test('news IPC checks sender and stock code before network; only fixed provider routes are fetched',async()=>{
 const handlers=new Map(),main={webContents:{}},calls=[];
 let response=JSON.stringify(market);
 registerNews({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},getMainWindow:()=>main,headers:{},httpsGet:async url=>{calls.push(url);return response;}});
 const call=(key,value,sender=main.webContents)=>handlers.get(key)({sender},value);
 for(const key of ['fetch-news','fetch-news-article'])assert.equal((await call(key,{},{})).ok,false);
 for(const opts of [{kind:'stock',code:'005930/../../x'},{kind:'evil'},{kind:'stock',code:'https://evil.test'}])assert.equal((await call('fetch-news',opts)).ok,false);
 assert.equal(calls.length,0);
 const result=await call('fetch-news',{kind:'market',url:'https://evil.test'});assert.equal(result.ok,true);assert.equal(result.items.length,3);
 assert.deepEqual(calls,['https://m.stock.naver.com/api/news/list?category=mainnews&pageSize=30&page=1']);
 response=JSON.stringify(stock);assert.equal((await call('fetch-news',{kind:'stock',code:'005930'})).items[0].code,'005930');
 assert.match(calls.at(-1),/^https:\/\/m.stock.naver.com\/api\/news\/stock\/005930\?/);
 const before=calls.length;
 for(const url of ['https://evil.test/','https://www.bloter.net/','https://n.news.naver.com.evil.test/mnews/article/001/123456'])assert.equal((await call('fetch-news-article',url)).ok,false);
 assert.equal(calls.length,before);
 response='<article id="dic_area"><p>本文 &amp; 기사</p></article>';
 const article=await call('fetch-news-article','https://n.news.naver.com/mnews/article/001/123456?sid=101');
 assert.deepEqual(article,{ok:true,url:'https://n.news.naver.com/mnews/article/001/123456',body:'本文 & 기사'});
 for(response of ['<article id="dic_area"></article>','<p>body missing</p>','not JSON']){
  assert.equal((await call('fetch-news-article','https://n.news.naver.com/mnews/article/001/123456')).ok,false);
  assert.equal((await call('fetch-news',{kind:'market'})).ok,false);
 }
 response='[]';assert.equal((await call('fetch-news',{kind:'market'})).ok,false);
 const packaged=require('../package.json').build.files;
 for(const file of ['src/news/article.cjs','src/news/list.cjs','src/news/service.cjs'])assert.ok(packaged.includes(file));
});
