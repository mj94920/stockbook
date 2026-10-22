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
