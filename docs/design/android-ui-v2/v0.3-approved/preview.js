// Local preview navigation. This does not implement app routes or data access.
const status=document.querySelector('[data-preview-status]');
const notify=()=>{if(status)status.textContent='이 연결의 대상 화면은 이번 승인 인계 범위에 포함되지 않습니다.';};
document.querySelectorAll('button[data-go],button[data-dialog],button[data-outside-scope]').forEach(button=>button.addEventListener('click',notify));
document.querySelectorAll('button[data-nav]').forEach(button=>button.addEventListener('click',()=>{
 const target=button.dataset.nav;
 if(target==='home')location.href='home.html';
 else if(target==='market')location.href='news-disclosures.html';
 else notify();
}));
if(typeof lucide!=='undefined')lucide.createIcons();
