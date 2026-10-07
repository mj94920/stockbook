// Optional local integration: imports the actual I-Character-Project core, never copies it.
const root = document.getElementById('sbAgent');
const status = root?.querySelector('.agent-status');
try {
  const config = window.stockbookCharacterConfig || await fetch('/character-config.json').then(r => r.json());
  if (!config.enabled) throw new Error('CHARACTER_PROJECT 경로를 지정하면 기존 캐릭터 코어가 연결됩니다.');
  const { DesktopPetAgent } = await import(config.moduleUrl);
  const { createAgentResponse } = await import(new URL('../../shared/core/src/protocol/agent-response.js', new URL(config.moduleUrl, location.href)));
  const character = document.createElement('div'); character.className = 'agent-row agent-character';
  const sprite = document.createElement('img'); sprite.alt = '기존 아린 스프라이트';
  sprite.width = 90; sprite.height = 120; sprite.style.objectFit = 'contain'; sprite.src = config.sprites.neutral;
  const reply = document.createElement('p'); reply.setAttribute('aria-live', 'polite');
  character.append(sprite, reply);
  root.querySelector('.agent-body').insertBefore(character, root.querySelector('.agent-actions'));
  const form = document.createElement('form'); form.className = 'agent-search'; form.id = 'sbCharacterChat';
  form.innerHTML = '<input class="sb-input" maxlength="100" aria-label="아린에게 Stockbook 요청" placeholder="내 평가손익은? / 삼성 검색"><button type="submit" class="sb-btn">보내기</button>';
  character.after(form);
  const provider = {
    async respond(input) {
      const value = typeof input === 'string' ? input : input?.text || input?.input || '';
      const query = String(value).trim();
      let tool; let args = {};
      if (/^(내\s*)?(평가)?손익(은)?[?？]?$/.test(query)) tool = 'summary';
      else if (/^관심종목(\s*보여줘)?[?？]?$/.test(query)) tool = 'watchlist';
      else if (/^(계좌|계좌·보유|보유종목)(\s*보여줘)?[?？]?$/.test(query)) tool = 'accounts';
      else if (/\s검색$/.test(query)) { tool = 'search'; args = { query: query.replace(/\s검색$/, ''), market: root.querySelector('#sbAgentMarket').value }; }
      else return createAgentResponse({ text: '관심종목, 계좌·보유, 내 평가손익은? 또는 “종목명 검색”으로 요청해 주세요.', emotion: 'neutral', action: 'idle', durationMs: 0 });
      const response = await window.stockbookAgentPanel.run(tool, args);
      if (!response.ok) return createAgentResponse({ text: response.error, emotion: 'worried', action: 'idle', durationMs: 0 });
      const data = response.data;
      const amount = n => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
      const message = tool === 'summary'
        ? `평가손익은 ${amount(data.pnl)}원, 수익률은 ${amount(data.rate)}%입니다. 현재가 미입력 ${data.missingPrices}건은 평균단가 기준입니다.`
        : tool === 'accounts' ? `등록된 계좌 ${data.items.length}개와 계좌 미지정 보유 ${data.unassigned.length}건을 확인했습니다.`
        : `${tool === 'search' ? '검색 결과' : '관심종목'} ${data.total ?? data.items.length}건을 확인했습니다.`;
      return createAgentResponse({ text: message, emotion: 'neutral', action: 'idle', durationMs: 0 });
    }
  };
  const agent = new DesktopPetAgent({ provider, settings: { characterName: '아린' }, render(snapshot) {
    reply.textContent = snapshot.displayText;
    sprite.src = config.sprites[snapshot.emotion] || config.sprites.neutral;
    character.dataset.emotion = snapshot.emotion;
  } });
  window.stockbookCharacter = agent;
  form.onsubmit = async e => {
    e.preventDefault(); const input = form.querySelector('input'); const button = form.querySelector('button');
    if (!input.value.trim() || button.disabled) return;
    button.disabled = true;
    try { await agent.send(input.value); } finally { button.disabled = false; }
  };
  sprite.onclick = () => agent.tap();
  window.addEventListener('pagehide', () => agent.close(), { once: true });
  status.textContent = '아린 · 기존 DesktopPetAgent 연결 · 로컬 요청 목업 (LLM 미사용)';
} catch (e) { if (status) status.textContent = e.message; }
