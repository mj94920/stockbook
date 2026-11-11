'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registerKrxOpen } = require('../src/finance/krx-open.cjs');

test('private KRX lookup requires a saved key and compares Samsung on the exact unadjusted KIS date', async t => {
  const folder = fs.mkdtempSync(path.join(__dirname, '.krx-test-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'krx-open-key.enc');
  const ipc = new Map();
  const sender = { mainFrame: { url: 'file:///index.html' } };
  const event = { sender, senderFrame: sender.mainFrame };
  const mockKey = 'synthetic-credential';
  const date = '2026-11-06';
  let denyBasic = false;
  let requests = 0;
  registerKrxOpen({
    ipcMain: { handle: (name, fn) => ipc.set(name, fn) },
    getMainWindow: () => ({ webContents: sender }),
    getPageUrl: () => 'file:///index.html',
    getKeyFile: () => file,
    getHistoryFile: () => path.join(folder, 'krx-history.enc'),
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: value => Buffer.from(value).reverse(),
      decryptString: value => Buffer.from(value).reverse().toString(),
    },
    fetch: async (url, options) => {
      requests++;
      assert.equal(options.headers.AUTH_KEY, mockKey);
      assert.equal(options.redirect, 'error');
      const request = new URL(url);
      assert.equal(request.host, 'data-dbg.krx.co.kr');
      assert.equal(request.search, '?basDd=20261106');
      const basic = request.pathname.endsWith('/stk_isu_base_info');
      if (basic && denyBasic) return { ok: false, status: 403 };
      const row = basic
        ? { ISU_CD: 'KR7005930003', ISU_SRT_CD: '005930', ISU_ABBRV: '합성 종목', LIST_DD: '1975-06-11' }
        : { ISU_CD: '005930', BAS_DD: date, TDD_OPNPRC: '10', TDD_HGPRC: '13', TDD_LWPRC: '9',
          TDD_CLSPRC: '12', ACC_TRDVOL: '1,200', ACC_TRDVAL: '14,000' };
      return { ok: true, text: async () => JSON.stringify({ OutBlock_1: [row] }) };
    },
    getKisToken: async () => ({ token: 'fixture', appKey: 'fixture', appSecret: 'fixture' }),
    httpsGet: async url => {
      const params = new URL(url).searchParams;
      for (const field of ['FID_INPUT_DATE_1', 'FID_INPUT_DATE_2']) assert.equal(params.get(field), '20261106');
      assert.equal(params.get('FID_ORG_ADJ_PRC'), '1');
      return JSON.stringify({ rt_cd: '0', output1: { stck_shrn_iscd: '005930' }, output2: [
        { stck_bsop_date: '20261106', stck_oprc: '10', stck_hgpr: '13', stck_lwpr: '9',
          stck_clpr: '12', acml_vol: '1200', acml_tr_pbmn: '14000' },
      ] });
    },
  });
  const call = (name, ...args) => ipc.get('krx-open-' + name)(event, ...args);
  assert.equal((await ipc.get('krx-open-status')({ sender, senderFrame: {} })).code, 'FORBIDDEN');
  assert.equal((await call('lookup', '005930', date)).code, 'KEY_MISSING');
  assert.equal(requests, 0);
  assert.deepEqual(await call('save', mockKey), { ok: true });
  assert.equal(fs.readFileSync(file).includes(mockKey), false);
  assert.equal((await call('lookup', '005930', '2026-02-30')).code, 'INPUT');
  const result = await call('lookup', '005930', date);
  assert.equal(result.ok, true);
  assert.equal(result.date, date);
  assert.deepEqual(result.values, { open: 10, high: 13, low: 9, close: 12, volume: 1200, value: 14000 });
  assert.deepEqual(result.values, result.comparison.values);
  assert.equal(JSON.stringify(result).includes(mockKey), false);
  const callsBefore = requests;
  const stored = await call('history', '005930', date, date, true);
  assert.equal(stored.ok, true);
  assert.equal(stored.cached, 1);
  assert.equal(requests, callsBefore);
  assert.equal(stored.rows[0].values.close, 12);
  denyBasic = true;
  assert.deepEqual((await call('lookup', '005930', date)).services, { daily: 'OK', basic: 'ACCESS' });
  assert.deepEqual(await call('delete'), { ok: true });
  assert.equal(fs.existsSync(file), false);
});
