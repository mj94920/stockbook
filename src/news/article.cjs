'use strict';
function articleUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol === 'https:' && !url.port && !url.username && !url.password) {
    if (url.hostname === 'n.news.naver.com' && /^\/mnews\/article\/\d{3}\/\d{6,12}\/?$/.test(url.pathname)) return url.origin + url.pathname.replace(/\/$/, '');
    const ids = url.searchParams.getAll('idxno');
    if (url.hostname === 'www.bloter.net' && url.pathname === '/news/articleView.html' && ids.length === 1 && /^\d{1,12}$/.test(ids[0])) return `${url.origin}${url.pathname}?idxno=${ids[0]}`;
  }
  throw new Error('지원하는 기사 원문 주소가 아닙니다.');
}
function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
    const key = entity.toLowerCase();
    const named = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',middot:'·',hellip:'…',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—'};
    if (Object.hasOwn(named,key)) return named[key];
    const n = key.startsWith('#x') ? parseInt(key.slice(2),16) : parseInt(key.slice(1),10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
  });
}
function cleanHtml(html) {
  if (typeof html !== 'string' || html.length > 4_000_000) throw new Error('기사 본문을 읽을 수 없습니다.');
  return html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
}
function htmlContent(html, ids) {
  const clean = cleanHtml(html);
  const allowed = ids.map(id=>id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const open = new RegExp('<(article|div|section)\\b[^>]*\\sid\\s*=\\s*["\'](?:'+allowed+')["\'][^>]*>','i').exec(clean);
  if (!open) throw new Error('제공된 페이지에서 기사 본문을 찾지 못했습니다.');
  const start = open.index + open[0].length;
  const tags = new RegExp('<\\/?'+open[1]+'\\b[^>]*>','gi'); tags.lastIndex = start;
  let depth = 1, end = -1, match;
  while ((match = tags.exec(clean))) {
    if (match[0].startsWith('</')) depth--; else if (!match[0].endsWith('/>')) depth++;
    if (!depth) {end=match.index;break;}
  }
  if (end < 0) throw new Error('기사 본문이 완전하게 수신되지 않았습니다.');
  return clean.slice(start,end);
}
function articleText(html, provider = 'naver') {
  const content = htmlContent(html,provider === 'bloter' ? ['article-view-content-div'] : ['dic_area','articleBodyContents']);
  const text = decode(content.replace(/<\/?(?:p|div|br|h[1-6]|figure|figcaption|blockquote|li|tr)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,''))
    .replace(/[ \t\r]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if (!text) throw new Error('제공된 기사 본문이 비어 있습니다.');
  return text;
}
function attributes(tag) {
  const result = Object.create(null);
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return result;
}
function publisherLink(html) {
  const clean = cleanHtml(html);
  for (const match of clean.matchAll(/<a\b[^>]*>/gi)) {
    const attr = attributes(match[0]);
    if (!String(attr.class || '').split(/\s+/).includes('media_end_head_origin_link')) continue;
    try {
      const origin = new URL(attr.href);
      if (['https:','http:'].includes(origin.protocol) && !origin.username && !origin.password && !origin.port) return origin.href;
    } catch {}
    break;
  }
  return '';
}
function articleData(html, url) {
  const provider = new URL(url).hostname === 'www.bloter.net' ? 'bloter' : 'naver';
  const result = {body:articleText(html,provider)}, clean = cleanHtml(html);
  if (provider === 'naver') {const link=publisherLink(html);if(link)result.publisherUrl=link;}
  if (provider === 'bloter') for (const match of clean.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = attributes(match[0]);
    if (attr.property === 'article:published_time' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(attr.content || '') && Number.isFinite(Date.parse(attr.content))) result.time = attr.content;
  }
  return result;
}
module.exports = { articleUrl, articleText, articleData, publisherLink, decode, htmlContent, attributes };
