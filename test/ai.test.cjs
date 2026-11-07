const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createResearch, request, financeRows } = require('../src/ai/research.cjs');
const policy = require('../src/ai/policy.js');
const { registerAI } = require('../src/ai/service.cjs');
const bars = Array.from({ length: 500 }, (_, i) => ({
  date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i,
  volume: 1000,
}));
function fixtureResearch() {
  let calls = 0;
  const data = createResearch({
    now: () => Date.UTC(2026, 4, 20),
    getChartData: async (code) => ({
      ok: true,
      candles: bars,
      metadata: {
        stockCode: code,
        snapshotDate: bars.at(-1).date,
        lastBarComplete: null,
        priceAdjustment: '미확인',
      },
    }),
    httpsGet: async (url) => {
      calls++;
      if (url.endsWith('/basic'))
        return JSON.stringify({
          itemCode: '005930',
          stockName: '삼성전자',
          stockExchangeName: '코스피',
        });
      if (url.endsWith('/finance/annual'))
        return JSON.stringify({
          itemCode: '005930',
          financeInfo: {
            trTitleList: [
              { key: '2025', title: '2025', isConsensus: 'N' },
              { key: '2026', title: '2026', isConsensus: 'Y' },
            ],
            rowList: [
              {
                title: '매출액',
                unit: '억원',
                columns: { 2025: { value: '100' }, 2026: { value: '120' } },
              },
            ],
          },
        });
      return JSON.stringify([
        {
          items: [
            {
              officeId: '001',
              articleId: '0001234567',
              title: '검증 기사',
              datetime: '202605190900',
              officeName: '검증 언론',
            },
          ],
        },
      ]);
    },
  });
  return { data, calls: () => calls };
}
const bundle = () => ({
  code: '005930',
  name: '삼성전자',
  period: '3m',
  missing: [],
  evidence: [
    { id: 'prices', status: 'received', data: { close: 100 }, url: 'https://m.stock.naver.com/' },
  ],
});
const result = () => ({
  summary: '부분 자료를 확인했습니다.',
  scenarios: [
    {
      kind: 'unassessed',
      condition: '자료 기준일과 단위를 먼저 확인',
      outlook: '자료가 불충분해 가격 방향 판단을 유보합니다.',
      invalidation: '필요 자료 수신과 원문 대조 후 다시 분석',
      evidenceIds: ['prices'],
    },
  ],
  interpretations: [{ text: '가격 자료 기준 설명', evidenceIds: ['prices'] }],
  risks: [{ text: '자료 한계', evidenceIds: ['prices'] }],
  options: [
    {
      audience: 'both',
      action: '원문 단위와 기준일을 대조하고 대응 계획을 다시 검토',
      trigger: '새 공시가 수신되거나 원문에서 단위가 확인될 때',
      invalidation: '기존 수치의 정정 공시 또는 자료 오류 확인 시 판단 폐기',
      title: '관찰',
      reason: '추가 확인',
      risk: '변동성',
      reviewWhen: '다음 공시',
      evidenceIds: ['prices'],
    },
  ],
  missing: [],
  questions: ['오늘 계획은 무엇인가요?'],
});
function service(home = null, options = {}) {
  const handlers = new Map(),
    frame = {},
    wc = { mainFrame: frame };
  registerAI({
    ipcMain: { handle: (n, fn) => handlers.set(n, fn) },
    getMainWindow: () => ({ webContents: wc }),
    research: { collect: async () => bundle() },
    home,
    ...options,
  });
  const handle = handlers.get('stockbook-ai');
  return {
    call: (op, value) => handle({ sender: wc, senderFrame: frame }, op, value),
    handle,
    wc,
    frame,
  };
}
test('AI research validates the request, rejects products and never accepts keys or arbitrary prompts', () => {
  assert.deepEqual(request({ code: '005930', period: '3m' }), { code: '005930', period: '3m' });
  for (const value of [
    { code: '005930', prompt: 'run commands' },
    { code: '005930', apiKey: 'do-not-forward' },
    { code: '005930', period: '20y' },
    { code: 'x; rm' },
    { code: '0183V0' },
  ])
    assert.throws(() => request(value));
});
test('research has source dates, period-aware news, separate confirmed cycles, missing values and refreshable shared cache', async () => {
  const f = fixtureResearch(),
    [a, b] = await Promise.all([
      f.data.collect({ code: '005930' }),
      f.data.collect({ code: '005930' }),
    ]);
  assert.strictEqual(a, b);
  assert.equal(f.calls(), 3);
  assert.equal(a.name, '삼성전자');
  assert.equal(a.evidence.find((e) => e.id === 'news').data.rows.length, 1);
  const prices = a.evidence.find((e) => e.id === 'prices').data;
  assert.ok(prices.recentBars.length <= 66);
  assert.deepEqual(
    prices.indicators.week.averages.map((a) => a.period),
    [4, 12, 24, 46, 73],
  );
  assert.deepEqual(
    prices.indicators.month.averages.map((a) => a.period),
    [1, 5, 19, 6, 9],
  );
  assert.deepEqual(
    prices.indicators.year.averages.map((a) => a.period),
    [1, 3, 5, 6, 10],
  );
  assert.equal(prices.indicators.year.averages.find((a) => a.period === 10).value, null);
  const finance = a.evidence.find((e) => e.id === 'finance').data.rows[0];
  assert.equal(finance.values[1].estimate, true);
  assert.equal(finance.unit, '억원');
  await f.data.collect({ code: '005930' }, { refresh: true });
  assert.equal(f.calls(), 6);
});
test('research rejects wrong-stock price/profile/finance responses and exposes partial failures without raw errors', async () => {
  const r = createResearch({
    getChartData: async () => ({ ok: true, candles: bars, metadata: { stockCode: '000660' } }),
    httpsGet: async (url) =>
      url.includes('/finance/')
        ? JSON.stringify({ itemCode: '000660' })
        : url.endsWith('/basic')
          ? JSON.stringify({ itemCode: '000660' })
          : Promise.reject(Error('SECRET_TEST_VALUE')),
  });
  const b = await r.collect({ code: '005930' });
  assert.deepEqual(b.missing.sort(), ['finance', 'news', 'prices', 'profile']);
  assert.doesNotMatch(JSON.stringify(b), /SECRET_TEST_VALUE/);
});
test('AI patterns preserve data-first principles and validate source references, choices and missing user information', () => {
  assert.equal(Object.keys(policy.patterns).length, 7);
  assert.match(policy.prompt(bundle(), 'morning'), /미 10년물/);
  assert.match(policy.prompt(bundle(), 'weekly'), /판단 이유/);
  assert.match(policy.prompt(bundle(), 'quarterly'), /FCF/);
  assert.strictEqual(policy.validate(result(), bundle()).summary, result().summary);
  const bad = result();
  bad.options[0].evidenceIds = ['fabricated-source'];
  assert.throws(() => policy.validate(bad, bundle()));
  const bad2 = result();
  bad2.command = 'trade';
  assert.throws(() => policy.validate(bad2, bundle()));
});
test('AI IPC refuses frames, preserves the configured-vs-authenticated distinction and sends no requests without HOME', async () => {
  const s = service();
  assert.equal((await s.handle({ sender: {}, senderFrame: s.frame }, 'status')).ok, false);
  assert.equal((await s.handle({ sender: s.wc, senderFrame: {} }, 'status')).ok, false);
  const status = await s.call('status');
  assert.equal(status.configured, false);
  assert.deepEqual(status.providers, []);
  assert.match((await s.call('analyze', { code: '005930' })).error, /홈 연결 경로/);
});
test('HOME owns model execution; analysis uses fixed rules, serializes a request and checks evidence in the response', async () => {
  let sent;
  const s = service({
    status: async () => ({
      providers: [
        { id: 'codex', connected: true },
        { id: 'claude', connected: true },
      ],
      token: 'DO_NOT_FORWARD',
    }),
    analyze: async (req) => {
      sent = req;
      return { requestId: req.requestId, code: req.code, provider: 'claude', result: result() };
    },
  });
  assert.doesNotMatch(JSON.stringify(await s.call('status')), /DO_NOT_FORWARD/);
  const r = await s.call('analyze', { code: '005930', provider: 'auto', pattern: 'weekly' });
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'claude');
  assert.equal(sent.mode, 'stock');
  assert.equal(sent.provider, 'auto');
  assert.match(sent.prompt, /portfolioStructure/);
  assert.ok(r.result.missing.includes('portfolioStructure'));
  assert.ok(sent.signal instanceof AbortSignal);
  assert.equal((await s.call('analyze', { code: '005930', provider: '--run-anything' })).ok, false);
});
test('HOME execution cannot overlap, cancellation discards late results and timeout remains distinguishable', async () => {
  let resolve, started;
  const ready = new Promise((r) => (started = r));
  const s = service({
    status: async () => ({ providers: [{ id: 'codex', connected: true }] }),
    analyze: () => {
      started();
      return new Promise((r) => (resolve = r));
    },
    cancel: async () => false,
  });
  const pending = s.call('analyze', { code: '005930' });
  await ready;
  assert.match((await s.call('analyze', { code: '005930' })).error, /진행 중/);
  const cancelled = await s.call('cancel');
  assert.equal(cancelled.confirmed, false);
  assert.equal((await pending).ok, false);
  resolve({ provider: 'codex', result: result() });
  const slow = service(
    {
      status: async () => ({ providers: [{ id: 'codex', connected: true }] }),
      analyze: () => new Promise(() => {}),
    },
    { timeoutMs: 20 },
  );
  assert.match((await slow.call('analyze', { code: '005930' })).error, /대기 시간이 초과/);
});
test('bad HOME replies and errors never surface arbitrary details or ungrounded references', async () => {
  const s = service({
    status: async () => ({ providers: [{ id: 'codex', connected: true }] }),
    analyze: async () => {
      throw Error('AI SECRET_AUTH_TOKEN');
    },
  });
  assert.doesNotMatch(
    JSON.stringify(await s.call('analyze', { code: '005930' })),
    /SECRET_AUTH_TOKEN/,
  );
  const invalid = result();
  invalid.interpretations[0].evidenceIds = ['made-up'];
  const s2 = service({
    status: async () => ({ providers: [{ id: 'codex', connected: true }] }),
    analyze: async (req) => ({
      requestId: req.requestId,
      code: req.code,
      provider: 'codex',
      result: invalid,
    }),
  });
  assert.match((await s2.call('analyze', { code: '005930' })).error, /근거/);
});
test('unsupported reflection input never invokes a model, and mismatched request/stock/provider replies are refused', async () => {
  let calls = 0;
  const s = service({
    status: async () => ({ providers: [{ id: 'codex', connected: true }] }),
    analyze: async (req) => {
      calls++;
      return { requestId: 'wrong', code: '000660', provider: 'codex', result: result() };
    },
  });
  assert.match(
    (await s.call('analyze', { code: '005930', pattern: 'yearly' })).error,
    /사용자 기록/,
  );
  assert.equal(calls, 0);
  assert.match((await s.call('analyze', { code: '005930' })).error, /모델 정보/);
  assert.equal(calls, 1);
});

