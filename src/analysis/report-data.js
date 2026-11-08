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

  const screenLabels = { sma: '단순이평', bb: 'BB 상단', ichimoku: '일목균형표', rsi: 'RSI', volume: '거래량', turnover: '거래대금' };
  const screenUnits = { sma: '원', bb: '원', ichimoku: '원', rsi: 'RSI', volume: '주', turnover: '원' };
  const screenOps = { crossUp: '상향 돌파', crossDown: '하향 돌파', above: '현재 위', below: '현재 아래',
    gte: '이상', enter: '양운 내부 진입', breakout: '양운 상단 돌파', bullish: '현재 양운' };
  const screenParams = { fast: '단기', slow: '장기', period: '기간', multiplier: '배수', shift: '이동',
    conversion: '전환', base: '기준', span: '스팬 B', displacement: '선행 이동', level: '기준선', threshold: '기준값' };
  const verdict = { match: '충족', 'no-match': '미충족', unknown: '판정 불가' };
  const finite = value => Number.isFinite(value) ? value : null;

  function normalizeScreening(input) {
    if (!validCode(input?.code) || !Object.hasOwn(verdict, input.state) ||
        !Array.isArray(input.results) || !input.results.length || input.results.length > 12) return null;
    const results = [];
    for (const row of input.results) {
      const { condition, time, window } = row || {};
      if (!Object.hasOwn(screenLabels, condition?.id) || !Object.hasOwn(screenOps, condition?.op) ||
          !Object.hasOwn(verdict, row.state) || !Object.hasOwn(cycles, time?.cycle) ||
          !['closed', 'latest'].includes(time.mode) || !Number.isInteger(time.barsAgo) ||
          time.barsAgo < 0 || time.barsAgo > 1200) return null;
      const settings = Object.fromEntries(Object.keys(screenParams).filter(key => Number.isFinite(condition[key]))
        .map(key => [key, condition[key]]));
      const config = window?.config;
      const period = ['count', 'streak'].includes(config?.kind) && Number.isInteger(config.span) &&
        config.span >= 1 && config.span <= 1200 ? {
          config: { kind: config.kind, span: config.span, threshold: finite(config.threshold),
            operator: ['gte', 'lte', 'eq'].includes(config.operator) ? config.operator : null },
          matched: amount(window.matched), unmatched: amount(window.unmatched), unknown: amount(window.unknown),
        } : null;
      results.push({ key: typeof row.key === 'string' && /^[A-L]$/.test(row.key) ? row.key : null,
        condition: { id: condition.id, op: condition.op, ...settings },
        time: { cycle: time.cycle, mode: time.mode, barsAgo: time.barsAgo },
        state: row.state, date: validDate(row.date) ? row.date : null, provisional: row.provisional === true,
        value: finite(row.value), reference: finite(row.reference), previousValue: finite(row.previousValue),
        previousReference: finite(row.previousReference), window: period });
    }
    return { code: input.code, state: input.state, fetchedAt: timestamp(input.fetchedAt), results };
  }

  const averagePeriods = [5, 10, 20, 60, 120, 200, 300];
  function normalizeChartEvidence(input) {
    if (!validDate(input?.start) || !validDate(input.end) || input.start > input.end ||
        !Number.isInteger(input.count) || input.count < 2 ||
        !['firstClose', 'lastClose', 'lowClose', 'highClose'].every(key => amount(input[key]) > 0)) return null;
    const averages = Array.isArray(input.averages) ? averagePeriods.flatMap(period => {
      const row = input.averages.find(item => item?.period === period);
      return row ? [{ period, latest: finite(row.latest), previous: finite(row.previous), fiveBarsAgo: finite(row.fiveBarsAgo) }] : [];
    }) : [];
    const trend = Array.isArray(input.trend) && input.trend.length <= maxRows &&
      input.trend.every((row, i, rows) => validDate(row?.date) && row.date >= input.start && row.date <= input.end &&
        (!i || row.date > rows[i - 1].date) && amount(row.close) > 0)
      ? input.trend.map(({ date, close }) => ({ date, close })) : [];
    return { start: input.start, end: input.end, count: input.count, firstClose: input.firstClose, lastClose: input.lastClose,
      lowClose: input.lowClose, highClose: input.highClose, previousDate: validDate(input.previousDate) ? input.previousDate : null,
      averages, trend };
  }

  const participants = ['foreign', 'institution', 'individual'];
  function normalizeInvestorHistory(input) {
    if (!['KIS', 'Naver'].includes(input?.source) || !validDate(input.start) || !validDate(input.end) ||
        input.start > input.end || !Number.isInteger(input.count) || input.count < 1 ||
        !Array.isArray(input.rows) || !input.rows.length || input.rows.length > Math.min(20, input.count) ||
        !participants.every(key => Number.isSafeInteger(input.totals?.[key]))) return null;
    if (!input.rows.every((row, i, rows) => validDate(row?.date) && row.date >= input.start &&
        row.date <= input.end && (!i || row.date > rows[i - 1].date) &&
        participants.every(key => Number.isSafeInteger(row[key])))) return null;
    const values = row => Object.fromEntries(participants.map(key => [key, row[key]]));
    return { source: input.source, unit: '주', fetchedAt: timestamp(input.fetchedAt),
      start: input.start, end: input.end, count: input.count, totals: values(input.totals),
      rows: input.rows.map(row => ({ date: row.date, ...values(row) })) };
  }

  const disclosureAccounts = ['매출액', '영업이익', '당기순이익', '자산총계', '부채총계', '자본총계'];
  function normalizeDisclosure(input, code) {
    if (input?.code !== code || typeof input.year !== 'string' || !/^20\d{2}$/.test(input.year) ||
        input.reportCode !== '11011' || !Array.isArray(input.rows)) return null;
    const rows = input.rows.filter(row => ['CFS', 'OFS'].includes(row?.statement) &&
      disclosureAccounts.includes(row.account)).slice(0, 24).map(row => ({
      statement: row.statement, account: row.account,
      amount: typeof row.amount === 'string' && /^-?[\d,]{1,28}(?:\.\d{1,6})?$/.test(row.amount) ? row.amount : null,
      currency: typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null,
      receipt: typeof row.receipt === 'string' && /^\d{14}$/.test(row.receipt) ? row.receipt : null,
    }));
    return rows.length ? { code, year: input.year, reportCode: '11011', fetchedAt: timestamp(input.fetchedAt), rows } : null;
  }

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
    const screening = normalizeScreening(input.screening);
    return { code: input.code, cycle: input.cycle, range: input.range, sourceType: input.sourceType,
      fetchedAt: timestamp(input.fetchedAt), rows, checks, investorFlow, chart: normalizeChartEvidence(input.chart),
      screening: screening?.code === input.code ? screening : null,
      investorHistory: input.cycle === 'day' ? normalizeInvestorHistory(input.investorHistory) : null,
      disclosure: normalizeDisclosure(input.disclosure, input.code) };
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
    const dates = new Set([...packet.rows.map(row => row.date), packet.chart?.start, packet.chart?.end,
      packet.chart?.previousDate, ...(packet.chart?.trend.map(row => row.date) || []),
      ...(packet.screening?.results.map(row => row.date) || []), packet.investorHistory?.start, packet.investorHistory?.end,
      ...(packet.investorHistory?.rows.map(row => row.date) || [])].filter(Boolean));
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

  function screeningMarkup(evidence) {
    if (!evidence) return '';
    return `<h4>조건검색 판정 · ${verdict[evidence.state]}</h4><p>수집 ${time(evidence.fetchedAt)}</p><ul>
      ${evidence.results.map(row => {
        const { condition, time: basis, window } = row;
        const params = Object.entries(screenParams).filter(([key]) => Object.hasOwn(condition, key))
          .map(([key, label]) => label + ' ' + number(condition[key])).join(' · ');
        const basisText = `${cycles[basis.cycle]} ${basis.mode === 'closed' ? '완성' : '최신'} ${basis.barsAgo}봉전`;
        const countOps = { gte: '이상', lte: '이하', eq: '같음' };
        const period = window && (window.config.kind === 'streak' ? `최근 ${window.config.span}봉 연속`
          : `${window.config.span}봉 중 ${number(window.config.threshold)}회 ${countOps[window.config.operator] || ''}`);
        return `<li><strong>${row.key ? row.key + ' · ' : ''}${screenLabels[condition.id]} ${screenOps[condition.op]} · ${verdict[row.state]}</strong>
          <br>${basisText} · ${row.date || '기준일 없음'}${row.provisional ? ' · 미확정 봉' : ''}${params ? ' · ' + params : ''}
          <br>실제 ${number(row.value)} / 기준 ${number(row.reference)} (${screenUnits[condition.id]}) · 직전 ${number(row.previousValue)} / ${number(row.previousReference)}
          ${period ? `<br>${period} · 충족 ${number(window.matched)} · 미충족 ${number(window.unmatched)} · 판정 불가 ${number(window.unknown)}` : ''}</li>`;
      }).join('')}</ul>`;
  }

  function chartEvidenceMarkup(chart) {
    if (!chart) return '';
    return `<h4>선택 범위 관측</h4><p>${chart.start} ~ ${chart.end} · ${chart.count}개 봉<br>
      종가 ${number(chart.firstClose)}원 → ${number(chart.lastClose)}원 · 최저 ${number(chart.lowClose)}원 · 최고 ${number(chart.highClose)}원</p>
      ${chart.averages.length ? `<details><summary>일봉 이동평균 원자료</summary><div class="sb-ai-table-scroll">
        <table><thead><tr><th scope="col">기간</th><th scope="col">마지막</th><th scope="col">직전</th><th scope="col">5봉 전</th></tr></thead>
        <tbody>${chart.averages.map(row => `<tr><th scope="row">${row.period}일</th><td>${number(row.latest)}</td><td>${number(row.previous)}</td><td>${number(row.fiveBarsAgo)}</td></tr>`).join('')}</tbody>
        </table></div></details>` : ''}`;
  }

  function investorMarkup(history) {
    if (!history) return '';
    const { source, count, start, end, totals, rows } = history;
    return `<h4>수급 수신 범위</h4><p>${source} · ${start} ~ ${end} · ${count}일 수신<br>
      수신일 누적 · 외국인 ${number(totals.foreign)}주 · 기관 ${number(totals.institution)}주 · 개인 ${number(totals.individual)}주</p>
      <details><summary>최근 수급 상세 (${rows.length}일)</summary><div class="sb-ai-table-scroll"><table>
        <thead><tr><th scope="col">일자</th><th scope="col">외국인(주)</th><th scope="col">기관(주)</th><th scope="col">개인(주)</th></tr></thead>
        <tbody>${rows.map(row => `<tr><th scope="row">${row.date}</th><td>${number(row.foreign)}</td><td>${number(row.institution)}</td><td>${number(row.individual)}</td></tr>`).join('')}</tbody>
      </table></div></details>`;
  }

  function disclosureMarkup(disclosure) {
    if (!disclosure) return '';
    return `<details><summary>Open DART 사업보고서 · ${disclosure.year}년</summary>
      <p>금융감독원 · 조회 ${time(disclosure.fetchedAt)}</p><div class="sb-ai-table-scroll"><table>
      <thead><tr><th scope="col">구분</th><th scope="col">계정</th><th scope="col">금액</th><th scope="col">공시</th></tr></thead>
      <tbody>${disclosure.rows.map(row => `<tr><td>${row.statement === 'CFS' ? '연결' : '별도'}</td><th scope="row">${row.account}</th>
        <td>${row.amount || '미수신'} ${row.currency || ''}</td><td>${row.receipt ? `<a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${row.receipt}" target="_blank" rel="noopener noreferrer">원문</a>` : '미수신'}</td></tr>`).join('')}</tbody>
      </table></div></details>`;
  }

  function reportMarkup({ packet, result, createdAt }) {
    const { code, rows, investorFlow, checks } = packet;
    const fullTrend = packet.chart?.trend.length > 1;
    const closes = (fullTrend ? packet.chart.trend : rows).map(row => row.close);
    const min = fullTrend ? packet.chart.lowClose : Math.min(...closes);
    const max = fullTrend ? packet.chart.highClose : Math.max(...closes);
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
      <p>${sources[packet.sourceType]} · 상세 표본 ${cycles[packet.cycle]} ${rows.length}개 · ${rows[0].date} ~ ${rows.at(-1).date}<br>원자료 조회 ${time(packet.fetchedAt)}</p>
      ${screeningMarkup(packet.screening)}${chartEvidenceMarkup(packet.chart)}
      <h4>요약</h4><p>${escape(result.summary)}</p>
      <h4>근거</h4><ul>${result.findings.map(item => `<li>${escape(item.text)} <small>(${item.dates.join(', ')})</small></li>`).join('')}</ul>
      <h4>${fullTrend ? '선택 범위 종가 흐름' : '상세 표본 종가 흐름'}</h4>
      <svg viewBox="0 0 240 88" role="img" aria-label="종가 그래프, 최저 ${number(min)}원, 최고 ${number(max)}원">
        <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>
      <p>최저 ${number(min)}원 · 최고 ${number(max)}원</p>
      <details class="sb-ai-report-table"><summary>원자료 표 (${rows.length}개)</summary><div class="sb-ai-table-scroll">
      <table><caption>가격·거래량${money ? ' · KIS 거래대금' : ''}</caption>
        <thead><tr><th scope="col">일자</th><th scope="col">시가(원)</th><th scope="col">고가(원)</th><th scope="col">저가(원)</th><th scope="col">종가(원)</th><th scope="col">거래량(주)</th>${money ? '<th scope="col">거래대금(원)</th>' : ''}${signals ? '<th scope="col">차트 진입 조건</th>' : ''}</tr></thead>
        <tbody>${rows.map(row => `<tr><th scope="row">${row.date}</th><td>${number(row.open)}</td><td>${number(row.high)}</td><td>${number(row.low)}</td><td>${number(row.close)}</td><td>${number(row.volume)}</td>${money ? `<td>${number(row.tradingValue)}</td>` : ''}${signals ? `<td>${signalLabel(row.entrySignal)}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div></details>
      ${investorMarkup(packet.investorHistory)}
      ${!packet.investorHistory && investorFlow ? `<p>${investorFlow.source} 수급 · ${investorFlow.date} · 외국인 ${number(investorFlow.foreign)}주 · 기관 ${number(investorFlow.institution)}주 · 개인 ${number(investorFlow.individual)}주</p>` : ''}
      ${disclosureMarkup(packet.disclosure)}
      <details><summary>사용자가 체크한 항목 (${checked.length}개)</summary>
      ${checked.length ? `<ul>${checked.map(item => `<li>${escape(item.criterion)}</li>`).join('')}</ul>` : '<p>직접 체크한 항목 없음</p>'}</details>
      ${result.limitations.length ? `<h4>자료의 한계</h4><ul>${result.limitations.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : ''}`;
  }

  function exportHtml(report) {
    return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>StockBook ${report.packet.code} AI 보고서</title><style>
      body{font:1rem/1.6 system-ui;margin:2rem auto;padding:0 1rem;max-width:48rem}svg{width:100%;max-height:16rem}
      .sb-ai-table-scroll{overflow:auto}table{border-collapse:collapse}td,th{border:1px solid;padding:.25rem .5rem;white-space:nowrap}
    </style><h1>StockBook AI 보고서</h1>${reportMarkup(report)}</html>`;
  }
  return Object.freeze({ principles, maxRows, averagePeriods, validCode, normalizePacket, normalizeReport, normalizeScreening, screeningMarkup, schema, reportMarkup, exportHtml, formatTime: time });
});
