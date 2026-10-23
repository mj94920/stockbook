(function () {
  'use strict';
  let current = null, nextId = 0, frame = 0;
  function bounds(host) {
    if (!host?.isConnected || document.hidden || !host.getClientRects().length) return null;
    const r = host.getBoundingClientRect();
    if (r.width < 16 || r.height < 16 || r.x < 0 || r.y < 0 || r.right > innerWidth+1 || r.bottom > innerHeight+1) return null;
    // Native views sit above DOM overlays. Hide before a dialog/drawer can be covered.
    for (const overlay of document.querySelectorAll('.modal-overlay.open,.analysis-drawer.open,#accountPanelOverlay.open')) {
      if (overlay.getClientRects().length && getComputedStyle(overlay).visibility !== 'hidden') return null;
    }
    for (const [x,y] of [[r.x+2,r.y+2],[r.right-2,r.y+2],[r.x+2,r.bottom-2],[r.right-2,r.bottom-2],[r.x+r.width/2,r.y+r.height/2]]) {
      const top = document.elementFromPoint(x,y);
      if (!top || (top !== host && !host.contains(top))) return null;
    }
    return {x:r.x,y:r.y,width:r.width,height:r.height};
  }
  function sync() {
    if (!current) return;
    const rect = bounds(current.host), key = JSON.stringify(rect);
    if (key !== current.layout) {
      current.layout = key;
      window.electronAPI?.setNewsPageBounds?.({id:current.id,bounds:rect});
    }
  }
  function tick() {sync();if(current)frame=requestAnimationFrame(tick);}
  function unmount() {
    if (!current) return;
    current = null;cancelAnimationFrame(frame);
    window.electronAPI?.closeNewsPage?.().catch(() => {});
  }
  function status(entry,text) {
    if (entry !== current) return;
    const el = document.getElementById('icPageStatus');
    if (el) el.textContent = text;
    if (entry.failed) entry.host.textContent = '원문 페이지를 열지 못했습니다. 위의 네이버 기사 또는 본문만 보기를 선택해 주세요.';
  }
  function mount(host,{url,source}) {
    if (!host || !window.electronAPI?.openNewsPage) {unmount();return;}
    const key = source+' '+url;
    if (current?.key === key) {
      current.host = host;sync();status(current,current.status);return;
    }
    unmount();
    const entry = {host,key,id:'news-'+(++nextId),layout:'',status:'원문 페이지를 불러오는 중…',failed:false};current = entry;
    status(entry,entry.status);sync();frame=requestAnimationFrame(tick);
    window.electronAPI.openNewsPage({id:entry.id,url,source,bounds:bounds(host)}).then(result => {
      if (current !== entry || result?.cancelled) return;
      entry.failed = !result?.ok;
      entry.status = result?.ok ? new URL(result.url).hostname : (result?.error || '원문 페이지를 열지 못했습니다.');
      status(entry,entry.status);
    }).catch(() => {
      entry.failed=true;entry.status='원문 페이지를 열지 못했습니다.';status(entry,entry.status);
    });
  }
  // Capture style/class changes in the same rendering turn, including modal opens.
  const observer = new MutationObserver(sync);
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','style','hidden','data-mdi-state','data-dock-screen']});
  addEventListener('resize',sync);addEventListener('scroll',sync,true);
  document.addEventListener('visibilitychange',sync);
  addEventListener('beforeunload',unmount);
  window.electronAPI?.onNewsPageFailed?.(value => {
    if (current?.id !== value?.id) return;
    current.failed=true;current.status='원문 페이지를 열지 못했습니다.';status(current,current.status);
  });
  window.StockBookNewsPage = {mount,unmount,sync};
})();
