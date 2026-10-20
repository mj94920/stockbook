/* Local-only preview UI. No fetch, IPC, CLI invocation, storage or results persistence. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let capture = null;
  let snapshot = null;
  let journals = [];
  let selected = new Set();
  let consent = false;
  const model = () => window.StockBookAnalysisPreview;
  function render() {
    const output = $('sbAiPayload');
    if (!snapshot || !output || !model()) return;
    const payload = model().buildPreview({ ...snapshot, selectedJournals: [...selected].map(i => journals[i]) });
    output.textContent = JSON.stringify(payload, null, 2);
    const count = $('sbAiPreviewCount'); if (count) count.textContent = `선택한 일지: ${selected.size}건`;
  }
  function close() {
    $('sbAiPreviewDialog')?.close(); snapshot = null; journals = []; selected.clear();
    $('sbAiPayload')?.replaceChildren(); $('sbAiJournalChoices')?.replaceChildren();
    if ($('sbAiJournalChecks')) $('sbAiJournalChecks').open = false;
  }
  function open() {
    const status = $('sbAiPreviewStatus');
    try {
      if (typeof capture !== 'function' || !model()) throw new Error('자료 미리보기를 준비하지 못했습니다.');
      const current = capture();
      // Only allow-listed fields enter the frozen preview. Live prices never mutate it afterwards.
      const clean = model().buildPreview({ ...current, selectedJournals: current.journals || [] });
      snapshot = { selected: { ticker: clean.stock.stockCode, assetId: typeof current.selected?.assetId === 'string' ? current.selected.assetId : null, name: clean.stock.name,
        market: clean.stock.market, currency: clean.stock.currency, price: clean.quote.price, change: clean.quote.changePercent,
        quoteAt: clean.quote.receivedAt ? Date.parse(clean.quote.receivedAt) : null, quoteSource: clean.quote.source },
        holdings: (current.holdings || []).filter(Boolean).map(row => ({ ticker: row.ticker, assetId: row.assetId, market: row.market, currency: row.currency, qty: row.qty, avgPrice: row.avgPrice })), capturedAt: Date.parse(clean.capturedAt) };
      // Journals are projected before display; unselected text never enters the request preview.
      journals = clean.journals.map(j => ({ name: j.stockName, date: j.date, buyDate: j.buyDate, sellDate: j.sellDate,
        type: j.type, buyReasons: j.buyReasons, buyNote: j.buyNote, sellReasons: j.sellReasons, sellNote: j.sellNote, resultNote: j.resultNote }));
      selected = new Set();
      const list = $('sbAiJournalChoices'); list?.replaceChildren();
      journals.forEach((j, i) => {
        const label = document.createElement('label'); label.className = 'sb-ai-journal-choice';
        const input = document.createElement('input'); input.type = 'checkbox';
        input.addEventListener('change', () => { if (input.checked) selected.add(i); else selected.delete(i); render(); });
        const name = document.createElement('span'); name.textContent = `${j.date || j.buyDate || '날짜 없음'} · ${j.name || '종목 미지정'} · ${j.type || '일지'}`;
        label.append(input, name); list?.append(label);
      });
      if ($('sbAiConsent')) $('sbAiConsent').checked = consent;
      if (status) status.textContent = '미리보기만 생성했습니다. CLI 실행·외부 전송은 아직 연결되지 않았습니다.';
      render(); $('sbAiPreviewDialog')?.showModal();
    } catch (error) { if (status) status.textContent = error.message; snapshot = null; }
  }
  window.StockBookAnalysisPreviewUI = Object.freeze({ configure: fn => { capture = fn; }, open, close });
  function mount() {
    $('sbAiPreviewOpen')?.addEventListener('click', open);
    $('sbAiPreviewClose')?.addEventListener('click', close);
    $('sbAiPreviewDone')?.addEventListener('click', close);
    $('sbAiConsent')?.addEventListener('change', e => { consent = e.target.checked; });
    $('sbAiPreviewDialog')?.addEventListener('cancel', e => { e.preventDefault(); close(); });
    window.addEventListener('pagehide', () => { consent = false; close(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
