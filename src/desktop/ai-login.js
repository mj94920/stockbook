(() => {
  'use strict';
  const host = document.getElementById('aiServiceLogin');
  if (!host) return;
  const api = window.electronAPI;
  let refreshing = false;
  const labels = {
    connected: '로그인됨',
    'api-key': 'API 키 연결됨',
    'signed-out': '로그아웃됨',
    unknown: '로그인 상태 확인 불가',
  };
  const rows = [...host.querySelectorAll('[data-ai-provider]')];

  async function update(row) {
    const status = row.querySelector('[role=status]');
    const button = row.querySelector('[data-ai-action]');
    if (!api?.aiLogin) {
      status.textContent = 'Windows 앱에서 연결할 수 있습니다.';
      button.disabled = true;
      return;
    }
    button.disabled = true;
    const result = await api.aiLogin(row.dataset.aiProvider, 'status').catch(() => ({ state: 'unknown' }));
    button.disabled = false;
    if (result.state === 'busy') return;
    status.textContent = labels[result.state] || labels.unknown;
    const connected = ['connected', 'api-key'].includes(result.state);
    button.dataset.aiAction = connected ? 'logout' : 'login';
    button.textContent = connected ? '로그아웃' : '로그인';
  }

  async function refresh() {
    if (refreshing || !document.querySelector('#settingsModal.open [data-page=general].active')) return;
    refreshing = true;
    try { await Promise.all(rows.map(update)); }
    finally { refreshing = false; }
  }
  for (const row of rows) {
    row.querySelector('[data-ai-action]').addEventListener('click', async event => {
      const button = event.currentTarget;
      const action = button.dataset.aiAction;
      button.disabled = true;
      try {
        const result = await api.aiLogin(row.dataset.aiProvider, action);
        if (action === 'login' && result.ok) row.querySelector('[role=status]').textContent = '열린 로그인 창에서 완료한 뒤 연결 확인을 눌러 주세요.';
        else if (!result.ok) row.querySelector('[role=status]').textContent = '요청을 완료하지 못했습니다.';
        else await update(row);
      } catch { row.querySelector('[role=status]').textContent = '요청을 완료하지 못했습니다.'; }
      finally { button.disabled = false; }
    });
  }
  host.querySelector('[data-ai-refresh]').addEventListener('click', refresh);
  window.addEventListener('focus', refresh);
  window.StockBookAiLogin = { refresh };
})();
