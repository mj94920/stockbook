'use strict';
const series = require('../chart/series.js');
const { newsItems } = require('../news/list.cjs');
const industry = require('../desktop/themes.js');
function request(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !['code', 'period', 'pattern', 'provider'].includes(k))
  )
    throw Error('분석 요청 형식 오류');
  if (typeof value.code !== 'string' || !/^[0-9A-Z]{6}$/.test(value.code))
    throw Error('국내 종목코드를 확인하세요.');
  if (industry.isExcluded({ code: value.code })) throw Error('개별 주식만 지원합니다.');
  if (value.period !== undefined && !['1m', '3m', '1y'].includes(value.period))
    throw Error('자료 기간을 확인하세요.');
  return { code: value.code, period: value.period || '3m' };
}
function within(p, ms = 15000) {
  let timer;
  return Promise.race([
    p,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('자료 수집 시간 초과')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
const plain = (v, n = 500) => (typeof v === 'string' ? v.slice(0, n) : '');
function financeRows(data) {
  const info = data?.financeInfo,
    periods = (info?.trTitleList || []).slice(-6);
  return (info?.rowList || [])
    .slice(0, 24)
    .filter((r) => typeof r?.title === 'string')
    .map((r) => ({
      metric: plain(r.title, 100),
      unit: plain(r.unit, 40),
      values: periods.map((p) => ({
        period: plain(p.title || p.key, 100),
        estimate: p.isConsensus === 'Y',
        value: plain(String(r.columns?.[p.key]?.value ?? '자료 없음'), 150),
      })),
    }));
}
function indicatorFacts(candles, metadata) {
  const out = {};
  for (const cycle of ['day', 'week', 'month', 'year']) {
    const bars = series.aggregate(candles, cycle, { lastBarComplete: metadata.lastBarComplete }),
      cfg = series.cycleConfig(cycle);
    out[cycle] = {
      count: bars.length,
      last: bars.at(-1),
      settings: '앱 기본 지표 · 현재 창의 사용자 변경값 미연결',
      cloudValues:
        cfg.cloud?.map((period) => ({ period, value: series.average(bars, period).at(-1) })) ||
        null,
      averages: cfg.periods.map((period) => ({
        period,
        value: series.average(bars, period).at(-1),
      })),
      cloudPeriods: cfg.cloud,
    };
  }
  return out;
}
function createResearch({ httpsGet, getChartData, headers = {}, now = () => Date.now() }) {
  const cache = new Map();
  async function collect(value, { refresh = false } = {}) {
    const { code, period } = request(value),
      key = code + ':' + period,
      old = cache.get(key);
    if (old && !(refresh && old.done) && now() - old.at < 60000) return old.pending;
    const entry = { at: now(), pending: null, done: false };
    entry.pending = (async () => {
      const fetchedAt = new Date(now()).toISOString(),
        base = 'https://m.stock.naver.com/api/stock/' + code,
        days = { '1m': 31, '3m': 93, '1y': 366 }[period],
        since = new Date(now() - days * 86400000).toISOString().slice(0, 10);
      const evidence = [],
        missing = [];
      let name = code;
      const snapshot = industry.index([], { complete: true }).find((r) => r.stock.code === code);
      if (snapshot) {
        name = snapshot.stock.name;
        evidence.push({
          id: 'industry',
          title: '업종·시장',
          url: 'https://m.stock.naver.com/domestic/stock/' + code + '/total',
          fetchedAt,
          asOf: industry.asOf,
          status: 'received',
          data: { name, market: snapshot.stock.market, industry: snapshot.paths[0].leaf },
        });
      }
      const jobs = [
        [
          'prices',
          '가격·지표',
          'https://fchart.stock.naver.com/sise.nhn?symbol=' + code,
          async () => {
            const r = await getChartData(code, 'day');
            if (!r?.ok || r.metadata?.stockCode !== code) throw Error();
            const bars = r.candles.filter((c) => c.date >= since);
            if (!bars.length) throw Error();
            return {
              asOf: r.metadata.snapshotDate,
              data: {
                metadata: r.metadata,
                receivedCount: r.candles.length,
                periodCount: bars.length,
                indicators: indicatorFacts(r.candles, r.metadata),
                recentBars: bars.slice(-66),
                note: '기본 이동평균·구름 이평 값만 포함. BB·OBV·RSI·매매 신호는 이 입력에 미연결.',
              },
            };
          },
        ],
        [
          'finance',
          '공시 재무',
          base + '/finance/annual',
          async () => {
            const data = JSON.parse(await httpsGet(base + '/finance/annual', 10000, headers));
            if (data.itemCode && data.itemCode !== code) throw Error();
            const rows = financeRows(data);
            if (!rows.length) throw Error();
            return {
              asOf: rows[0]?.values.filter((v) => !v.estimate).at(-1)?.period || null,
              data: {
                rows,
                note: '공급자 연간 공시 기간 · 분기 원본 미연결 · 예상치 별도 표시 · 단위 필드가 없으면 원문 단위 확인 필요. 선택 기간으로 재무 결산을 잘라 재계산하지 않음.',
              },
            };
          },
        ],
        [
          'news',
          '종목 뉴스',
          'https://m.stock.naver.com/api/news/stock/' + code + '?pageSize=20&page=1',
          async () => {
            const raw = JSON.parse(
              await httpsGet(
                'https://m.stock.naver.com/api/news/stock/' + code + '?pageSize=20&page=1',
                10000,
                headers,
              ),
            );
            const rows = newsItems(raw, code)
              .filter(
                (n) =>
                  (!n.code || n.code === code) && n.time && Date.parse(n.time) >= Date.parse(since),
              )
              .slice(0, 20)
              .map((n) => ({
                title: plain(n.title, 250),
                source: plain(n.source, 100),
                time: plain(n.time, 80),
                url: plain(n.url, 1000),
                summary: plain(n.summary, 400),
              }));
            if (!rows.length) throw Error();
            return {
              asOf: rows[0].time,
              data: {
                rows,
                note: '최신 20건 중 기간 내 수신 자료. 기간 전체 뉴스 전수 조사 아님.',
              },
            };
          },
        ],
        [
          'profile',
          '기업 기본정보',
          base + '/basic',
          async () => {
            const d = JSON.parse(await httpsGet(base + '/basic', 10000, headers));
            if (d.itemCode !== code) throw Error();
            return {
              asOf: plain(d.localTradedAt, 80) || null,
              data: {
                name: plain(d.stockName, 100),
                market: plain(d.stockExchangeName, 80),
                nation: plain(d.stockExchangeType?.nationName, 80),
              },
            };
          },
        ],
      ];
      await Promise.all(
        jobs.map(async ([id, title, url, run]) => {
          try {
            const r = await within(run());
            evidence.push({ id, title, url, fetchedAt, status: 'received', ...r });
          } catch {
            missing.push(id);
            evidence.push({ id, title, url, fetchedAt, status: 'missing', asOf: null, data: null });
          }
        }),
      );
      const finance = evidence.find((e) => e.id === 'finance' && e.status === 'received');
      if (finance?.data.rows.some((r) => !r.unit)) missing.push('financeUnits');
      const profile = evidence.find((e) => e.id === 'profile' && e.status === 'received');
      if (profile?.data.name) name = profile.data.name;
      return {
        code,
        name,
        period,
        since,
        collectedAt: fetchedAt,
        evidence: evidence.sort((a, b) => a.id.localeCompare(b.id)),
        missing,
        unconfirmed: [
          'RSI 평활 방식',
          '월봉 피보나치 기준선',
          '매매 신호 최종 조건',
          '가격 조정 기준',
          '현재 창의 사용자 지표 변경값 미반영',
          '실제 거래대금·투자자 수급은 이 자료에 미연결',
        ],
      };
    })();
    cache.set(key, entry);
    while (cache.size > 20) cache.delete(cache.keys().next().value);
    entry.pending.then(
      () => {
        entry.done = true;
      },
      () => {
        if (cache.get(key) === entry) cache.delete(key);
      },
    );
    return entry.pending;
  }
  return { collect };
}
module.exports = { createResearch, request, financeRows, indicatorFacts };
