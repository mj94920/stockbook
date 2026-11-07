const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  { createAppServer } = require('./helpers/app-server.cjs'),
  { chromium } = require('playwright');
test('condition screen changes cycles/RSI periods, discloses missing data, opens the correct stock and ignores cancelled replies', async () => {
  const root = path.resolve(__dirname, '..'),
    server = createAppServer(root);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }),
      base = 'http://127.0.0.1:' + server.address().port,
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) =>
      r.request().url().startsWith(base) ? r.continue() : r.abort(),
    );
    await page.goto(base + '/index.html');
    // Keep the chart unselected until its explicit button: the 3s dock timer must not contaminate scanner request counts.
    await page.evaluate(() => {
      window.__calls = [];
      window._dockSel = 'unselected-screen-test';
      window.__data = (code) => ({
        ok: true,
        metadata: { stockCode: code, lastBarComplete: true, source: '테스트 예시' },
        candles: Array.from({ length: 100 }, (_, i) => ({
          date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
          open: 100 + i,
          high: 102 + i,
          low: 99 + i,
          close: 101 + i,
          volume: 100,
        })),
      });
      window.electronAPI = {
        getChartData: async (code, cycle) => {
          __calls.push({ code, cycle });
          return code === '005930' ? __data(code) : { ok: false };
        },
      };
      state.watchlist = [
        { ticker: '005930', name: '검증 종목' },
        { ticker: '000660', name: '누락 종목' },
      ];
    });
    await page.locator('#sbScreenOpen').click();
    const dialog = page.getByRole('dialog', { name: '지표 조건검색' });
    await dialog.getByLabel('거래량 기준 (주)').fill('50');
    await dialog.getByRole('button', { name: '검색 실행', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('.sb-screen-dialog [role=status]').textContent.includes('검사 2/2'),
    );
    assert.match(await dialog.getByRole('status').innerText(), /충족 1/);
    assert.match(await dialog.getByRole('status').innerText(), /판정 불가 1/);
    assert.equal(await dialog.locator('.sb-screen-results article:visible').count(), 1);
    await dialog.getByLabel('결과 표시').selectOption('unknown');
    assert.match(await dialog.locator('.sb-screen-results').innerText(), /누락 종목/);
    await dialog.getByLabel('결과 표시').selectOption('match');
    await dialog.getByLabel('지표', { exact: true }).selectOption('rsi');
    await dialog.getByLabel('RSI 기간 (봉)').fill('2');
    await dialog.getByLabel('봉 주기').selectOption('week');
    await dialog.getByLabel('판정', { exact: true }).selectOption('above');
    await dialog.getByRole('button', { name: '검색 실행', exact: true }).click();
    await page.waitForFunction(() => window.__calls.length === 4);
    await page.waitForFunction(
      () => !document.querySelector('.sb-screen-actions button:nth-child(2)').disabled,
    );
    assert.deepEqual(await page.evaluate(() => __calls.slice(-2).map((c) => c.cycle)), [
      'week',
      'week',
    ]);
    await dialog.locator('.sb-screen-results summary').first().click();
    assert.match(await dialog.locator('.sb-screen-results').innerText(), /Wilder/);
    assert.match(await dialog.locator('.sb-screen-results').innerText(), /2봉 · 기준선 50/);
    await dialog.getByRole('button', { name: '차트 보기', exact: true }).first().click();
    assert.equal(await page.evaluate(() => _dockSel), '005930');
    await page.evaluate(() => StockBookScreen.open());
    await page.evaluate(() => {
      window.__replies = [];
      electronAPI.getChartData = (code, cycle) => {
        __calls.push({ code, cycle });
        return new Promise((resolve) => __replies.push(() => resolve(__data(code))));
      };
    });
    await dialog.getByRole('button', { name: '검색 실행', exact: true }).click();
    await page.waitForFunction(() => __replies.length === 2);
    await dialog.getByRole('button', { name: '검색 중단', exact: true }).click();
    await page.evaluate(() => __replies.forEach((reply) => reply()));
    await page.waitForTimeout(200);
    assert.equal(await dialog.locator('.sb-screen-results article').count(), 0);
    assert.match(await dialog.getByRole('status').innerText(), /중단/);
    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), true);
    await page.screenshot({ path: '/tmp/stockbook-screening-browser.png' });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
});

