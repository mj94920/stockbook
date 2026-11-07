(function(root){
 'use strict';
 const doc=root.document;let registry=[];
 const visible=el=>!!el&&!el.hidden&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
 function overlays(){
  return registry.map(([id,close])=>({el:doc.getElementById(id),close})).filter(({el})=>visible(el)&&(el.classList.contains('open')||el.style.display==='flex')).sort((a,b)=>(parseInt(getComputedStyle(a.el).zIndex)||0)-(parseInt(getComputedStyle(b.el).zIndex)||0)||(a.el.compareDocumentPosition(b.el)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1));
 }
 function topDialog(){return doc.activeElement?.closest('dialog[open]')||[...doc.querySelectorAll('dialog[open]')].at(-1);}
 function closeTop(){
  const dialog=topDialog();if(dialog){if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();return true;}
  const top=overlays().at(-1);if(!top)return false;top.close();return true;
 }
 const escape=e=>e.key==='Escape'&&!e.defaultPrevented&&!e.repeat&&!e.isComposing&&!e.ctrlKey&&!e.altKey&&!e.metaKey;
 function mount(modals){
  registry=[...modals,...[['accountPanel','closeAccountPanel'],['apiPanel','closeApiPanel'],['analysisDrawer','closeAnalysisDrawer'],['calPanel','closeCalendarPanel']].map(([id,fn])=>[id,()=>root[fn]?.()]),...['transferModal','_wlGroupModal','_wlDelModal'].map(id=>[id,()=>doc.getElementById(id)?.remove()])];
  doc.addEventListener('keydown',e=>{
   if(!escape(e))return;
   let closed=closeTop();
   if(!closed){const menu=['acctDropList','hdrIdxMenu','wlDropdown','qoDropdown'].map(id=>doc.getElementById(id)).find(visible);if(menu){menu.style.display='none';closed=true;}}
   if(closed){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  root.addEventListener('keydown',e=>{
   if(!escape(e)||e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')||!root._MDI)return;
   if(root._MDI.dock){const pid=doc.getElementById('mdiWorkspace')?.dataset.dockScreen;if(pid&&pid!==root._MDI.DOCK_HOME){root._MDI.close(pid);e.preventDefault();}}
   else{const panel=[...doc.querySelectorAll('.mdi-panel')].filter(el=>el.dataset.mdiState!=='closed'&&visible(el)).sort((a,b)=>(parseInt(a.style.zIndex)||0)-(parseInt(b.style.zIndex)||0)).at(-1);if(panel){root._MDI.close(panel.dataset.pid);e.preventDefault();}}
  });
 }
 root.StockBookShortcuts=Object.freeze({mount,hasOverlay:()=>!!topDialog()||overlays().length>0});
})(window);
