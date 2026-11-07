const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { deflateRawSync } = require('node:zlib');
const { readAnnual, readCorpCodes, registerOpenDart } = require('../src/finance/open-dart.cjs');

function corpArchive(xml) {
  const name = Buffer.from('CORPCODE.xml');
  const data = deflateRawSync(xml);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(name.length, 26);
  const center = Buffer.alloc(46);
  center.writeUInt32LE(0x02014b50);
  center.writeUInt16LE(8, 10);
  center.writeUInt32LE(data.length, 20);
  center.writeUInt32LE(Buffer.byteLength(xml), 24);
  center.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, center, name, end]);
}
const corpXml = '<result><list><corp_code>00126380</corp_code><stock_code>005930</stock_code></list></result>';
const annual = Buffer.from(JSON.stringify({
  status: '000',
  list: [
    { stock_code: '005930', bsns_year: '2025', reprt_code: '11011', fs_div: 'CFS',
      account_nm: '매출액', thstrm_amount: '0', currency: 'KRW', rcept_no: '20260301000001' },
    { stock_code: '005930', bsns_year: '2025', reprt_code: '11011', fs_div: 'OFS',
      account_nm: '매출액', thstrm_amount: '-' },
    { stock_code: '000660', bsns_year: '2025', reprt_code: '11011', fs_div: 'CFS',
      account_nm: '매출액', thstrm_amount: '123', currency: 'KRW' },
  ],
}));

test('corporation codes come from the ZIP and duplicate stock mappings fail closed', () => {
  assert.equal(readCorpCodes(corpArchive(corpXml)).codes.get('005930'), '00126380');
  const duplicate = corpXml.replace('</result>', '<list><corp_code>00000002</corp_code><stock_code>005930</stock_code></list></result>');
  assert.equal(readCorpCodes(corpArchive(duplicate)).codes.get('005930'), null);
  assert.deepEqual(readCorpCodes(Buffer.from('<result><status>010</status></result>')), { ok: false, code: 'KEY_INVALID' });
  assert.throws(() => readCorpCodes(Buffer.from('PK damaged')));
});

test('annual reports preserve zero, missing values, units and consolidation separately', () => {
  const result = readAnnual(annual, '005930', '2025', '2026-11-07T01:00:00.000Z');
  assert.deepEqual(result.rows, [
    { statement: 'CFS', account: '매출액', amount: '0', currency: 'KRW', receipt: '20260301000001' },
    { statement: 'OFS', account: '매출액', amount: null, currency: null, receipt: null },
  ]);
  for (const [status, code] of [['020', 'LIMIT'], ['013', 'NO_DATA'], ['011', 'KEY_INVALID'], ['012', 'IP_DENIED']]) {
    assert.deepEqual(readAnnual(Buffer.from(JSON.stringify({ status })), '005930', '2025', ''), { ok: false, code });
  }
});

test('normalizes the observed DART net income alias without merging consolidated and separate results', () => {
  const base = { stock_code: '005930', bsns_year: '2025', reprt_code: '11011',
    sj_div: 'IS', account_nm: '당기순이익(손실)', currency: 'KRW', rcept_no: '20260310002820' };
  const consolidated = { ...base, fs_div: 'CFS', thstrm_amount: '45,206,805,000,000' };
  const separate = { ...base, fs_div: 'OFS', thstrm_amount: '33,686,601,000,000' };
  const list = [consolidated, { ...consolidated }, separate, { ...separate },
    { ...consolidated, account_nm: '법인세차감전 순이익', thstrm_amount: '49,481,471,000,000' },
    { ...consolidated, account_nm: '지배기업 소유주지분', thstrm_amount: '44,260,956,000,000' },
    { ...consolidated, account_nm: '당기순이익', thstrm_amount: '0', rcept_no: '20260311000001' }];
  const result = readAnnual(Buffer.from(JSON.stringify({ status: '000', list })), '005930', '2025', '');
  assert.deepEqual(result.rows, [
    { statement: 'CFS', account: '당기순이익', amount: '45,206,805,000,000', currency: 'KRW', receipt: '20260310002820' },
    { statement: 'OFS', account: '당기순이익', amount: '33,686,601,000,000', currency: 'KRW', receipt: '20260310002820' },
    { statement: 'CFS', account: '당기순이익', amount: '0', currency: 'KRW', receipt: '20260311000001' },
  ]);
});

