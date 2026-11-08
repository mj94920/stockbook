const fs=require('node:fs');const assert=require('node:assert/strict');const {parseDaily}=require('./parse.cjs');
const candles=parseDaily(fs.readFileSync(__dirname+'/received-sample.xml','utf8'));
assert.equal(candles.length,300);assert.equal(candles.at(-1).date,'2026-10-20');
assert.throws(()=>parseDaily('<protocol/>'),/EMPTY_RESPONSE/);
assert.throws(()=>parseDaily('<item data="20261020|100|90|80|110|5"/>'),/INVALID_OHLCV/);
assert.throws(()=>parseDaily('<item data="20261020|100|110|90|100|5"/><item data="20261020|100|110|90|100|5"/>'),/DUPLICATE/);
console.log('PASS: 300 candles, date ordering, malformed OHLCV, empty response, duplicate date');
