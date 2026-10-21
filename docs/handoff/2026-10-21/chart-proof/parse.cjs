function parseDaily(text) {
  const rows = [...text.matchAll(/<item\s+data="([^"]+)"\s*\/?\s*>/g)];
  if (!rows.length) throw new Error('EMPTY_RESPONSE: 일봉 행이 없습니다.');
  const candles = rows.map(([, line]) => {
    const [date, ...values] = line.split('|');
    if (!/^\d{8}$/.test(date) || values.length !== 5) throw new Error('INVALID_ROW');
    const [open, high, low, close, volume] = values.map(Number);
    if (![open, high, low, close, volume].every(Number.isFinite) ||
        low <= 0 || volume < 0 || low > Math.min(open, close) ||
        high < Math.max(open, close)) throw new Error('INVALID_OHLCV');
    const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
    if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0,10) !== iso) throw new Error('INVALID_DATE');
    return {date: iso, open, high, low, close, volume};
  });
  for (let i=1;i<candles.length;i++) {
    if (candles[i].date <= candles[i-1].date) throw new Error('DUPLICATE_OR_UNSORTED_DATE');
  }
  return candles;
}
module.exports = {parseDaily};
