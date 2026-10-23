'use strict';
const { isIP } = require('node:net');

// Publisher URLs come from the selected, validated provider article in main.
// A renderer cannot supply a new destination, local address or custom protocol.
function publicPage(value) {
  if (typeof value !== 'string' || value.length > 8192) throw Error('지원하지 않는 원문 주소');
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/,'');
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      isIP(host) || host.includes(':') || !host.includes('.') ||
      /(?:^|\.)(?:localhost|local|localdomain|internal|lan|home|invalid|home\.arpa)$/.test(host) ||
      /^\d+(?:\.\d+)*$/.test(host)) throw Error('지원하지 않는 원문 주소');
  return url;
}
function pageBounds(input, main) {
  if (!input || !['x','y','width','height'].every(k => Number.isFinite(input[k]))) return null;
  const zoom = main.webContents.getZoomFactor();
  const [width,height] = main.getContentSize();
  const rect = Object.fromEntries(['x','y','width','height'].map(k => [k,Math.round(input[k]*zoom)]));
  if (rect.x < 0 || rect.y < 0 || rect.width < 16 || rect.height < 16 || rect.x+rect.width > width+1 || rect.y+rect.height > height+1) return null;
  rect.width = Math.min(rect.width,width-rect.x);rect.height = Math.min(rect.height,height-rect.y);
  return rect;
}
function registerNewsPage({ ipcMain, WebContentsView, getMainWindow, resolvePage }) {
  let current = null, generation = 0;
  const guardedSessions = new WeakSet();
  const fromMain = event => {
    const main = getMainWindow();
    return main && !main.isDestroyed() && event.sender === main.webContents &&
      (!event.senderFrame || event.senderFrame === main.webContents.mainFrame);
  };
  const dispose = () => {
    generation++;
    const old = current;current = null;
    if (!old) return;
    clearTimeout(old.timer);
    if (old.view && !old.main.isDestroyed()) old.main.contentView.removeChildView(old.view);
    if (old.view && !old.view.webContents.isDestroyed()) old.view.webContents.close();
  };
  const layout = value => {
    if (!current || value?.id !== current.id) return;
    current.bounds = pageBounds(value.bounds,current.main);
    if (current.view) {
      if (current.bounds) current.view.setBounds(current.bounds);
      current.view.setVisible(!!current.bounds && current.ready);
    }
  };
  ipcMain.on('news-page-bounds',(event,value) => {if (fromMain(event)) layout(value);});
  ipcMain.handle('close-news-page',event => {if (!fromMain(event)) return {ok:false};dispose();return {ok:true};});
  ipcMain.handle('open-news-page',async(event,input) => {
    if (!fromMain(event)) return {ok:false};
    dispose();const request = generation;
    try {
      if (!input || !/^[a-z0-9-]{1,80}$/i.test(input.id) || !['publisher','naver'].includes(input.source)) throw Error();
      const main = getMainWindow();
      const entry = {view:null,main,id:input.id,ready:false,bounds:null,timer:null};current = entry;
      layout({id:input.id,bounds:input.bounds});
      const destination = publicPage(await resolvePage(input.url,input.source));
      if (request !== generation) return {ok:false,cancelled:true};
      const view = new WebContentsView({webPreferences:{
        contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,
        partition:'stockbook-news',navigateOnDragDrop:false,
      }});
      entry.view = view;
      view.setVisible(false);main.contentView.addChildView(view);
      const wc = view.webContents, session = wc.session;
      if (!guardedSessions.has(session)) {
        guardedSessions.add(session);
        session.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
        session.setPermissionCheckHandler(() => false);
        session.on('will-download',event => event.preventDefault());
      }
      // Preserve Chromium TLS/CSP/X-Frame-Options. No header rewriting or app preload.
      session.webRequest.onBeforeRequest((details,callback) => {
        let allowed = false;
        try {
          const url = new URL(details.url);
          allowed = ['data:','blob:'].includes(url.protocol) && details.resourceType !== 'mainFrame';
          if (url.protocol === 'wss:') url.protocol = 'https:';
          if (url.protocol === 'https:') {publicPage(url.href);allowed = details.resourceType !== 'mainFrame' || url.origin === destination.origin;}
        } catch {}
        callback({cancel:!allowed});
      });
      wc.setWindowOpenHandler(() => ({action:'deny'}));
      wc.on('will-attach-webview',event => event.preventDefault());
      wc.on('will-navigate',(event,url) => {
        try {const next = publicPage(url);next.hash='';const loaded=new URL(wc.getURL());loaded.hash='';if(next.href===loaded.href)return;} catch {}
        event.preventDefault();
      });
      wc.on('will-redirect',(event,url,_inPlace,isMainFrame) => {
        if (!isMainFrame) return;
        try {if(publicPage(url).origin===destination.origin)return;} catch {}
        event.preventDefault();
      });
      const fail = () => {
        if (current !== entry) return;
        main.webContents.send('news-page-failed',{id:entry.id});dispose();
      };
      wc.on('render-process-gone',fail);
      wc.on('did-fail-load',(_event,code,_description,_url,isMainFrame) => {if(isMainFrame && code!==-3)fail();});
      if(entry.bounds)view.setBounds(entry.bounds);
      entry.timer = setTimeout(fail,20000);
      await wc.loadURL(destination.href);
      clearTimeout(entry.timer);
      if (current !== entry) return {ok:false,cancelled:true};
      entry.ready = true;
      view.setVisible(!!entry.bounds);
      return {ok:true,url:wc.getURL() || destination.href};
    } catch {
      if (request !== generation) return {ok:false,cancelled:true};
      dispose();return {ok:false,error:'원문 페이지를 열지 못했습니다. 네이버 기사나 본문만 보기를 이용해 주세요.'};
    }
  });
  return {close:dispose};
}
module.exports = { publicPage, pageBounds, registerNewsPage };
