'use strict';
const {articleUrl,htmlContent,attributes,decode}=require('./article.cjs');
const plain=value=>decode(value.replace(/<[^>]*>/g,'')).trim();

// Verified against Bloter's public /news/articleList.html?view_type=sm on
// 2026-10-23: section-list > ul.type1 > li, h2 titles and em.info.dated.
function bloterItems(html) {
  const content=htmlContent(html,['section-list']),items=[],seen=new Set();
  for(const match of content.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)) {
    const heading=/<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/i.exec(match[1]);
    const link=heading&&/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/i.exec(heading[1]);
    if(!link)continue;
    let url;try{url=articleUrl(new URL(attributes(link[1]).href,'https://www.bloter.net/').href);}catch{continue;}
    if(new URL(url).hostname!=='www.bloter.net'||seen.has(url))continue;
    const title=plain(link[2]);if(!title)continue;
    let timeLabel='';
    for(const date of match[1].matchAll(/<em\b([^>]*)>([\s\S]*?)<\/em\s*>/gi))if(String(attributes(date[1]).class||'').split(/\s+/).includes('dated'))timeLabel=plain(date[2]);
    seen.add(url);
    // The list omits the year. Keep its label without inventing a timestamp;
    // selecting the article obtains the full ISO date from its observed meta.
    items.push({id:'bloter-'+new URL(url).searchParams.get('idxno'),title,source:'블로터',summary:'',time:'',timeLabel,code:'',url});
    if(items.length===30)break;
  }
  return items;
}
module.exports={bloterItems};
