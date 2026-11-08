(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockBookAiReportData = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  const principles = Object.freeze([
    ['pos', '주가가 바닥에 가깝고 위로 열려 있는가? (뚜껑 없음)'],
    ['align', '이평선 완전 정배열 상태인가?'],
    ['knee', '5일선이 저점에서 꺾여 상승 중인가? (무릎)'],
    ['golden', '5-10일선 골든크로스 (히말라야) 형성됐는가?'],
    ['ma20', '20일선이 우상향 중인가?'],
    ['ma200', '200일선·300일선이 우상향 중인가?'],
    ['pivot', '대량거래 급등 양봉 기준봉이 있는가?'],
    ['gap', '갭상승 후 추가 상승이 이어졌는가? (갭 유지)'],
    ['monthly', '월봉 기준봉 절반 이상 돌파했는가?'],
    ['index', '지수 대비 -10% 이하 이탈하지 않았는가?'],
  ].map(([key, text]) => Object.freeze({ key, text })));
  const cycles = { day: '일봉', week: '주봉', month: '월봉', year: '연봉' };
  const sources = { 'naver-daily': '네이버 금융 일봉', recorded: 'StockBook 보존 자료' };
  const ranges = ['1m', '3m', '6m', '1y', 'all'];
  const maxRows = 60;
  const validCode = value => typeof value === 'string' && /^\d{6}$/.test(value);
  const amount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const validDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value);
    return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
  };
  const timestamp = value => typeof value === 'string' && value.length <= 32 &&
    Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

  function normalizePacket(input) {
    if (!validCode(input?.code) || !Object.hasOwn(cycles, input.cycle) ||
        !Object.hasOwn(sources, input.sourceType) || !ranges.includes(input.range) ||
        !Array.isArray(input.rows) || input.rows.length < 2 || input.rows.length > maxRows) return null;
    const rows = [];
    for (const row of input.rows) {
      if (!validDate(row?.date) || (rows.length && row.date <= rows.at(-1).date)) return null;
      const { date, open, high, low, close, volume } = row;
      if (![open, high, low, close].every(value => amount(value) > 0) ||
          low > Math.min(open, close) || high < Math.max(open, close) || amount(volume) === null) return null;
      const entrySignal = input.cycle === 'day' && typeof row.entrySignal === 'boolean' ? row.entrySignal : null;
      rows.push({ date, open, high, low, close, volume, tradingValue: amount(row.tradingValue), entrySignal });
    }
    const checks = Object.fromEntries(principles.map(({ key, text }) => [
      key, { criterion: text, manuallyChecked: input.checks?.[key]?.manuallyChecked === true },
    ]));
    const flow = input.investorFlow;
    const investorFlow = input.cycle === 'day' && ['KIS', 'Naver'].includes(flow?.source) &&
      rows.some(row => row.date === flow.date) &&
      ['foreign', 'institution', 'individual'].every(key => Number.isSafeInteger(flow[key]))
      ? { source: flow.source, date: flow.date, unit: '주', foreign: flow.foreign,
        institution: flow.institution, individual: flow.individual } : null;
    return { code: input.code, cycle: input.cycle, range: input.range, sourceType: input.sourceType,
      fetchedAt: timestamp(input.fetchedAt), rows, checks, investorFlow };
  }

  const schema = {
    type: 'object', additionalProperties: false, required: ['summary', 'findings', 'limitations'],
    properties: {
      summary: { type: 'string' },
      findings: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['text', 'dates'],
        properties: { text: { type: 'string' }, dates: { type: 'array', items: { type: 'string' } } },
      } },
      limitations: { type: 'array', items: { type: 'string' } },
    },
  };
  const validText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;

  function normalizeReport(input) {
    const packet = normalizePacket(input?.packet);
    const result = input?.result;
    const createdAt = timestamp(input?.createdAt);
    if (!packet || !createdAt || !validText(result?.summary, 1500) ||
        !Array.isArray(result.findings) || result.findings.length < 1 || result.findings.length > 8 ||
        !Array.isArray(result.limitations) || result.limitations.length > 8 ||
        !result.limitations.every(value => validText(value, 600))) return null;
    const dates = new Set(packet.rows.map(row => row.date));
    if (!result.findings.every(item => validText(item?.text, 700) && Array.isArray(item.dates) &&
      item.dates.length >= 1 && item.dates.length <= 6 && item.dates.every(date => dates.has(date)))) return null;
    return { packet, createdAt, result: { summary: result.summary.trim(),
      findings: result.findings.map(item => ({ text: item.text.trim(), dates: [...new Set(item.dates)] })),
      limitations: result.limitations.map(value => value.trim()) } };
  }

  const escape = value => String(value).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
  const number = value => value == null ? '미수신' : value.toLocaleString('ko-KR');
  const time = value => value ? new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
  }).format(new Date(value)) + ' KST' : '확인 불가';

  function reportMarkup({ packet, result, createdAt }) {
    const { code, rows, investorFlow, checks } = packet;
    const closes = rows.map(row => row.close);
    const min = Math.min(...closes), max = Math.max(...closes);
    const points = closes.map((value, i) => [
      (4 + 232 * i / (closes.length - 1)).toFixed(1),
      (max === min ? 44 : 84 - 80 * (value - min) / (max - min)).toFixed(1),
    ].join(',')).join(' ');
    const money = rows.some(row => row.tradingValue !== null);
    const signals = rows.some(row => row.entrySignal !== null);
    const signalLabel = value => value === true ? '충족' : value === false ? '미충족' : '판정 근거 없음';
    const checked = Object.values(checks).filter(item => item.manuallyChecked);
    return `
      <h4>종목 ${code} 보고서</h4><p>Codex CLI · ${time(createdAt)}</p>
      <p>${sources[packet.sourceType]} · ${cycles[packet.cycle]} ${rows.length}개 · ${rows[0].date} ~ ${rows.at(-1).date}<br>원자료 조회 ${time(packet.fetchedAt)}</p>
      <h4>요약</h4><p>${escape(result.summary)}</p>
      <h4>근거</h4><ul>${result.findings.map(item => `<li>${escape(item.text)} <small>(${item.dates.join(', ')})</small></li>`).join('')}</ul>
      <h4>종가 흐름</h4>
      <svg viewBox="0 0 240 88" role="img" aria-label="종가 그래프, 최저 ${number(min)}원, 최고 ${number(max)}원">
        <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>
      <p>최저 ${number(min)}원 · 최고 ${number(max)}원</p>
      <details class="sb-ai-report-table"><summary>원자료 표 (${rows.length}개)</summary><div class="sb-ai-table-scroll">
      <table><caption>가격·거래량${money ? ' · KIS 거래대금' : ''}</caption>
        <thead><tr><th scope="col">일자</th><th scope="col">시가(원)</th><th scope="col">고가(원)</th><th scope="col">저가(원)</th><th scope="col">종가(원)</th><th scope="col">거래량(주)</th>${money ? '<th scope="col">거래대금(원)</th>' : ''}${signals ? '<th scope="col">차트 진입 조건</th>' : ''}</tr></thead>
        <tbody>${rows.map(row => `<tr><th scope="row">${row.date}</th><td>${number(row.open)}</td><td>${number(row.high)}</td><td>${number(row.low)}</td><td>${number(row.close)}</td><td>${number(row.volume)}</td>${money ? `<td>${number(row.tradingValue)}</td>` : ''}${signals ? `<td>${signalLabel(row.entrySignal)}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div></details>
      ${investorFlow ? `<p>${investorFlow.source} 수급 · ${investorFlow.date} · 외국인 ${number(investorFlow.foreign)}주 · 기관 ${number(investorFlow.institution)}주 · 개인 ${number(investorFlow.individual)}주</p>` : ''}
      <h4>수동 체크 ${checked.length}/${principles.length}</h4>
      ${checked.length ? `<ul>${checked.map(item => `<li>${escape(item.criterion)}</li>`).join('')}</ul>` : '<p>직접 체크한 항목 없음</p>'}
      ${result.limitations.length ? `<h4>자료의 한계</h4><ul>${result.limitations.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : ''}`;
  }

  function exportHtml(report) {
    return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>StockBook ${report.packet.code} AI 보고서</title><style>
      body{font:1rem/1.6 system-ui;margin:2rem auto;padding:0 1rem;max-width:48rem}svg{width:100%;max-height:16rem}
      .sb-ai-table-scroll{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid;padding:.25rem .5rem;white-space:nowrap}
    </style><h1>StockBook AI 보고서</h1>${reportMarkup(report)}</html>`;
  }
  return Object.freeze({ principles, maxRows, validCode, normalizePacket, normalizeReport, schema, reportMarkup, exportHtml, formatTime: time });
});
