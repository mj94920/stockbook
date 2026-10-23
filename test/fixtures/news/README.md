# 뉴스 수신 자료

2026-10-23 KST에 세션 HTTPS 프록시로 받은 공개 뉴스 목록입니다. 기사 본문이 아닙니다.

- market-20261023.json: `https://m.stock.naver.com/api/news/list?category=mainnews&pageSize=3&page=1`
- stock-20261023.json: `https://m.stock.naver.com/api/news/stock/005930?pageSize=3&page=1`

시장 목록의 tit/ohnm/subcontent와 종목 목록의 title/officeName/body 차이를 검증합니다. body와 subcontent는 수신 요약으로만 사용합니다. 언론사·발행 시각·네이버 기사 URL은 응답에서 보존하며, 원 언론사 사이트의 본문 수신을 검증한 자료는 아닙니다.
