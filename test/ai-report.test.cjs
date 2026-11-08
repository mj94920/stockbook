'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const data = require('../src/analysis/report-data.js');
const { createCodex, registerAiReports } = require('../src/analysis/report-service.cjs');

const packet = {
  code: '005930', cycle: 'day', range: '6m', sourceType: 'naver-daily',
  fetchedAt: '2026-11-08T02:00:00Z',
  rows: [
    { date: '2026-11-05', open: 95, high: 110, low: 90, close: 100, volume: 10, tradingValue: 999, entrySignal: true },
    { date: '2026-11-06', open: 100, high: 120, low: 95, close: 110, volume: 20 },
  ],
  investorFlow: { source: 'KIS', date: '2026-11-06', foreign: 5, institution: -4, individual: -1 },
  checks: { ma20: { manuallyChecked: true }, ignored: { manuallyChecked: true } },
};
const result = { summary: '<img src=x onerror=alert(1)> 요약',
  findings: [{ text: '종가를 비교했습니다.', dates: ['2026-11-05', '2026-11-06'] }],
  limitations: ['다른 종목은 비교하지 않았습니다.'] };
const createdAt = '2026-11-08T02:10:00Z';
const screening = { code: packet.code, state: 'match', fetchedAt: packet.fetchedAt,
  results: [{ key: 'A', condition: { id: 'volume', op: 'gte', threshold: 10 },
    time: { cycle: 'day', mode: 'latest', barsAgo: 0 }, state: 'match', date: '2026-11-06', value: 20, reference: 10 }] };

test('report contract limits outbound fields and renders escaped text with original rows', () => {
  const clean = data.normalizePacket({ ...packet, account: 'private', rows: packet.rows.map(row => ({ ...row, note: 'private' })) });
  assert.equal(clean.rows[1].tradingValue, null);
  assert.equal(clean.rows[0].entrySignal, true);
  assert.equal(clean.rows[1].entrySignal, null);
  assert.equal(clean.checks.ma20.manuallyChecked, true);
  assert.equal(Object.values(clean.checks).filter(check => check.manuallyChecked).length, 1);
  assert.doesNotMatch(JSON.stringify(clean), /private|ignored/);
  assert.equal(data.normalizePacket({ ...packet, code: '../x' }), null);
  assert.equal(data.normalizePacket({ ...packet, rows: [packet.rows[0], packet.rows[0]] }), null);
  assert.equal(data.normalizeReport({ packet, result: { ...result, findings: [{ text: '없는 날짜', dates: ['2020-01-01'] }] }, createdAt }), null);
  const html = data.exportHtml(data.normalizeReport({ packet, result, createdAt }));
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /<polyline/);
  assert.match(html, /<td>110<\/td>/);
  assert.match(html, /<td>미수신<\/td>/);
  assert.match(html, /외국인 5주/);
  assert.match(html, /차트 진입 조건/);
  assert.match(html, /판정 근거 없음/);
  const screened = data.normalizePacket({ ...packet, screening });
  assert.equal(screened.screening.results[0].value, 20);
  assert.equal(data.normalizePacket({ ...packet, screening: { ...screening, code: '000660' } }).screening, null);
  assert.match(data.screeningMarkup(screened.screening), /실제 20 \/ 기준 10/);
});

test('Codex adapter reuses login, strips key overrides and reads one structured report', async () => {
  const calls = [];
  const codex = createCodex({ discover: async () => 'codex.exe',
    env: { CODEX_HOME: 'shared-auth', OPENAI_API_KEY: 'private', OPENAI_BASE_URL: 'private' },
    launch: async (file, args, options) => {
      calls.push({ file, args, ...options });
      if (args.includes('login')) return { code: 0, stdout: 'Logged in using ChatGPT' };
      const schema = JSON.parse(await fs.readFile(args[args.indexOf('--output-schema') + 1], 'utf8'));
      assert.deepEqual(schema, data.schema);
      await fs.writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(result));
      return { code: 0, stdout: 'ignored' };
    } });
  assert.equal(await codex.status(), 'connected');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, undefined);
  const generated = await codex.generate(data.normalizePacket(packet));
  assert.equal(generated.ok, true);
  assert.equal(calls.length, 3);
  const execution = calls[2];
  assert.ok(execution.args.includes('--ephemeral') && execution.args.includes('--ignore-user-config'));
  assert.ok(execution.args.includes('read-only') && execution.args.includes('shell_tool'));
  assert.deepEqual(execution.env, { CODEX_HOME: 'shared-auth' });
  assert.equal(calls[1].cwd, execution.cwd);
  assert.deepEqual(JSON.parse(execution.input.split('\n').at(-1)), data.normalizePacket(packet));
  await assert.rejects(fs.stat(execution.cwd), { code: 'ENOENT' });
});

