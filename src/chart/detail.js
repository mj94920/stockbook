(() => {
  const names={'1m':'1개월','3m':'3개월','6m':'6개월','1y':'1년','all':'전체'};
  function context(value){
    document.getElementById('chartName').textContent=value.name+' · '+value.code;
    document.title=value.name+' — 상세 차트';
    const range=value.viewRange||value.period;
    document.getElementById('chartPeriod').textContent=names[range]||range;
    document.getElementById('chartCycle').textContent=window.StockBookChartSeries.cycleConfig(value.barCycle||'day').label;
    document.getElementById('chartFollow').value=value.follow?'follow':'pin';
    document.getElementById('chartStatus').textContent=value.follow?'종합 화면의 선택 종목·봉 주기·조회 범위를 따라갑니다.':'이 창의 종목·봉 주기·조회 범위를 고정했습니다.';
    window.StockBookCharts?.show(document.getElementById('chartViewport'),value,'detail');
    window.dispatchEvent(new CustomEvent('stockbook:chart-context',{detail:{...value}}));
  }
  window.stockBookChart?.onContext(context);
  document.getElementById('chartFollow').addEventListener('change',async event=>{
    const result=await window.stockBookChart?.setFollow(event.target.value==='follow');
    if(!result?.ok)document.getElementById('chartStatus').textContent='종목 연결 상태를 변경하지 못했습니다.';
  });
})();
