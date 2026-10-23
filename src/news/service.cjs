'use strict';

const { articleUrl, articleText } = require('./article.cjs');
const { newsItems } = require('./list.cjs');

function registerNews({ ipcMain, getMainWindow, httpsGet, headers }) {
  const isMain = event => {
    const main = getMainWindow();
    return !!main && event.sender === main.webContents;
  };
  ipcMain.handle('fetch-news', async (event, opts) => {
    if (!isMain(event)) return { ok:false, items:[], error:'요청한 화면을 확인할 수 없습니다.' };
    const kind = opts?.kind || 'market';
    const code = String(opts?.code || '').trim();
    if (!['market', 'stock'].includes(kind) || (kind === 'stock' && !/^\d{6}$/.test(code))) {
      return { ok:false, items:[], error:'국내 종목(6자리 코드)과 시장뉴스만 지원합니다.' };
    }
    // Fixed provider destinations only; never accept a renderer-supplied URL.
    const url = kind === 'stock'
      ? `https://m.stock.naver.com/api/news/stock/${code}?pageSize=20&page=1`
      : 'https://m.stock.naver.com/api/news/list?category=mainnews&pageSize=30&page=1';
    try {
      const items = newsItems(JSON.parse(await httpsGet(url, 10000, headers)), kind === 'stock' ? code : '');
      return items.length ? { ok:true, items } : { ok:false, items:[], error:'뉴스 데이터를 찾지 못했습니다.' };
    } catch {
      return { ok:false, items:[], error:'뉴스를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.' };
    }
  });

  ipcMain.handle('fetch-news-article', async (event, value) => {
    if (!isMain(event)) return { ok:false, error:'요청한 화면을 확인할 수 없습니다.' };
    try {
      const url = articleUrl(value);
      const body = articleText(await httpsGet(url, 12000, headers));
      return { ok:true, url, body };
    } catch {
      return { ok:false, error:'본문을 불러오지 못했습니다. 수신한 요약과 원문 링크를 이용해 주세요.' };
    }
  });
}

module.exports = { registerNews };