test('main-frame IPC gates generation on preview and confirmation, saves and exports', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-ai-test-'));
  t.after(async () => {
    for (const file of ['export.html', path.join('ai-reports', '005930.json')]) await fs.unlink(path.join(dir, file)).catch(() => {});
    await fs.rmdir(path.join(dir, 'ai-reports')).catch(() => {});
    await fs.rmdir(dir);
  });
  const handlers = new Map(), mainFrame = { url: 'file:///StockBook/index.html' }, sender = { mainFrame };
  const win = { webContents: sender }, event = { sender, senderFrame: mainFrame };
  const output = path.join(dir, 'export.html');
  let runs = 0, response = 0;
  registerAiReports({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: { showMessageBox: async () => ({ response }), showSaveDialog: async () => ({ filePath: output }) },
    getMainWindow: () => win, getPageUrl: () => 'file:///StockBook/index.html', userData: () => dir,
    codex: { status: async () => 'connected', generate: async packet => {
      runs++;
      return { ok: true, report: data.normalizeReport({ packet, result, createdAt }) };
    } },
  });
  const invoke = (name, value, frame = event) => handlers.get('ai-report-' + name)(frame, value);
  assert.equal((await invoke('status', null, { ...event, senderFrame: {} })).ok, false);
  mainFrame.url = 'file:///another/index.html';
  assert.equal((await invoke('preview', packet)).ok, false);
  mainFrame.url = 'file:///StockBook/index.html';
  assert.equal((await invoke('status')).status, 'connected');
  assert.equal((await invoke('run', 'no preview')).ok, false);
  const preview = await invoke('preview', packet);
  assert.equal(runs, 0);
  assert.equal((await invoke('run', preview.id)).cancelled, true);
  assert.equal(runs, 0);
  response = 1;
  const { report } = await invoke('run', preview.id);
  assert.equal(runs, 1);
  assert.equal((await invoke('run', preview.id)).ok, false);
  assert.equal((await invoke('load', packet.code)).report, null);
  assert.equal((await invoke('save', report)).ok, true);
  assert.deepEqual((await invoke('load', packet.code)).report, report);
  assert.equal((await invoke('export', report)).ok, true);
  assert.match(await fs.readFile(output, 'utf8'), /<polyline/);
});

