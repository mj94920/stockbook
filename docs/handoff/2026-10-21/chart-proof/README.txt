StockBook 차트 연결 독립 검증본 — 2026-10-20

상태: 데이터 획득/파싱/브라우저 차트 표시 확인. Windows Electron 실조회 미검증.
이 폴더는 제품 앱과 다른 시험본이며 StockBook 본체·계좌 파일에 접근하지 않습니다.
삼성전자 005930, Naver fchart, 일봉 300개만 조회합니다. API 키를 요구하지 않습니다.
Electron userData는 시스템 임시 폴더의 StockBookChartProof에만 둡니다.
프록시·인증서·TLS 검증 설정을 변경하지 않습니다.

Windows 실행 (Node.js/npm 설치 환경):
1. 압축을 새 폴더에 풉니다.
2. 그 폴더의 터미널에서 npm install 실행. Electron 31.7.7 다운로드가 필요합니다.
3. npm run check 실행: 보관 원자료 300봉의 파싱·오류 검사를 확인합니다.
4. npm start 실행.
5. ① Node HTTPS 실조회 → 성공/실패와 결과 전문 확인.
6. 실패하면 ② Electron net 실조회로 비교.
7. ③ 이미 받은 자료로 표시만 검증은 네트워크 성공 판정에 쓰지 않습니다.
8. 결과 전문의 mode, runtime, 오류·기간·봉 수를 전달하면 후속 판단이 가능합니다.
실제 Windows 실행/설치형 EXE 검증을 이미 완료한 산출물이 아닙니다.

이 실행 환경의 검증 결과:
- Linux / Node v24.19.0. Electron 실행 파일과 디스플레이 환경 없음.
- 동일 Naver fchart URL: Python urllib는 HTTP 200, 20,925바이트.
- 현재 main의 httpsGet 원문 함수는 Node에서 Timeout. Node/Electron 앱 연결 성공으로 간주하지 않음.
- 300봉: OHLCV 범위, 정렬, 중복 없는 날짜 검사 통과.
- 파서 빈 응답·잘못된 OHLCV·중복 날짜 거절 검사 통과.
- Playwright Chromium 표시 검증은 보관 실수신 자료+가짜 IPC 브리지를 사용.
  120개 캔들/120개 거래량 막대/MA20 표시, 실패 시 이전 차트 제거,
  버튼 복구, JS 오류 0건. Electron IPC 실동작을 검증한 것이 아님.
- chart-display-verified.png는 위 보관자료 표시 검증 화면.

품질 보류:
Naver/Yahoo 공통 245일 중 24일 OHLCV 차이가 있어 공급원 정확성은 미확정.
수정주가 기준·거래소·갱신 시차 대조 필요. 실시간/완료 일봉 보장 없음.
이 시험본의 표시용 MA20은 산식 제안이나 BB/신호 정책 확정이 아닙니다.
외인·기관 보유량, 뉴스, 실제 주문, 지표 엔진은 포함하지 않습니다.

제품 코드·GitHub·릴리스·프록시 설정은 변경하지 않았습니다.
