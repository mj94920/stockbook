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
  // KRX 전종목 데이터 조회 (KOSPI + KOSDAQ, 캐시 포함)
  fetchKrxStocks: () => ipcRenderer.invoke('fetch-krx-stocks'),
  // main 프로세스가 did-finish-load 후 파일 데이터를 직접 push하는 채널
  onPushState: (callback)  => ipcRenderer.once('push-state', (_event, data) => callback(data))
});
