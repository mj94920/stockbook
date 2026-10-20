'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { buildPreview } = require('../src/analysis-ai/preview.js');
const selected = { ticker: '005930', name: '삼성전자', market: 'KOSPI', currency: 'KRW', price: 120, change: 1.5,
  quoteAt: 1792454400000, quoteSource: 'KIS 실시간', apiKey: 'DO-NOT-SEND' };

test('projects a selected stock and only received quote fields; account details, keys and other stocks are excluded', () => {
  const snapshot = buildPreview({ selected, holdings: [
    { ticker: '005930', currency: 'KRW', qty: 10, avgPrice: 100, accountId: 'SECRET-ACCOUNT', nickname: 'SECRET-NAME', password: 'SECRET-KEY' },
    { ticker: '005930', currency: 'KRW', qty: 5, avgPrice: 130, broker: 'SECRET-BROKER' },
    { ticker: '000660', qty: 90, avgPrice: 1000 },
    { ticker: '005930', market: 'NASDAQ', qty: 100, avgPrice: 1 } ], capturedAt: 1792454400000 });
  assert.deepEqual(snapshot.holdings, [{ currency: 'KRW', quantity: 15, acquisitionCost: 1650, averageCost: 110, marketValue: 1800, unrealizedProfit: 150 }]);
  assert.equal(snapshot.quote.price, 120); assert.equal(snapshot.quote.changePercent, 1.5);
  assert.equal(snapshot.quote.receivedAt, '2026-10-20T00:00:00.000Z');
  assert.equal(snapshot.journals.length, 0);
  assert.doesNotMatch(JSON.stringify(snapshot), /SECRET|DO-NOT-SEND|000660/);
});

test('never substitutes average cost for an absent market quote; unknown currency does not invent a valuation', () => {
  const out = buildPreview({ selected: { ...selected, price: null, quoteAt: null, quoteSource: null, currency: undefined },
    holdings: [{ ticker: '005930', qty: 2, avgPrice: 100 }] });
  assert.equal(out.quote.price, null); assert.equal(out.quote.receivedAt, null);
  assert.deepEqual(out.holdings[0], { currency: null, quantity: 2, acquisitionCost: null, averageCost: null, marketValue: null, unrealizedProfit: null });
  assert.match(out.notes.join(' '), /통화 미확인/);
});

test('does not sum money across currencies and treats zero and invalid numbers separately', () => {
  const out = buildPreview({ selected: { ...selected, price: 0 }, holdings: [
    { ticker: '005930', currency: 'KRW', qty: 2, avgPrice: 0 }, { ticker: '005930', currency: 'USD', qty: 3, avgPrice: 4 },
    { ticker: '005930', qty: Infinity, avgPrice: 5 }, { ticker: '005930', currency: 'KRW', qty: 1, avgPrice: 'not-a-price' } ] });
  assert.equal(out.quote.price, 0);
  assert.equal(out.holdings.length, 2); assert.equal(out.holdings[0].acquisitionCost, null, 'invalid cost prevents a partial total');
  assert.equal(out.holdings[1].acquisitionCost, 12); assert.equal(out.holdings[1].marketValue, null, 'KRW quote does not value USD position');
  assert.doesNotMatch(JSON.stringify(out), /Infinity|NaN/);
});

test('includes only explicitly selected journal content without silent clipping or unrelated fields', () => {
  const note = '<script>bad()</script>\n' + '일지😀'.repeat(30000) + ' END';
  const journal = { name: '삼성전자', date: '2026-10-20', buyNote: note, buyReasons: ['기록', 123], apiKey: 'SECRET', accountId: 'SECRET' };
  const out = buildPreview({ selected, selectedJournals: [journal] });
  assert.equal(out.journals[0].buyNote, note); assert.deepEqual(out.journals[0].buyReasons, ['기록']);
  assert.doesNotMatch(JSON.stringify(out), /SECRET/);
  assert.equal(buildPreview({ selected, journals: [journal] }).journals.length, 0, 'unselected journals parameter is not sent');
});

test('preview is detached from later price and journal mutations; missing selection fails explicitly', () => {
  const stock = { ...selected }; const journal = { name: '삼성전자', buyReasons: ['원본'], buyNote: '원본' };
  const out = buildPreview({ selected: stock, selectedJournals: [journal] });
  stock.price = 999; journal.buyReasons.push('추가'); journal.buyNote = '변경';
  assert.equal(out.quote.price, 120); assert.deepEqual(out.journals[0].buyReasons, ['원본']); assert.equal(out.journals[0].buyNote, '원본');
  assert.throws(() => buildPreview(), /종목을 선택/);
});

test('browser controller has no transport or persistence side effects and clears snapshots when closing', () => {
  const nodes = new Map();
  function element(tag) { return { tag, children: [], checked: false, open: false, textContent: '',
    append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; this.textContent = ''; },
    addEventListener(name, fn) { this[name] = fn; }, showModal() { this.open = true; }, close() { this.open = false; } }; }
  const doc = { readyState: 'complete', getElementById: id => { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); }, createElement: element };
  const win = { StockBookAnalysisPreview: { buildPreview }, addEventListener() {} };
  const ctx = vm.createContext({ document: doc, window: win, Date, Set, JSON, structuredClone,
    fetch: () => { throw new Error('unexpected network'); }, localStorage: { setItem() { throw new Error('unexpected storage'); } } });
  vm.runInContext(readFileSync('src/analysis-ai/preview-ui.js', 'utf8'), ctx);
  const source = { selected: { ...selected }, holdings: [], journals: [{ name: '삼성전자', buyNote: 'SELECTED-JOURNAL' }, { name: '다른 종목', buyNote: 'PRIVATE-UNSELECTED' }] };
  win.StockBookAnalysisPreviewUI.configure(() => source); win.StockBookAnalysisPreviewUI.open();
  assert.equal(nodes.get('sbAiPreviewDialog').open, true);
  assert.equal(JSON.parse(nodes.get('sbAiPayload').textContent).journals.length, 0);
  const checkbox = nodes.get('sbAiJournalChoices').children[0].children[0]; checkbox.checked = true; checkbox.change();
  const payload = JSON.parse(nodes.get('sbAiPayload').textContent);
  assert.equal(payload.journals.length, 1); assert.equal(payload.journals[0].buyNote, 'SELECTED-JOURNAL');
  assert.doesNotMatch(nodes.get('sbAiPayload').textContent, /PRIVATE-UNSELECTED/);
  source.selected.price = 999; checkbox.change(); assert.equal(JSON.parse(nodes.get('sbAiPayload').textContent).quote.price, 120);
  win.StockBookAnalysisPreviewUI.close(); assert.equal(nodes.get('sbAiPayload').textContent, ''); assert.equal(nodes.get('sbAiPreviewDialog').open, false);
});


test('a known quote currency never supplies an unknown holding cost currency', () => {
  const out = buildPreview({ selected, holdings: [{ ticker: '005930', qty: 10, avgPrice: 100 }] });
  assert.equal(out.quote.currency, 'KRW');
  assert.equal(out.holdings[0].currency, null);
  assert.equal(out.holdings[0].quantity, 10);
  assert.equal(out.holdings[0].acquisitionCost, null);
  assert.equal(out.holdings[0].marketValue, null);
});
