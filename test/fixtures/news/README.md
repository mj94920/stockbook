# 뉴스 수신 자료

2026-10-23 KST에 세션 HTTPS 프록시로 받은 공개 뉴스 목록입니다. 기사 본문이 아닙니다.

- market-20261023.json: `https://m.stock.naver.com/api/news/list?category=mainnews&pageSize=3&page=1`
- stock-20261023.json: `https://m.stock.naver.com/api/news/stock/005930?pageSize=3&page=1`

시장 목록의 tit/ohnm/subcontent와 종목 목록의 title/officeName/body 차이를 검증합니다. body와 subcontent는 수신 요약으로만 사용합니다. 언론사·발행 시각·네이버 기사 URL은 응답에서 보존하며, 원 언론사 사이트의 본문 수신을 검증한 자료는 아닙니다.

- bloter-list-structure-20261023.html / bloter-article-structure-20261023.html: 실제 응답에서 확인한 요소·속성·시각 형식이며 본문과 제목은 합성 검증문으로 교체했다. 실제 기사 전문을 보존한 파일이 아니다.
- bloter-metadata-20261023.json: 공개 블로터 목록에서 읽은 제목·링크·표시 시각 20건. 목록에 연도가 없으므로 time을 추정해 채우지 않았다. 미리보기용이며 본문은 포함하지 않는다.
