const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadState:   ()          => ipcRenderer.invoke('load-state'),
  saveState:   (data)      => ipcRenderer.invoke('save-state', data),
  showConfirm: (message)   => ipcRenderer.invoke('show-confirm', message),
  // 시세 조회 — main 프로세스에서 직접 HTTPS 요청 (CORS 없음)
  fetchQuote:        (ticker) => ipcRenderer.invoke('fetch-quote', ticker),
  // 네이버 금융 재무 데이터 (annual + summary)
  fetchNaverFinance: (code)   => ipcRenderer.invoke('fetch-naver-finance', code),
  // API 키 암호화 저장/불러오기/삭제/확인 (safeStorage)
  saveApiKey:   (broker, fields) => ipcRenderer.invoke('save-api-key', { broker, fields }),
  loadApiKey:   (broker)         => ipcRenderer.invoke('load-api-key', broker),
  deleteApiKey: (broker)         => ipcRenderer.invoke('delete-api-key', broker),
  checkApiKey:  (broker)         => ipcRenderer.invoke('check-api-key', broker),
  // 앱 버전 (package.json version 반환)
  getVersion: () => ipcRenderer.invoke('get-version'),
  // KRX 전종목 데이터 조회 (KOSPI + KOSDAQ, 캐시 포함, 레거시 유지)
  fetchKrxStocks: () => ipcRenderer.invoke('fetch-krx-stocks'),
  // 네이버 증권 전종목 조회 (KOSPI / KOSDAQ / ETF, 시총 1,000억 이상)
  fetchNaverStocks: (market) => ipcRenderer.invoke('fetch-naver-stocks', market),
  // 종목 상세 정보 (팝업: PER·PBR·EPS, 시총·상장주식수·상장일, 52주 최고·최저, 배당)
  fetchStockDetail: (code) => ipcRenderer.invoke('fetch-stock-detail', code),
  // 시장 지수 티커 일괄 조회 (KOSPI·KOSDAQ·나스닥·S&P·DOW·SOX·환율·WTI 등)
  fetchMarketTickers: () => ipcRenderer.invoke('fetch-market-tickers'),
  // KIS 실시간 호가 (매도5+매수5 잔량)
  fetchHoga: (code) => ipcRenderer.invoke('fetch-hoga', code),
  // KIS 계좌 잔고 조회 (예수금 + 보유종목)
  fetchKisBalance: () => ipcRenderer.invoke('fetch-kis-balance'),
  // main 프로세스가 did-finish-load 후 파일 데이터를 직접 push하는 채널
  onPushState: (callback)  => ipcRenderer.once('push-state', (_event, data) => callback(data)),

  // ── KIS WebSocket 실시간 시세 ──
  startRealtimePrice: (tickers) => ipcRenderer.invoke('start-kis-realtime', tickers),
  stopRealtimePrice:  ()        => ipcRenderer.invoke('stop-kis-realtime'),
  getWsStatus:        ()        => ipcRenderer.invoke('get-kis-ws-status'),
  // 실시간 가격 업데이트 수신: { ticker, price, change, changePct }
  onRealtimePrice: (cb) => ipcRenderer.on('kis-price-update', (_e, d) => cb(d)),
  offRealtimePrice: ()  => ipcRenderer.removeAllListeners('kis-price-update'),
  // WebSocket 연결 상태 변화 수신: 'connecting' | 'connected' | 'disconnected' | 'error' | 'no-key'
  onWsStatus: (cb) => ipcRenderer.on('kis-ws-status', (_e, s) => cb(s)),
  offWsStatus: ()  => ipcRenderer.removeAllListeners('kis-ws-status'),
});
