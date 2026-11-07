(function (root) {
  'use strict';

  const unknown = '확인 불가';
  const metrics = ['매출액', '영업이익', '당기순이익', '영업이익률', 'ROE'];
  const flatFields = [
    ['totSale', 'totRevenue', 'revenue'], ['operProfit', 'operatingIncome'],
    ['netProfit', 'netIncome'], ['operatingMargin'], ['roe'],
  ];

  function periodLabel(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return unknown;
    const match = /^(\d{4})(?:[./-]?(0[1-9]|1[0-2])\.?)?$/.exec(String(value).trim());
    if (!match) return unknown;
    const [, year, month] = match;
    return month ? `${year}.${month}` : year;
  }

  function valueLabel(cell, rowUnit) {
    const value = cell?.value;
    if (typeof value !== 'string' && typeof value !== 'number') return unknown;
    const match = /^(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(%|조원|억원|백만원|천원|원)?$/.exec(String(value).trim());
    if (!match) return unknown;
    const [, amount, suffix] = match;
    const unit = suffix ?? cell?.unit ?? rowUnit;
    return /^(%|조원|억원|백만원|천원|원)$/.test(unit ?? '')
      ? `${amount} ${unit}`
      : `${amount} (단위 ${unknown})`;
  }

  function resultKind(isConsensus) {
    return isConsensus === 'N' ? '실적' : isConsensus === 'Y' ? '추정' : unknown;
  }

  function annualRows(annual) {
    const info = annual?.financeInfo;
    if (Array.isArray(info?.trTitleList) && Array.isArray(info.rowList)) {
      const rows = metrics.map(name => info.rowList.find(row => row?.title === name));
      return info.trTitleList.filter(Boolean).map(title => ({
        period: [title.title, title.key].map(periodLabel).find(label => label !== unknown) ?? unknown,
        kind: resultKind(title.isConsensus),
        values: rows.map(row => valueLabel(title.key ? row?.columns?.[title.key] : null, row?.unit)),
      }));
    }

    const legacy = Array.isArray(info) ? info : annual?.annualFinance;
    if (!Array.isArray(legacy)) return [];
    return legacy.slice(0, 5).filter(Boolean).map(row => ({
      period: periodLabel(row.stacYymm ?? row.stacYear ?? row.year),
      kind: resultKind(row.isConsensus),
      values: flatFields.map(keys => valueLabel({ value: keys.map(key => row[key]).find(value => value != null) })),
    }));
  }

  const api = { annualRows };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockBookNaverAnnual = api;
})(globalThis);