test('forward analysis requires observable scenarios and actionable plans, or an explicit evidence-based deferral', () => {
  const base = result();
  assert.equal(policy.validate(base, bundle()).scenarios[0].kind, 'unassessed');
  const full = result();
  full.scenarios = ['upside', 'base', 'downside'].map((kind) => ({
    kind,
    condition: '수신 가격 자료를 원문과 대조한 후 조건 충족 여부 확인',
    outlook: '조건부 시나리오이며 확정 전망이 아님',
    invalidation: '대조 결과 가격 자료 오류 또는 조건 불충족 확인',
    evidenceIds: ['prices'],
  }));
  full.options[0].audience = 'holder';
  assert.strictEqual(policy.validate(full, bundle()), full);
  const mutations = [
    (r) => delete r.scenarios,
    (r) => r.scenarios.pop(),
    (r) => (r.scenarios[1].kind = 'upside'),
    (r) => (r.scenarios[0].evidenceIds = ['invented']),
    (r) => (r.scenarios[0].invalidation = ' '),
    (r) => delete r.options[0].trigger,
    (r) => (r.options[0].action = ''),
    (r) => (r.options[0].audience = 'assumed-position'),
    (r) => delete r.options[0].invalidation,
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(full);
    mutate(invalid);
    assert.throws(() => policy.validate(invalid, bundle()));
  }
  for (const pattern of Object.keys(policy.patterns)) {
    const prompt = policy.prompt(bundle(), pattern);
    assert.match(prompt, /실행 조건/);
    assert.match(prompt, /무효화/);
    assert.match(prompt, /목표가·확률/);
    assert.match(prompt, /보유 여부를 모르면/);
  }
});
