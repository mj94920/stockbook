'use strict';
function articleUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'n.news.naver.com' || url.port || url.username || url.password ||
      !/^\/mnews\/article\/\d{3}\/\d{6,12}\/?$/.test(url.pathname)) throw new Error('지원하는 기사 원문 주소가 아닙니다.');
  return url.origin + url.pathname.replace(/\/$/, '');
}
function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    const key = entity.toLowerCase();
    const named = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    if (key in named) return named[key];
    const n = key.startsWith('#x') ? parseInt(key.slice(2),16) : parseInt(key.slice(1),10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
  });
}
function articleText(html) {
  if (typeof html !== 'string' || html.length > 4_000_000) throw new Error('기사 본문을 읽을 수 없습니다.');
  const clean = html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  const open = /<(article|div)\b[^>]*\sid\s*=\s*["'](?:dic_area|articleBodyContents)["'][^>]*>/i.exec(clean);
  if (!open) throw new Error('제공된 페이지에서 기사 본문을 찾지 못했습니다.');
  const start = open.index + open[0].length;
  const tags = new RegExp('<\\/?'+open[1]+'\\b[^>]*>','gi'); tags.lastIndex = start;
  let depth = 1, end = -1, match;
  while ((match = tags.exec(clean))) {
    if (match[0].startsWith('</')) depth--; else if (!match[0].endsWith('/>')) depth++;
    if (!depth) {end=match.index;break;}
  }
  if (end < 0) throw new Error('기사 본문이 완전하게 수신되지 않았습니다.');
  const text = decode(clean.slice(start,end).replace(/<\/?(?:p|div|br|h[1-6]|figure|figcaption|blockquote|li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,''))
    .replace(/[ \t\r]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if (!text) throw new Error('제공된 기사 본문이 비어 있습니다.');
  return text;
}
module.exports = { articleUrl, articleText };