test('main-frame IPC stores through safeStorage and never returns key material or raw errors', async () => {
  const dir = fs.mkdtempSync(path.join(__dirname, '.dart-test-'));
  try {
    const handlers = new Map();
    const webContents = { mainFrame: {} };
    const event = { sender: webContents, senderFrame: webContents.mainFrame };
    const synthetic = 'a'.repeat(40);
    const calls = [];
    const keyFile = path.join(dir, 'open-dart-key.enc');
    let requestFails = false;
    registerOpenDart({
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      getMainWindow: () => ({ webContents }),
      getKeyFile: () => keyFile,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: key => { assert.equal(key, synthetic); return Buffer.from('mock encrypted'); },
        decryptString: buffer => { assert.equal(buffer.toString(), 'mock encrypted'); return synthetic; },
      },
      request: async (endpoint, params) => {
        calls.push([endpoint, params]);
        if (requestFails) throw new Error(params.crtfc_key);
        return endpoint === 'corpCode.xml' ? corpArchive(corpXml) : annual;
      },
    });
    const call = (name, ...args) => handlers.get(name)(event, ...args);
    assert.equal(await call('dart-key-status').then(result => result.registered), false);
    assert.deepEqual(await handlers.get('dart-key-save')({ ...event, senderFrame: {} }, synthetic), { ok: false, code: 'FORBIDDEN' });
    assert.deepEqual(await call('dart-key-save', synthetic), { ok: true });
    assert.equal(fs.readFileSync(keyFile, 'utf8'), 'mock encrypted');
    assert.deepEqual(await call('dart-key-test'), { ok: true });
    const result = await call('dart-annual', '005930', '2025');
    assert.equal(result.ok, true);
    assert.equal(JSON.stringify(result).includes(synthetic), false);
    assert.deepEqual(calls.map(([endpoint]) => endpoint), ['corpCode.xml', 'fnlttSinglAcnt.json']);
    assert.equal(calls[1][1].corp_code, '00126380');
    requestFails = true;
    assert.deepEqual(await call('dart-key-test'), { ok: false, code: 'SERVICE' });
    assert.deepEqual(await call('dart-key-delete'), { ok: true });
    assert.equal(fs.existsSync(keyFile), false);
    assert.deepEqual(await call('dart-annual', '005930', '2025'), { ok: false, code: 'KEY_MISSING' });
  } finally {
    fs.rmSync(path.join(dir, 'open-dart-key.enc'), { force: true });
    fs.rmdirSync(dir);
  }
});

test('settings clear the entered key and the selected-stock view distinguishes errors and missing values', async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === 'http://localhost'
        ? route.fulfill({ path: path.join(__dirname, '..', url.pathname) })
        : route.abort();
    });
    await page.goto('http://localhost/index.html');
    const result = await page.evaluate(async () => {
      const input = document.getElementById('dartKeyInput');
      const synthetic = 'a'.repeat(40);
      let saved = false;
      let calls = 0;
      window.electronAPI = {
        dartKeyStatus: async () => ({ ok: true, registered: saved }),
        dartKeySave: async key => ({ ok: saved = key === synthetic && input.value === '' }),
        fetchDartAnnual: async () => ++calls === 1 ? { ok: false, code: 'LIMIT' } : {
          ok: true, year: '2025', fetchedAt: '2026-11-07T01:30:00.000Z',
          rows: [
            { statement: 'CFS', account: '매출액', amount: '0', currency: 'KRW' },
            { statement: 'OFS', account: '매출액', amount: null, currency: null },
          ],
        },
      };
      input.value = synthetic;
      await dartSettings('save');
      const view = document.createElement('div');
      view.innerHTML = renderDartAnnualSection('005930');
      const button = view.querySelector('button');
      await loadDartAnnual(button, '005930');
      const error = view.querySelector('[data-dart-result]').textContent;
      await loadDartAnnual(button, '005930');
      return { saved, input: input.value, error, text: view.textContent,
        amounts: [...view.querySelectorAll('tbody tr td:nth-child(3)')].map(cell => cell.textContent) };
    });
    assert.equal(result.saved, true);
    assert.equal(result.input, '');
    assert.match(result.error, /한도/);
    assert.match(result.text, /회계연도 2025/);
    assert.match(result.text, /사업보고서/);
    assert.match(result.text, /10:30:00.*KST/);
    assert.deepEqual(result.amounts, ['0', '확인 불가']);
  } finally {
    await browser.close();
  }
});
