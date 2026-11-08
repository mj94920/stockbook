(function (root) {
  'use strict';
  const data = root.StockBookAiReportData;
  const authLabels = {
    connected: 'Codex CLI · ChatGPT 로그인 확인됨',
    unavailable: 'Windows용 Codex CLI를 찾을 수 없습니다.',
    'sign-in': 'PowerShell에서 codex login을 실행해 주세요.',
    failed: 'Codex CLI 로그인 상태를 확인하지 못했습니다.',
  };

  function mount(panel, { getSelection, getContext, getChecks, api }) {
    if (!panel) return null;
    const find = id => document.getElementById(id);
    const host = find('sbEmbeddedChart'), notice = find('sbAiReportNotice');
    const previewButton = find('sbAiReportPreview'), draft = find('sbAiReportDraft');
    const payload = find('sbAiReportPayload'), run = find('sbAiReportRun');
    const result = find('sbAiReportResult'), save = find('sbAiReportSave'), exportButton = find('sbAiReportExport');
    const cliStatus = find('sbCodexStatus'), cliCheck = find('sbCodexCheck');
    let selection = '', preview = null, report = null, busy = false, saving = false, loaded = 0;

    function capture() {
      const stock = getSelection(), context = getContext();
      const evidence = host?.chartEvidence, model = root.StockBookCharts?.controller(host)?.getModel();
      if (!context || stock?.ticker !== context.code || model?.stockCode !== context.code ||
          evidence?.stockCode !== context.code || evidence.barCycle !== context.barCycle ||
          evidence.viewRange !== context.viewRange) return null;
      const checks = Object.fromEntries(data.principles.map(({ key }) => [
        key, { manuallyChecked: Boolean(getChecks(stock.name || stock.ticker)?.[key]) },
      ]));
      const start = Math.max(0, model.rows.length - data.maxRows);
      const rows = model.rows.slice(start).map((row, i) => ({
        date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume,
        tradingValue: model.tradingAmounts?.[start + i],
        entrySignal: model.signals?.[start + i]?.entry,
      }));
      const flow = evidence.investors;
      return data.normalizePacket({
        code: context.code, cycle: context.barCycle, range: context.viewRange, sourceType: evidence.sourceType,
        fetchedAt: model.fetchedAt, checks, rows,
        investorFlow: flow && { source: flow.source, date: flow.dates?.at(-1), ...flow.lastDaily },
      });
    }

    function clearPreview() {
      preview = null;
      draft.hidden = true;
      payload.value = '';
    }

    function refreshButtons() {
      previewButton.disabled = !api || !data.validCode(selection) || busy;
      run.disabled = busy || !preview;
      save.disabled = !report || saving;
      exportButton.disabled = !report || saving;
    }

    function display(value) {
      report = data.normalizeReport(value);
      result.innerHTML = report ? data.reportMarkup(report) : '';
      result.hidden = !report;
      save.hidden = exportButton.hidden = !report;
      find('sbAiResultHeading')?.toggleAttribute('hidden', Boolean(report));
      find('sbAiResultDescription')?.toggleAttribute('hidden', Boolean(report));
      for (const [id, text] of [
        ['sbAiResultState', report ? '보고서 있음' : '없음'],
        ['sbAiResultTime', report ? data.formatTime(report.createdAt) : '--'],
        ['sbAiResultSource', report ? 'Codex CLI' : '연결되지 않음'],
      ]) {
        const el = find(id);
        if (el) el.textContent = text;
      }
      refreshButtons();
    }

    async function select(stock) {
      const code = stock?.ticker || '';
      if (code === selection) return;
      selection = code;
      const request = ++loaded;
      clearPreview();
      display(null);
      notice.textContent = data.validCode(code) ? '차트가 준비되면 보낼 자료를 확인하세요.' : '국내 종목을 선택하세요.';
      if (!api || !data.validCode(code)) return;
      try {
        const response = await api.load(code);
        if (request !== loaded || report) return;
        if (response?.ok && response.report) {
          display(response.report);
          notice.textContent = '이 종목에 저장된 보고서입니다.';
        } else if (!response?.ok && !busy) notice.textContent = response?.error || '저장된 보고서를 불러오지 못했습니다.';
      } catch { if (request === loaded && !busy) notice.textContent = '저장된 보고서를 불러오지 못했습니다.'; }
    }

    async function checkLogin() {
      cliCheck.disabled = true;
      cliStatus.textContent = '확인 중…';
      try {
        const response = await api.status();
        cliStatus.textContent = authLabels[response?.status] || authLabels.failed;
      } catch { cliStatus.textContent = authLabels.failed; }
      finally { cliCheck.disabled = false; }
    }

    if (!api) {
      notice.textContent = 'CLI 보고서는 Windows 데스크톱 앱에서 사용할 수 있습니다.';
      if (cliCheck) cliCheck.disabled = true;
      if (cliStatus) cliStatus.textContent = 'Windows 데스크톱 앱에서 연결을 확인할 수 있습니다.';
      return null;
    }

    cliCheck?.addEventListener('click', checkLogin);
    previewButton.addEventListener('click', async () => {
      if (busy) return;
      clearPreview();
      const packet = capture();
      if (!packet) { notice.textContent = '선택 종목의 차트가 표시되고 봉이 2개 이상 있어야 합니다.'; return; }
      const request = ++loaded;
      try {
        const response = await api.preview(packet);
        if (request !== loaded) return;
        if (!response?.ok) { notice.textContent = response?.error || '자료를 준비하지 못했습니다.'; return; }
        preview = response;
        payload.value = JSON.stringify(response.packet, null, 2);
        draft.hidden = false;
        notice.textContent = '보낼 차트 원자료와 수동 체크 상태를 확인하세요.';
      } catch { if (request === loaded) notice.textContent = '자료를 준비하지 못했습니다.'; }
      finally { refreshButtons(); }
    });

    run.addEventListener('click', async () => {
      if (busy || !preview) return;
      if (JSON.stringify(capture()) !== JSON.stringify(preview.packet)) {
        clearPreview();
        refreshButtons();
        notice.textContent = '차트나 체크 상태가 바뀌었습니다. 보낼 자료를 다시 확인하세요.';
        return;
      }
      const request = ++loaded;
      const current = preview;
      busy = true;
      refreshButtons();
      notice.textContent = 'Codex CLI 응답을 기다리는 중입니다…';
      try {
        const response = await api.run(current.id);
        if (request !== loaded) return;
        if (response?.cancelled) { notice.textContent = '전송을 취소했습니다.'; return; }
        clearPreview();
        if (response?.ok && response.report?.packet.code === selection) {
          panel.open = true;
          display(response.report);
          notice.textContent = '보고서가 준비됐습니다. 이 종목에 저장하거나 HTML로 내보낼 수 있습니다.';
        } else notice.textContent = response?.error || '보고서를 받지 못했습니다.';
      } catch {
        if (request === loaded) {
          clearPreview();
          notice.textContent = '보고서를 받지 못했습니다.';
        }
      } finally { busy = false; refreshButtons(); }
    });

    function store(kind, success) {
      return async () => {
        if (!report || saving) return;
        const code = selection;
        saving = true;
        refreshButtons();
        try {
          const response = await api[kind](report);
          if (code === selection && !response?.cancelled) notice.textContent = response?.ok ? success : response?.error || '저장하지 못했습니다.';
        } catch { if (code === selection) notice.textContent = '저장하지 못했습니다.'; }
        finally { saving = false; refreshButtons(); }
      };
    }
    save.addEventListener('click', store('save', '이 종목의 최근 보고서로 저장했습니다.'));
    exportButton.addEventListener('click', store('export', 'HTML 보고서를 저장했습니다.'));
    refreshButtons();
    return { select };
  }
  root.StockBookAiReport = Object.freeze({ mount });
})(window);
