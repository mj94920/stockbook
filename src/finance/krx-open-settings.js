(() => {
  'use strict';
  const api = window.electronAPI;
  const panel = document.getElementById('krxOpenSettings');
  if (!panel || !api?.krxOpenStatus) return;
  const find = name => panel.querySelector('[data-krx="' + name + '"]');
  const key = find('key');
  const status = find('status');
  const result = find('result');
  const buttons = [...panel.querySelectorAll('button[data-krx]')];
  const format = new Intl.NumberFormat('ko-KR');
  const fields = { open: '시가', high: '고가', low: '저가', close: '종가', volume: '거래량', value: '거래대금' };
  const errors = {
    INPUT: '유가증권 종목코드와 기준일을 확인해 주세요.',
    KEY_MISSING: 'KRX 인증키를 등록해 주세요.',
    KEY_FORMAT: 'KRX 인증키 형식을 확인해 주세요.',
    KEY_CHANGED: '인증키가 변경되었습니다. 다시 조회해 주세요.',
    STORAGE: '로컬 보안 저장소를 사용할 수 없습니다.',
    NO_DATA: '해당 종목의 기준일 자료를 확인할 수 없습니다.',
    KIS_MISSING: 'KIS 연결이 없어 대조할 수 없습니다.',
    KIS_NO_DATA: 'KIS에서 같은 날짜의 원시 일봉을 확인하지 못했습니다.',
    KIS_SERVICE: 'KIS 대조 조회가 실패했습니다.',
  };
  const serviceText = { OK: '응답 확인', ACCESS: '접근 거부(서비스 승인·인증키 확인)', LIMIT: '요청 한도 초과', FORMAT: '응답 형식 확인 필요', SERVICE: '조회 실패' };
  const serviceStatus = services => services ? ' 일별매매정보 ' + serviceText[services.daily] +
    ' / 종목기본정보 ' + serviceText[services.basic] + '.' : '';
  let view = 0;
  let busy = false;

  function render(data) {
    const add = value => {
      const line = document.createElement('p');
      line.textContent = value;
      result.append(line);
    };
    const fetched = new Date(data.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    add('한국거래소 통계정보 · 기준일 ' + data.date + ' · 조회 ' + fetched + ' KST');
    add([data.name, data.code, data.market, data.isin, data.listed && '상장일 ' + data.listed].filter(Boolean).join(' · '));
    const comparison = data.comparison;
    if (comparison?.ok) {
      const matches = Object.keys(fields).every(field => data.values[field] === comparison.values[field]);
      add(matches ? 'KIS 원시 일봉과 6개 항목 일치' : 'KIS 원시 일봉과 차이 있음 · 집계 기준 확인 필요');
    } else if (comparison) add(errors[comparison.code] || errors.KIS_SERVICE);
    for (const [field, label] of Object.entries(fields)) {
      const unit = field === 'volume' ? '주' : '원';
      const value = data.values[field];
      const other = comparison?.values?.[field];
      add(label + ' ' + format.format(value) + unit +
        (other === undefined ? '' : ' · KIS ' + format.format(other) + unit +
          ' · 차이 ' + format.format(value - other) + unit));
    }
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    const current = view;
    const input = key.value;
    key.value = '';
    result.replaceChildren();
    buttons.forEach(button => { button.disabled = true; });
    try {
      const operations = {
        status: () => api.krxOpenStatus(),
        save: () => api.krxOpenSave(input),
        delete: () => api.krxOpenDelete(),
        lookup: () => api.krxOpenLookup(find('stock').value.trim(), find('date').value),
      };
      status.textContent = action === 'lookup' ? '조회 중…' : '';
      const data = await operations[action]();
      if (current !== view) return;
      if (!data.ok) status.textContent = (errors[data.code] || '요청을 완료하지 못했습니다.') + serviceStatus(data.services);
      else if (action === 'lookup') {
        status.textContent = '조회 완료.' + serviceStatus(data.services);
        render(data);
      } else if (action === 'delete') status.textContent = '인증키를 삭제했습니다.';
      else if (action === 'save') status.textContent = '인증키를 저장했습니다. 기준일을 선택해 두 서비스를 확인할 수 있습니다.';
      else status.textContent = data.registered ? '인증키 등록됨' : '인증키 미등록';
      if (data.ok && action !== 'lookup') {
        const registered = action === 'save' || (action === 'status' && data.registered);
        panel.querySelector('[data-krx-summary]').textContent = registered ? '인증키 등록됨' : '인증키 미등록';
      }
    } catch {
      if (current === view) status.textContent = '요청을 완료하지 못했습니다.';
    } finally {
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  for (const button of buttons) button.addEventListener('click', () => run(button.dataset.krx));
  window.StockBookKrxSettings = {
    refresh: () => run('status'),
    clear() {
      view++;
      window.StockBookKrxHistory?.clear();
      key.value = '';
      result.replaceChildren();
      status.textContent = '';
    },
  };
  panel.hidden = false;
})();
