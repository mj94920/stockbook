'use strict';

const { articleUrl, decode } = require('./article.cjs');

function plainText(value) {
  return decode(String(value || '').replace(/<[^>]*>/g, '')).trim();
}

function newsTime(value) {
  const text = String(value || '');
  if (/^\d{12}(?:\d{2})?$/.test(text)) {
    return `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}T${text.slice(8,10)}:${text.slice(10,12)}:${text.slice(12,14) || '00'}+09:00`;
  }
  return text;
}

// The stock endpoint wraps each article in items; the market endpoint uses
// tit/ohnm/subcontent directly. Both shapes were received on 2026-10-23 KST.
function newsItems(json, code = '') {
  const result = [];
  const walk = value => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.items)) { value.items.forEach(walk); return; }
    const title = plainText(value.titleFull || value.title || value.tit);
    if (!title) return;
    const office = String(value.officeId || value.oid || '');
    const article = String(value.articleId || value.aid || '');
    let url;
    try {
      url = articleUrl(/^\d{3}$/.test(office) && /^\d{6,12}$/.test(article)
        ? `https://n.news.naver.com/mnews/article/${office}/${article}`
        : value.mobileNewsUrl);
    } catch { return; }
    if (new URL(url).hostname !== 'n.news.naver.com') return;
    const [, , , oid, aid] = new URL(url).pathname.split('/');
    result.push({
      id: `${oid}-${aid}`, title,
      summary: plainText(value.body || value.summary || value.content || value.subcontent),
      source: plainText(value.officeName || value.ohnm || value.press),
      time: newsTime(value.datetime || value.dt || value.publishedAt),
      code, url,
    });
  };
  walk(json);
  return result;
}

module.exports = { newsItems };
