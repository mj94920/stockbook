'use strict';

const { samsung } = require('./krx-corporate-actions.js');
const dayMs = 86400000;
const calendarSource = 'https://global.krx.co.kr/contents/GLB/06/0602/0602010201/GLB0602010201T1.jsp';
const holidaySource = 'https://www.law.go.kr/lsInfoP.do?lsiSeq=131164';
const hangulSource = 'https://theme.archives.go.kr/next/specialDay/subInfo.do?specialDayId=00000067';
const fixedHolidays = {
  '01-01': '신정', '03-01': '삼일절', '05-05': '어린이날', '06-06': '현충일',
  '08-15': '광복절', '10-03': '개천절', '12-25': '성탄절',
};

function nonTradingDay(code, date) {
  const time = Date.parse(date + 'T00:00:00Z');
  const weekday = new Date(time).getUTCDay();
  if (weekday === 0 || weekday === 6) return { kind: 'weekend', reason: '주말', source: calendarSource };
  const monthDay = date.slice(5);
  if (monthDay === '05-01') return { kind: 'closed', reason: '근로자의 날 휴장', source: calendarSource };
  if (fixedHolidays[monthDay]) return { kind: 'closed', reason: fixedHolidays[monthDay], source: holidaySource };
  if (monthDay === '10-09' && date >= '2013-01-01') return { kind: 'closed', reason: '한글날', source: hangulSource };
  let yearEnd = Date.UTC(Number(date.slice(0, 4)), 11, 31);
  while ([0, 6].includes(new Date(yearEnd).getUTCDay())) yearEnd -= dayMs;
  if (time === yearEnd) return { kind: 'closed', reason: '연말 휴장', source: calendarSource };
  if (code === samsung.code && samsung.suspensionDates.includes(date)) {
    return { kind: 'suspended', reason: '액면분할 거래정지', source: samsung.source };
  }
  return null;
}

function coverage(code, start, end, records, checks = []) {
  const received = new Set(records.map(row => row.date));
  const attempts = new Map(checks.map(check => [check.date, check]));
  const counts = { received: 0, weekend: 0, closed: 0, suspended: 0,
    unverified: 0, failed: 0, marketEmpty: 0, stockMissing: 0 };
  const missing = [];
  const conflicts = [];
  for (let time = Date.parse(start + 'T00:00:00Z'); time <= Date.parse(end + 'T00:00:00Z'); time += dayMs) {
    const date = new Date(time).toISOString().slice(0, 10);
    const known = nonTradingDay(code, date);
    if (received.has(date)) {
      counts.received++;
      if (known) conflicts.push(date);
      continue;
    }
    const attempt = attempts.get(date);
    const entry = known || (attempt?.state === 'received'
      ? { kind: 'failed', reason: '수신 기록은 있으나 보관 일봉 없음 · 보관 상태 확인 필요' }
      : attempt?.state === 'error'
      ? { kind: 'failed', reason: '조회 실패 · ' + attempt.error }
      : attempt?.state === 'no-data'
        ? { kind: attempt.marketHasData ? 'stockMissing' : 'marketEmpty',
          reason: attempt.marketHasData ? '시장 자료 존재 · 개별 종목 미수신(거래정지 여부 미확인)' : '시장 전체 자료 없음(휴장·미게시 여부 미확인)' }
        : { kind: 'unverified', reason: '일별 조회 기록 없음 · 추가 확인 필요' });
    counts[entry.kind]++;
    missing.push({ date, ...entry, checkedAt: attempt?.checkedAt || null });
  }
  const unresolved = counts.unverified + counts.failed + counts.marketEmpty + counts.stockMissing;
  return { counts, missing, conflicts, unresolved, complete: unresolved === 0 && conflicts.length === 0 };
}

module.exports = { nonTradingDay, coverage };
