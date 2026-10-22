(() => {
  'use strict';
  if (document.getElementById('sbAgent')) return;
  const style = document.createElement('style');
  style.textContent = `
    #sbAgent { position:fixed; right:var(--sb-space-4); bottom:var(--sb-space-4); z-index:10000;
      width:min(360px, calc(100vw - 32px)); color:var(--sb-text-1); font-family:var(--sb-font-ko); }
    #sbAgent .agent-body { background:var(--sb-panel); border:1px solid var(--sb-border-weak);
      border-radius:var(--sb-radius-3); padding:var(--sb-space-4); box-shadow:var(--sb-shadow-2);
      max-height:calc(100vh - 120px); overflow:auto; margin-bottom:var(--sb-space-2); }
    #sbAgent [hidden] { display:none !important; }
    #sbAgent .agent-row { display:flex; align-items:center; gap:var(--sb-space-2); flex-wrap:wrap; }
    #sbAgent h2 { font-size:16px; margin:0; flex:1; }
    #sbAgent p { color:var(--sb-text-2); font-size:13px; line-height:1.5; }
    #sbAgent .agent-actions { display:grid; grid-template-columns:1fr 1fr; gap:var(--sb-space-2); }
    #sbAgent .agent-search { display:flex; gap:var(--sb-space-2); margin-top:var(--sb-space-3); }
    #sbAgent .agent-search input { min-width:0; flex:1; }
    #sbAgent .agent-search select { width:auto; max-width:100px; }
    #sbAgent .agent-character p { flex:1; min-width:140px; }
    #sbAgent .agent-stats { display:grid; grid-template-columns:1fr 1fr; gap:var(--sb-space-2); }
    #sbAgent .sb-stat__value { font-size:18px; }
    #sbAgent .agent-result { margin-top:var(--sb-space-3); font-size:13px; }
    #sbAgent .agent-item { border-bottom:1px solid var(--sb-border-weak); padding:var(--sb-space-2) 0; }
    #sbAgent .sb-stat { margin-bottom:var(--sb-space-2); }
    #sbAgent .agent-launcher { display:flex; justify-content:flex-end; }
    #sbAgent .agent-status { color:var(--sb-text-3); font-size:12px; }
  `;
  document.head.appendChild(style);
  const root = document.createElement('aside');
  root.id = 'sbAgent'; root.setAttribute('aria-label', 'Stockbook 에이전트');
  root.innerHTML = `<section class="agent-body" id="sbAgentBody" hidden>
    <div class="agent-row"><h2>Stock Book 연결</h2><button type="button" class="sb-btn sb-btn--ghost sb-btn--sm" id="sbAgentClose" aria-label="에이전트 패널 닫기">✕</button></div>
    <p>관심종목과 내 자산을 확인하고, 기존 Stockbook 화면으로 이어갑니다.</p>
    <div class="agent-actions">
      <button type="button" class="sb-btn" data-tool="watchlist">관심종목 보여줘</button>
      <button type="button" class="sb-btn" data-tool="accounts">계좌·보유 보여줘</button>
      <button type="button" class="sb-btn" data-tool="summary">내 평가손익은?</button>
      <button type="button" class="sb-btn sb-btn--ghost" id="sbAgentTheme">테마 전환</button>
    </div>
    <form class="agent-search" id="sbAgentSearch">
      <select class="sb-select" id="sbAgentMarket" aria-label="시장"><option>KOSPI</option><option>KOSDAQ</option></select>
      <input class="sb-input" id="sbAgentQuery" maxlength="100" placeholder="종목명·코드·업종" aria-label="전종목 검색어">
      <button type="submit" class="sb-btn">조회</button>
    </form>
    <p class="agent-status">캐릭터 연결 대기 · 버튼으로 도구 호출 체험<br>브라우저는 저장 데이터, 실시간 조회는 Electron에서 지원</p>
    <div class="agent-result" id="sbAgentResult" role="status" aria-live="polite">확인할 기능을 선택하세요.</div>
  </section>
  <div class="agent-launcher"><button type="button" class="sb-btn" id="sbAgentToggle" aria-controls="sbAgentBody" aria-expanded="false">Stockbook 에이전트</button></div>`;
  document.body.appendChild(root);
  const body = root.querySelector('#sbAgentBody');
  const toggle = root.querySelector('#sbAgentToggle');
  const result = root.querySelector('#sbAgentResult');
  const setOpen = show => { body.hidden = !show; toggle.setAttribute('aria-expanded', String(show)); if (show) root.querySelector('[data-tool]')?.focus(); };
  toggle.onclick = () => setOpen(body.hidden);
  root.querySelector('#sbAgentClose').onclick = () => { setOpen(false); toggle.focus(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !body.hidden) { setOpen(false); toggle.focus(); } }, true);
  root.querySelector('#sbAgentTheme').onclick = () => toggleTheme();
  const text = (value, cls = '') => { const node = document.createElement('div'); node.className = cls; node.textContent = value; return node; };
  const number = value => value == null ? '미조회' : Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const button = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sb-btn sb-btn--ghost sb-btn--sm'; b.textContent = label; b.onclick = fn; return b; };
  let serial = 0;
  async function run(tool, args) {
    const request = ++serial;
    result.replaceChildren(text('조회 중…'));
    const response = await window.stockbookAgent.call(tool, args);
    if (request !== serial) return response;
    result.replaceChildren();
    if (!response.ok) { result.append(text(response.error)); return response; }
    const data = response.data;
    const show = screen => run('show', { screen });
    if (tool === 'summary') {
      const stats = text('', 'agent-stats');
      for (const [label, value] of [['총자산', data.total], ['예수금', data.cash], ['평가금액', data.evalTotal], ['평가손익', data.pnl]]) {
        const card = text('', 'sb-stat');
        card.append(text(label, 'sb-stat__label'), text(number(value) + '원', 'sb-stat__value' + (label === '평가손익' ? (value > 0 ? ' sb-up' : value < 0 ? ' sb-down' : ' sb-flat') : '')));
        stats.append(card);
      }
      result.append(stats);
      result.append(text(`수익률 ${number(data.rate)}% · 보유 ${data.holdings}건`));
      result.append(text(`현재가 미입력 ${data.missingPrices}건: 평균단가로 계산`, 'agent-status'));
      result.append(button('포트폴리오 열기', () => show('portfolio')));
    } else if (tool === 'accounts') {
      data.items.forEach(a => {
        result.append(text(`${a.nickname || a.broker} · 예수금 ${number(a.cash)}원`, 'agent-item'));
        a.holdings.forEach(s => result.append(text(`${s.name || s.ticker} · ${number(s.qty)}주 · 현재가 ${number(s.currentPrice)}`)));
      });
      data.unassigned.forEach(s => result.append(text(`계좌 미지정 · ${s.name || s.ticker} ${number(s.qty)}주`, 'agent-item')));
      if (!data.items.length && !data.unassigned.length) result.append(text('등록된 계좌·보유종목이 없습니다.'));
      result.append(button('기존 계좌 관리', () => show('accounts')), button('포트폴리오 열기', () => show('portfolio')));
    } else if (tool === 'watchlist' || tool === 'search') {
      if (!data.items.length) result.append(text(tool === 'search' ? '검색 결과가 없습니다.' : '등록된 관심종목이 없습니다.'));
      data.items.forEach(s => {
        const row = text(`${s.name || s.ticker || s.code} · ${s.ticker || s.code || ''} · ${number(s.price)}`, 'agent-item');
        const code = s.ticker || s.code;
        if (/^\d{6}$/.test(code || '')) row.append(button('상세', () => run('detail', { code })));
        result.append(row);
      });
      if (data.basis) result.append(text(`${data.total}건 · ${data.basis}`, 'agent-status'));
      result.append(button('Stockbook 화면 열기', () => show(tool === 'search' ? 'search' : 'watchlist')));
    } else { result.append(text('기존 Stockbook 화면을 열었습니다.')); setOpen(false); }
    return response;
  }
  root.querySelectorAll('[data-tool]').forEach(b => { b.onclick = () => run(b.dataset.tool); });
  root.querySelector('#sbAgentSearch').onsubmit = e => { e.preventDefault(); run('search', { query: root.querySelector('#sbAgentQuery').value.trim(), market: root.querySelector('#sbAgentMarket').value }); };
  // Character renderer can call the same API and optionally mount itself here.
  window.stockbookAgentPanel = Object.freeze({ open: () => setOpen(true), close: () => setOpen(false), run });
})();