test('narrow AI panel previews, requires a fresh snapshot, shows and saves a report', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block' });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === 'http://localhost' ? route.fulfill({ path: path.join(__dirname, '..', url.pathname) }) : route.abort();
    });
    await page.addInitScript(({ packet, result, createdAt, screening }) => {
      window.reportCalls = [];
      let lastPreview;
      window.electronAPI = {
        loadState: async () => null, onPushState() {}, getVersion: async () => 'test',
        checkApiKey: async () => false, onWsStatus() {}, saveState: async () => true,
        setChartContext: async () => {},
        fetchDartAnnual: async (_code, year) => ({ ok: true, year, reportCode: '11011', fetchedAt: packet.fetchedAt,
          rows: [{ statement: 'CFS', account: '당기순이익', amount: '1,000', currency: 'KRW', receipt: '20260310002820' }] }),
        aiReport: {
          status: async () => ({ ok: true, status: 'connected' }),
          load: async () => ({ ok: true, report: null }),
          preview: async packet => {
            window.reportCalls.push('preview');
            lastPreview = packet;
            return { ok: true, id: 'fixture', packet };
          },
          run: async () => {
            window.reportCalls.push('run');
            return { ok: true, report: { packet: lastPreview, result, createdAt } };
          },
          save: async () => { window.reportCalls.push('save'); return { ok: true }; },
          export: async () => { window.reportCalls.push('export'); return { ok: true }; },
        },
      };
      window.reportFixture = packet;
      window.screeningFixture = screening;
    }, { packet, result, createdAt, screening });
    await page.goto('http://localhost/index.html');
    await page.evaluate(() => {
      state.watchlist = [{ ticker: '005930', name: '합성 종목', price: 110, quoteAt: Date.now() }];
      state.analysisChecks = { '합성 종목': { ma20: true } };
      window._dockSel = '005930';
      const packet = window.reportFixture;
      const all = Array.from({ length: 133 }, (_, i) => ({
        date: new Date(Date.UTC(2026, 10, 5 - (133 - i))).toISOString().slice(0, 10), close: 90 + i,
      })).concat(packet.rows);
      window.StockBookCharts = { ...window.StockBookCharts, show: async () => {}, controller: () => ({
        getModel: () => ({ stockCode: packet.code, all, rows: packet.rows, fetchedAt: packet.fetchedAt, signals: [{ entry: true }, { entry: null }],
          investorRows: [{ date: '2026-11-05', foreign: 10, institution: -2, individual: -8 },
            { date: '2026-11-06', foreign: -2, institution: 5, individual: -3 }] }),
      }) };
      window._MDI.show('watchlist');
      dockCtxRender();
      const host = document.getElementById('sbEmbeddedChart');
      host.chartEvidence = { stockCode: packet.code, barCycle: 'day', viewRange: '6m', sourceType: 'naver-daily',
        signals: { entryKnown: 1, entryDates: [packet.rows[0].date] },
        investors: { source: 'KIS', fetchedAt: packet.fetchedAt } };
      host.dispatchEvent(new CustomEvent('stockbook:chart-render'));
    });
    const radar = page.locator('.sb-detail-identity').getByRole('button', { name: '마켓레이더' });
    await radar.click();
    const screener = page.getByRole('dialog', { name: '지표 조건검색' });
    await screener.waitFor();
    await screener.getByRole('button', { name: '닫기' }).click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('stockbook:screening-evidence', { detail: window.screeningFixture })));
    assert.equal(await page.locator('#sbAnalysis .sb-analysis-section').count(), 1);
    assert.equal(await page.locator('#sbSignalCheck').count(), 0);
    assert.match(await page.locator('#sbAiCheck[open] #sbAiSignalStatus').innerText(), /최근 조건 충족 2026-11-05/);
    assert.match(await page.locator('#sbAiScreeningEvidence').innerText(), /실제 20 \/ 기준 10/);
    assert.deepEqual(await page.evaluate(() => window.reportCalls), []);
    await page.locator('#sbAiReport > summary').click();
    assert.ok((await page.locator('#sbAnalysis').boundingBox()).height > 300);
    await page.getByRole('button', { name: '보낼 자료 보기' }).click();
    await page.locator('#sbAiReportDraft').waitFor();
    assert.deepEqual(await page.evaluate(() => window.reportCalls), ['preview']);
    const previewed = JSON.parse(await page.locator('#sbAiReportPayload').inputValue());
    assert.equal(previewed.checks.ma20.manuallyChecked, true);
    assert.deepEqual(previewed.rows.map(row => row.entrySignal), [true, null]);
    assert.equal(previewed.chart.count, 132);
    assert.equal(previewed.chart.trend.length, 60);
    assert.equal(previewed.chart.averages.find(row => row.period === 300).latest, null);
    assert.equal(previewed.screening.results[0].reference, 10);
    assert.deepEqual(previewed.investorHistory.totals, { foreign: 8, institution: 3, individual: -11 });
    assert.equal(previewed.disclosure.rows[0].amount, '1,000');
    await page.evaluate(() => { state.analysisChecks['합성 종목'].ma20 = false; });
    await page.getByRole('button', { name: 'Codex로 분석' }).click();
    assert.match(await page.locator('#sbAiReportNotice').textContent(), /다시 확인/);
    assert.deepEqual(await page.evaluate(() => window.reportCalls), ['preview']);
    await page.getByRole('button', { name: '보낼 자료 보기' }).click();
    await page.getByRole('button', { name: 'Codex로 분석' }).click();
    await page.locator('#sbAiReportResult svg').waitFor();
    assert.match(await page.locator('#sbAiReportResult').textContent(), /종가를 비교했습니다/);
    assert.equal(await page.locator('#sbAiResultHeading').isVisible(), false);
    assert.equal(await page.locator('#sbAiResultState').textContent(), '보고서 있음');
    assert.equal(await page.locator('#sbAiReportResult img').count(), 0);
    await page.getByRole('button', { name: '앱에 저장' }).click();
    await page.getByRole('button', { name: 'HTML 내보내기' }).click();
    assert.deepEqual(await page.evaluate(() => window.reportCalls), ['preview', 'preview', 'run', 'save', 'export']);
  } finally { await browser.close(); }
});