test('direction controls execute downward conditions for each supported indicator and disclose lower-band and below-threshold results', async () => {
  const server = createAppServer(path.resolve(__dirname, '..'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const base = 'http://127.0.0.1:' + server.address().port,
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) =>
      r.request().url().startsWith(base) ? r.continue() : r.abort(),
    );
    await page.goto(base + '/index.html');
    await page.evaluate(() => {
      window._dockSel = 'unselected-directions-test';
      state.watchlist = [{ ticker: '005930', name: '하향 검증 종목' }];
      window.electronAPI = {
        getChartData: async (code) => ({
          ok: true,
          metadata: { stockCode: code, lastBarComplete: true, source: '방향 검증 예시' },
          candles: window.__values.map((close, i) => ({
            date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
            open: close,
            high: close + 1,
            low: close - 1,
            close,
            volume: 100,
          })),
        }),
        getChartTradingValues: async () => ({
          ok: true,
          source: 'KIS',
          market: 'KRX',
          currency: 'KRW',
          unit: '원',
          rows: window.__values.map((_, i) => ({
            date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
            volume: 100,
            value: 12,
          })),
        }),
      };
    });
    await page.locator('#sbScreenOpen').click();
    const dialog = page.getByRole('dialog', { name: '지표 조건검색' });
    const cases = [
      {
        id: 'sma',
        op: 'crossDown',
        values: [10, 10, 10, 9],
        fields: { '단기 기간': '2', '장기 기간': '3' },
        text: '하향 돌파',
      },
      {
        id: 'rsi',
        op: 'crossDown',
        values: [10, 11, 12, 11, 10],
        fields: { 'RSI 기간 (봉)': '2' },
        text: '하향 돌파',
      },
      {
        id: 'bb',
        op: 'crossDown',
        values: [7, 8, 9, 6],
        fields: { 'BB 기간': '2', '표준편차 배수': '1', '표시 이동 봉수': '1' },
        text: '하단선',
      },
      {
        id: 'ichimoku',
        op: 'breakdown',
        values: [18, 17, 16, 15, 14, 16.5, 14],
        fields: {
          '전환 기간 (봉)': '1',
          '기준 기간 (봉)': '2',
          '스팬B 기간 (봉)': '3',
          '선행 표시 이동 (봉)': '2',
        },
        text: '음운 하단 하향 돌파',
      },
      {
        id: 'volume',
        op: 'lte',
        values: [2, 3, 4],
        fields: { '거래량 기준 (주)': '100' },
        text: '100주 이하',
      },
      {
        id: 'turnover',
        op: 'lte',
        values: [2, 3, 4],
        fields: { '거래대금 기준 (원)': '12' },
        text: '12원 이하',
      },
    ];
    for (const row of cases) {
      await page.evaluate((v) => {
        window.__values = v;
      }, row.values);
      await dialog.getByLabel('지표', { exact: true }).selectOption(row.id);
      await dialog.getByLabel('판정', { exact: true }).selectOption(row.op);
      for (const [label, value] of Object.entries(row.fields))
        await dialog.getByLabel(label, { exact: true }).fill(value);
      if (row.id === 'bb')
        await dialog.getByLabel('BB 기준선', { exact: true }).selectOption('lower');
      await dialog.getByRole('button', { name: '검색 실행', exact: true }).click();
      await page.waitForFunction(
        () => !document.querySelector('.sb-screen-actions button:nth-child(2)').disabled,
      );
      assert.match(await dialog.getByRole('status').innerText(), /충족 1/);
      const result = dialog.locator('.sb-screen-results article:visible');
      assert.equal(await result.count(), 1, row.id);
      await result.locator('summary').click();
      assert.ok((await result.innerText()).includes(row.text), row.id + ': direction description');
    }
    // Opposite entries are selectable and not hidden behind NOT.
    await dialog.getByLabel('지표', { exact: true }).selectOption('ichimoku');
    for (const op of ['enter', 'enterBearish', 'breakout', 'breakdown', 'bullish', 'bearish'])
      await dialog.getByLabel('판정', { exact: true }).selectOption(op);
    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), true);
    await page.screenshot({ path: '/tmp/stockbook-downward-conditions.png' });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
});
