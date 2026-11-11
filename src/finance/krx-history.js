(function (root) {
  'use strict';
  const series = typeof module === 'object' && module.exports ? require('../chart/series.js') : root.StockBookChartSeries;
  const actions = typeof module === 'object' && module.exports ? require('./krx-corporate-actions.js') : root.StockBookKrxActions;
  const sum = (rows, field) => {
    const total = rows.reduce((value, row) => value + BigInt(row[field]), 0n);
    return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : total;
  };

  function bucket(date, cycle) {
    if (cycle === 'year') return date.slice(0, 4);
    if (cycle === 'month') return date.slice(0, 7);
    if (cycle === 'day') return date;
    const time = Date.parse(date + 'T00:00:00Z');
    return new Date(time - ((new Date(time).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  }
  const hasPrice = row => ['open', 'high', 'low', 'close'].every(field => row[field] > 0);
  function aggregate(rows, cycle) {
    const groups = new Map();
    for (const row of rows) {
      const key = bucket(row.date, cycle);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return series.aggregate(rows.filter(hasPrice), cycle, { lastBarComplete: true }).map(bar => ({
      ...bar, volume: sum(groups.get(bar.bucket), 'volume'), value: sum(groups.get(bar.bucket), 'value'),
    }));
  }
  function verifyAggregation(rows, bars, cycle) {
    const expected = new Map();
    for (const row of rows) {
      const key = bucket(row.date, cycle);
      const group = expected.get(key) || { volume: 0n, value: 0n, prices: 0 };
      group.volume += BigInt(row.volume);
      group.value += BigInt(row.value);
      if (hasPrice(row)) {
        if (!group.prices) { group.open = row.open; group.high = row.high; group.low = row.low; }
        group.high = Math.max(group.high, row.high);
        group.low = Math.min(group.low, row.low);
        group.close = row.close;
        group.prices++;
      }
      expected.set(key, group);
    }
    const actual = new Map(bars.map(bar => [bar.bucket, bar]));
    const mismatches = [];
    for (const [key, group] of expected) {
      const bar = actual.get(key);
      const fields = !bar || !group.prices ? ['OHLC'] :
        ['open', 'high', 'low', 'close'].filter(field => bar[field] !== group[field]);
      if (bar && (BigInt(bar.volume) !== group.volume)) fields.push('volume');
      if (bar && (BigInt(bar.value) !== group.value)) fields.push('value');
      if (fields.length) mismatches.push({ bucket: key, fields });
    }
    for (const key of actual.keys()) if (!expected.has(key)) mismatches.push({ bucket: key, fields: ['extra'] });
    return { ok: mismatches.length === 0 && actual.size === bars.length, groups: expected.size, mismatches };
  }

  function statistics(records, cycle = 'day', basis = 'split-adjusted') {
    if (!Array.isArray(records) || !records.length) throw Error('조회 기간의 보관 자료가 없습니다.');
    if (!['day', 'week', 'month', 'year'].includes(cycle)) throw Error('봉 주기를 확인해 주세요.');
    const first = records[0];
    if (records.some(row => row.code !== first.code || row.isin !== first.isin)) throw Error('종목 식별자가 다른 자료는 함께 집계할 수 없습니다.');
    const rows = records.map(row => ({ date: row.date, ...row.values }));
    const correction = actions.priceRows(records, basis);
    const selected = correction.rows;
    const available = selected.filter(hasPrice);
    if (!available.length) throw Error('가격이 제공된 거래일 자료가 없습니다.');
    const bars = aggregate(selected, cycle);
    const rawBars = basis === 'raw' ? bars : aggregate(rows, cycle);
    const safeForAverage = correction.verified && (basis !== 'raw' || !correction.boundary);
    return {
      code: first.code, name: records.at(-1).name, start: first.date, end: records.at(-1).date,
      fetchedAt: records.reduce((last, row) => row.fetchedAt > last ? row.fetchedAt : last, ''),
      received: rows.length, omitted: rows.length - available.length, bars,
      volume: sum(rows, 'volume'), value: sum(rows, 'value'),
      high: Math.max(...available.map(row => row.high)),
      low: Math.min(...available.map(row => row.low)),
      average: safeForAverage ? series.average(bars, 5) : bars.map(() => null),
      basis, correction, safeForAverage,
      rawAudit: verifyAggregation(rows, rawBars, cycle),
      displayAudit: verifyAggregation(selected, bars, cycle),
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { statistics, verifyAggregation };
    return;
  }
  const host = document.getElementById('krxHistory');
  const api = root.electronAPI;
  if (!host || !api?.krxOpenHistory) return;
  const find = name => host.querySelector('[data-history="' + name + '"]');
  const status = find('status');
  const view = find('view');
  const formatter = new Intl.NumberFormat('ko-KR');
  const format = value => formatter.format(value);
  let records = [];
  let dateCoverage = null;
  let loading = false;
  let generation = 0;
  const end = new Date(Date.now() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
  find('end').value = end;
  find('start').value = Math.max(2010, Number(end.slice(0, 4)) - 10) + '-01-01';
  if (find('start').value < '2010-01-04') find('start').value = '2010-01-04';
  const errors = {
    INPUT: '종목코드와 시작일·종료일을 확인해 주세요.',
    KEY_MISSING: '먼저 KRX 인증키를 등록해 주세요.',
    KEY_CHANGED: '인증키가 변경됐습니다. 다시 조회해 주세요.',
    API: 'KRX 서비스 응답을 확인하지 못했습니다. 단일 날짜 조회에서 연결 상태를 확인해 주세요.',
    BUSY: '다른 KRX 조회가 진행 중입니다.',
    STORAGE: '로컬 암호화 보관 자료를 읽거나 저장하지 못했습니다.',
    LIMIT: 'KRX 요청 한도에 도달했습니다. 보관한 자료를 유지하며, 한도가 해제된 뒤 같은 기간을 다시 수집하면 이어집니다.',
    CANCELLED: '수집을 중단했습니다. 중단 전 보관한 자료는 남아 있습니다.',
  };

  function render() {
    view.replaceChildren();
    if (!records.length) { renderCoverage(); return; }
    try {
      const data = statistics(records, find('cycle').value, find('basis').value);
      const line = text => {
        const p = document.createElement('p');
        p.className = 'sb-hint';
        p.textContent = text;
        view.append(p);
      };
      line('한국거래소 통계정보 · ' + data.name + ' (' + data.code + ') · 기준일 ' + data.start + ' ~ ' + data.end +
        ' · 최근 조회 ' + new Date(data.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST');
      line('보관 자료 ' + data.received + '일 · 거래량 합계 ' + format(data.volume) + '주 · 거래대금 합계 ' + format(data.value) +
        '원 · 최고 ' + format(data.high) + '원 · 최저 ' + format(data.low) + '원');
      const cycle = find('cycle').value;
      const label = { day: '일봉', week: '주봉', month: '월봉', year: '연봉' }[cycle];
      const thisYear = new Date(Date.now() + 9 * 3600000).getUTCFullYear();
      line(label + ' ' + data.bars.length + '개' +
        (cycle === 'year' && data.end.slice(0, 4) === String(thisYear) ? ' · ' + thisYear + '년 봉은 진행 중' : ''));
      const basis = !data.correction.verified ? '분할 이력 미확인 · 원주가' :
        data.basis === 'raw' ? '원주가 · KRX 원본' : '수정주가 · 확인된 분할 ' + data.correction.events.length + '건 반영(배당 조정 제외)';
      line(basis + ' · 거래량·거래대금은 일봉 원본 합계 · ' + (data.omitted ? '가격 미제공 ' + data.omitted + '일 제외 · ' : '') +
        (find('cycle').value === 'day' ? '5봉 종가 단순평균' : '첫·마지막 집계봉은 수집 기간의 일부일 수 있습니다.'));
      line(data.safeForAverage ? '이동평균은 선택한 가격 기준의 수신봉 종가로 계산합니다.' :
        '분할 경계 또는 보정 이력 미확인으로 이동평균·가격 신호 계산을 보류합니다.');
      line('일봉 대조 집계 검증 · 원주가 ' + (data.rawAudit.ok ? data.rawAudit.groups + '개 봉 일치' : '불일치 확인 필요') +
        ' · 선택 가격 ' + (data.displayAudit.ok ? data.displayAudit.groups + '개 봉 일치' : '불일치 확인 필요') +
        ' · OHLC·거래량·거래대금 기준');
      line('집계 검증은 보관 일봉과의 대조이며, 날짜별 수신 완전성은 아래 내역에서 확인합니다.');
      if (data.correction.events.length) {
        const link = document.createElement('a');
        link.className = 'sb-btn sb-btn--ghost sb-btn--sm';
        link.href = data.correction.events[0].source;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '삼성전자 2018년 50:1 분할 근거';
        view.append(link);
      }
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 440;
      canvas.className = 'sb-krx-history-chart';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', '한국거래소 일별 통계 기반 가격·거래량·거래대금 차트');
      view.append(canvas);
      draw(canvas, data);
    } catch (error) {
      status.textContent = error.message;
    }
    renderCoverage();
  }

  function renderCoverage() {
    if (!dateCoverage) return;
    const counts = dateCoverage.counts;
    const text = document.createElement('p');
    text.className = 'sb-hint';
    text.textContent = '날짜 점검 · 수신 ' + counts.received + '일 · 주말 ' + counts.weekend +
      '일 · 공휴일·휴장 확인 ' + counts.closed + '일 · 거래정지 확인 ' + counts.suspended +
      '일 · 추가 확인 ' + dateCoverage.unresolved + '일 · 근거 충돌 ' + dateCoverage.conflicts.length + '일';
    view.append(text);
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '휴장·미수신 날짜별 근거 ' + dateCoverage.missing.length + '일';
    details.append(summary);
    const note = document.createElement('p');
    note.className = 'sb-hint';
    note.textContent = '설·추석·대체·임시휴장 등 공식 달력이 대조되지 않은 날짜는 확인 필요로 표시합니다.';
    details.append(note);
    const table = document.createElement('table');
    table.className = 'sb-krx-audit';
    for (const entry of dateCoverage.missing) {
      const tr = table.insertRow();
      tr.insertCell().textContent = entry.date;
      tr.insertCell().textContent = entry.reason;
      if (entry.source) {
        const link = document.createElement('a');
        link.href = entry.source;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '근거';
        tr.insertCell().append(link);
      }
    }
    details.append(table);
    view.append(details);
  }

  function draw(canvas, data) {
    const ctx = canvas.getContext('2d');
    const style = getComputedStyle(host);
    const text = style.getPropertyValue('--sb-text-2').trim() || style.color;
    const up = style.getPropertyValue('--sb-up').trim() || text;
    const down = style.getPropertyValue('--sb-down').trim() || text;
    const accent = style.getPropertyValue('--sb-accent').trim() || text;
    const left = 100;
    const right = 880;
    const width = right - left;
    const step = width / data.bars.length;
    const x = i => left + (i + 0.5) * step;
    const spread = Math.max(1, data.high - data.low);
    const y = value => 50 + (data.high + spread * 0.05 - value) / (spread * 1.1) * 180;
    ctx.font = '13px sans-serif';
    ctx.fillStyle = text;
    ctx.fillText('가격(원)', 8, 28);
    ctx.fillText(format(data.high), 8, y(data.high) + 5);
    ctx.fillText(format(data.low), 8, y(data.low) + 5);
    for (const [i, bar] of data.bars.entries()) {
      ctx.fillStyle = ctx.strokeStyle = bar.close >= bar.open ? up : down;
      ctx.beginPath();
      ctx.moveTo(x(i), y(bar.high));
      ctx.lineTo(x(i), y(bar.low));
      ctx.stroke();
      ctx.fillRect(x(i) - Math.min(10, step * 0.65) / 2, Math.min(y(bar.open), y(bar.close)),
        Math.min(10, step * 0.65), Math.max(1, Math.abs(y(bar.open) - y(bar.close))));
    }
    ctx.strokeStyle = accent;
    ctx.beginPath();
    let started = false;
    for (const [i, value] of data.average.entries()) {
      if (value === null) continue;
      if (started) ctx.lineTo(x(i), y(value));
      else { ctx.moveTo(x(i), y(value)); started = true; }
    }
    ctx.stroke();
    for (const [field, label, top] of [['volume', '거래량(주)', 280], ['value', '거래대금(원)', 365]]) {
      const max = Math.max(1, ...data.bars.map(bar => Number(bar[field])));
      ctx.fillStyle = text;
      ctx.fillText(label, 8, top);
      ctx.fillText(format(max), 8, top + 18);
      for (const [i, bar] of data.bars.entries()) {
        const height = Number(bar[field]) / max * 50;
        ctx.fillStyle = bar.close >= bar.open ? up : down;
        ctx.fillRect(x(i) - Math.min(10, step * 0.65) / 2, top + 50 - height, Math.min(10, step * 0.65), height);
      }
    }
    ctx.fillStyle = text;
    ctx.textAlign = 'left';
    ctx.fillText(data.start, left, 435);
    ctx.textAlign = 'right';
    ctx.fillText(data.end, right, 435);
    if (find('cycle').value === 'year') {
      ctx.textAlign = 'center';
      for (const [i, bar] of data.bars.entries()) ctx.fillText(bar.date.slice(0, 4), x(i), 250);
    }
  }

  async function read(collect) {
    if (loading) return;
    const code = document.querySelector('#krxOpenSettings [data-krx=stock]').value.trim();
    const start = find('start').value;
    const end = find('end').value;
    const current = generation;
    loading = true;
    records = [];
    dateCoverage = null;
    view.replaceChildren();
    find('collect').disabled = find('read').disabled = true;
    find('cancel').hidden = !collect;
    status.textContent = collect ? '기간 자료 수집 중…' : '보관 자료 읽는 중…';
    let pending = true;
    let polling = false;
    const progressTimer = collect ? setInterval(async () => {
      if (!pending || polling || current !== generation) return;
      polling = true;
      try {
        const result = await api.krxOpenStatus();
        if (pending && current === generation && result.progress) {
          const progress = result.progress;
          status.textContent = '수집 중 ' + progress.processed + '/' + progress.days + '일 · 새 수신 ' +
            progress.received + '일' + (progress.date ? ' · ' + progress.date : '');
        }
      } catch {}
      finally { polling = false; }
    }, 1000) : null;
    try {
      const result = await api.krxOpenHistory(code, start, end, collect);
      pending = false;
      if (current !== generation) return;
      if (!result.ok) { status.textContent = errors[result.code] || '요청을 완료하지 못했습니다.'; return; }
      records = result.rows;
      dateCoverage = result.coverage || null;
      status.textContent = result.savedOnly ? '보관 자료 ' + records.length + '일' :
        '요청 ' + result.requestedDays + '일 · 새 수신 ' + result.received + '일 · 기존 보관 ' + result.cached +
        '일 · ' + (result.coverage?.complete ? '날짜 점검 완료' : '날짜별 추가 확인 필요') +
        (result.partial ? ' · ' + (errors[result.error] || '일부 수집 후 중단됐습니다.') : '');
      render();
    } catch {
      if (current === generation) status.textContent = '요청을 완료하지 못했습니다.';
    } finally {
      pending = false;
      clearInterval(progressTimer);
      loading = false;
      find('collect').disabled = find('read').disabled = false;
      find('cancel').hidden = true;
    }
  }

  find('collect').addEventListener('click', () => read(true));
  find('read').addEventListener('click', () => read(false));
  find('cancel').addEventListener('click', () => api.krxOpenCancel().catch(() => {}));
  find('cycle').addEventListener('change', render);
  find('basis').addEventListener('change', render);
  root.StockBookKrxHistory = {
    clear() {
      generation++;
      if (loading) api.krxOpenCancel().catch(() => {});
      records = [];
      dateCoverage = null;
      view.replaceChildren();
      status.textContent = '';
    },
  };
  for (const input of [find('start'), find('end'), document.querySelector('#krxOpenSettings [data-krx=stock]')]) {
    input.addEventListener('change', () => root.StockBookKrxHistory.clear());
  }
})(typeof window === 'object' ? window : globalThis);
