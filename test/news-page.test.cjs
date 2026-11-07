'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {publicPage,pageBounds,registerNewsPage}=require('../src/news/page.cjs');
const {registerNews}=require('../src/news/service.cjs');
const article='https://n.news.naver.com/mnews/article/469/0001234567';
const publisher='https://www.publisher.example/News/Read/abc';
const bounds={x:500,y:200,width:400,height:400};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(resolvePage=async()=>publisher,load=async()=>{}) {
 const handles=new Map(),events=new Map(),views=[],children=[],messages=[];
 const session=new EventEmitter();session.setPermissionRequestHandler=fn=>session.permission=fn;session.setPermissionCheckHandler=fn=>session.check=fn;session.webRequest={onBeforeRequest:fn=>session.filter=fn};
 const main={isDestroyed:()=>false,getContentSize:()=>[1400,900],contentView:{addChildView:v=>children.push(v),removeChildView:v=>children.splice(children.indexOf(v),1)},webContents:{mainFrame:{},getZoomFactor:()=>1,send:(...v)=>messages.push(v)}};
 class View {
  constructor(options){this.options=options;this.visible=false;views.push(this);const wc=new EventEmitter();this.webContents=wc;wc.session=session;wc.url='';wc.dead=false;wc.isDestroyed=()=>wc.dead;wc.close=()=>{wc.dead=true;};wc.setWindowOpenHandler=fn=>wc.popup=fn;wc.getURL=()=>wc.url;wc.loadURL=async url=>{wc.url=url;return load(url,wc);};}
  setBounds(value){this.bounds=value;}setVisible(value){this.visible=value;}
 }
 const controller=registerNewsPage({ipcMain:{handle:(key,fn)=>handles.set(key,fn),on:(key,fn)=>events.set(key,fn)},WebContentsView:View,getMainWindow:()=>main,resolvePage});
 const event={sender:main.webContents,senderFrame:main.webContents.mainFrame};
 const open=(value={},source=event)=>handles.get('open-news-page')(source,{id:'news-1',url:article,source:'publisher',bounds,...value});
 return {main,views,children,messages,session,event,open,close:()=>handles.get('close-news-page')(event),layout:value=>events.get('news-page-bounds')(event,value),controller};
}
test('native news URL and bounds reject local destinations, credentials, protocols and invalid zoomed rectangles',()=>{
 assert.equal(publicPage(publisher).href,publisher);
 for(const value of ['http://www.publisher.example/','file:///tmp/a','javascript:alert(1)','https://user:pass@www.publisher.example/','https://www.publisher.example:8443/','https://localhost/','https://localhost./','https://a.home.arpa/','https://a.local/','https://a.internal/','https://127.1/','https://2130706433/','https://[::1]/'])assert.throws(()=>publicPage(value));
 const main={webContents:{getZoomFactor:()=>1.25},getContentSize:()=>[1000,800]};
 assert.deepEqual(pageBounds({x:10,y:20,width:200,height:300},main),{x:13,y:25,width:250,height:375});
 for(const value of [null,{}, {...bounds,x:-1},{...bounds,width:Infinity},{...bounds,width:2000}])assert.equal(pageBounds(value,main),null);
});
test('original destination is derived in main from a canonical provider article, even without text body',async()=>{
 const handles=new Map(),main={webContents:{}},calls=[];
 const news=registerNews({ipcMain:{handle:(key,fn)=>handles.set(key,fn)},getMainWindow:()=>main,headers:{},httpsGet:async url=>{calls.push(url);return '<a class="media_end_head_origin_link" href="http://www.publisher.example/News/Read/abc">원문</a>';}});
 assert.equal(await news.resolvePage(article,'publisher'),publisher);
 assert.equal(await news.resolvePage(article,'naver'),article);
 assert.equal(await news.resolvePage('https://www.bloter.net/news/articleView.html?idxno=123','publisher'),'https://www.bloter.net/news/articleView.html?idxno=123');
 await assert.rejects(()=>news.resolvePage(publisher,'publisher'));assert.deepEqual(calls,[article]);
});
test('native article view has no app preload, blocks remote IPC, local resources, popups, permissions and downloads',async()=>{
 const h=harness();
 try{
  assert.equal((await h.open({}, {sender:{}})).ok,false);assert.equal((await h.open({}, {sender:h.main.webContents,senderFrame:{}})).ok,false);assert.equal(h.views.length,0);
  assert.equal((await h.open()).ok,true);const view=h.views[0],wc=view.webContents,prefs=view.options.webPreferences;
  assert.equal(prefs.contextIsolation,true);assert.equal(prefs.nodeIntegration,false);assert.equal(prefs.sandbox,true);assert.equal(prefs.webSecurity,true);assert.equal(prefs.preload,undefined);assert.ok(!prefs.partition.startsWith('persist:'));
  assert.equal(view.visible,true);assert.deepEqual(view.bounds,bounds);assert.deepEqual(wc.popup({url:'https://evil.example/'}),{action:'deny'});
  assert.equal((await h.open({}, {sender:wc})).ok,false);
  let permission;h.session.permission(wc,'media',value=>permission=value);assert.equal(permission,false);assert.equal(h.session.check(),false);
  let prevented=false;h.session.emit('will-download',{preventDefault:()=>prevented=true});assert.equal(prevented,true);
  for(const [url,type,allowed] of [[publisher,'mainFrame',true],['https://cdn.publisher.example/photo.jpg','image',true],['https://evil.example/','mainFrame',false],['https://127.0.0.1/','image',false],['file:///tmp/key','image',false],['http://cdn.publisher.example/a','image',false],['data:image/png;base64,AAAA','image',true],['data:text/html,x','mainFrame',false]]) {
   let result;h.session.filter({url,resourceType:type},r=>result=r);assert.equal(result.cancel,!allowed,url);
  }
  for(const [event,url,isMainFrame] of [['will-navigate','file:///tmp/key',true],['will-navigate','https://evil.example/',true],['will-navigate',publisher+'?another=1',true],['will-redirect','https://evil.example/',true]]){
   let denied=false;wc.emit(event,{preventDefault:()=>denied=true},url,false,isMainFrame);assert.equal(denied,true);
  }
  let denied=false;wc.emit('will-redirect',{preventDefault:()=>denied=true},publisher+'/canonical',false,true);assert.equal(denied,false);
 }finally{await h.close();}
 assert.equal(h.views[0].webContents.dead,true);assert.equal(h.children.length,0);
});
test('hide during publisher resolution and loading is retained; stale bounds cannot expose another article',async()=>{
 const resolution=deferred(),loaded=deferred();const h=harness(()=>resolution.promise,()=>loaded.promise);
 try{
  const pending=h.open();h.layout({id:'news-1',bounds:null});resolution.resolve(publisher);await new Promise(setImmediate);
  assert.equal(h.views[0].visible,false);loaded.resolve();assert.equal((await pending).ok,true);assert.equal(h.views[0].visible,false);
  h.layout({id:'news-other',bounds});assert.equal(h.views[0].visible,false);
  h.layout({id:'news-1',bounds});assert.equal(h.views[0].visible,true);
  h.layout({id:'news-1',bounds:null});assert.equal(h.views[0].visible,false);
 }finally{await h.close();}
});
test('new selection and close cancel late resolution; load failure and renderer crash release native contents',async()=>{
 const resolution=deferred();let calls=0;const h=harness(()=>++calls===1?resolution.promise:Promise.resolve(publisher));
 try{
  const old=h.open();assert.equal((await h.open({id:'news-2'})).ok,true);resolution.resolve(publisher);assert.equal((await old).cancelled,true);assert.equal(h.views.length,1);
  const wc=h.views[0].webContents;wc.emit('render-process-gone');assert.equal(wc.dead,true);assert.equal(h.children.length,0);assert.deepEqual(h.messages[0],['news-page-failed',{id:'news-2'}]);
 }finally{await h.close();}
 const failure=harness(async()=>publisher,async()=>{throw Error('network');});assert.equal((await failure.open()).ok,false);assert.equal(failure.children.length,0);assert.equal(failure.views[0].webContents.dead,true);
 const late=deferred(),closed=harness(()=>late.promise);const pending=closed.open();await closed.close();late.resolve(publisher);assert.equal((await pending).cancelled,true);assert.equal(closed.views.length,0);
});
