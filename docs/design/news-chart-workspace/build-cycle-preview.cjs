'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const snapshot=require(path.join(root,'src/chart/snapshot.cjs')).readSnapshot('005930',root);
if(!snapshot.ok)throw Error(snapshot.error);
const script=file=>'<script>'+fs.readFileSync(path.join(root,file),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>';
const payload=JSON.stringify(snapshot).replaceAll('<','\\u003c');
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StockBook 주봉·월봉 확인</title>
<style>
:root{color-scheme:dark;--sb-bg:#0b0f19;--sb-panel:#111827;--sb-surface:#1f2937;--sb-text-1:#f3f4f6;--sb-text-2:#9ca3af;--sb-border:#374151;--sb-accent:#4f46e5}
body.light-mode{color-scheme:light;--sb-bg:#f8fafc;--sb-panel:#fff;--sb-surface:#f1f5f9;--sb-text-1:#0f172a;--sb-text-2:#475569;--sb-border:#e2e8f0;--sb-accent:#2563eb}
*{box-sizing:border-box}body{margin:0;background:var(--sb-bg);color:var(--sb-text-1);font:14px system-ui,sans-serif}header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--sb-border)}h1{font-size:18px;margin:0 auto 0 0}label{display:flex;align-items:center;gap:6px}.sb-input,.sb-btn{font:inherit;background:var(--sb-surface);color:var(--sb-text-1);border:1px solid var(--sb-border);border-radius:4px;padding:6px 10px}p{margin:8px 16px;color:var(--sb-text-2);font-size:12px}main{max-width:1600px;margin:auto}
</style><style>${fs.readFileSync(path.join(root,'src/chart/chart.css'),'utf8')}</style></head><body><header><h1>StockBook · 주봉·월봉 확인</h1>
<label>봉 주기 <select id="cycle" class="sb-input"><option value="day">일봉</option><option value="week" selected>주봉</option><option value="month">월봉</option></select></label><label>조회 범위 <select id="range" class="sb-input"><option value="1m">1개월</option><option value="3m">3개월</option><option value="6m">6개월</option><option value="1y">1년</option><option value="all" selected>전체</option></select></label><button id="theme" class="sb-btn" type="button">라이트 모드</button></header>
<p>삼성전자 · 2026-10-22 보존 일봉 집계 · 실시간 아님 · 영웅문 수치 대조 전</p><p>월봉 피보나치 구름은 기준 종가선 수식 확인 대기입니다. 하단 매매세는 OHLCV 추정 표시입니다.</p><main id="chart" data-chart-host></main>
${script('src/chart/series.js')}${script('src/chart/renderer.js')}<script>
const data=${payload};
function draw(){StockBookChartRenderer.mount(document.getElementById('chart'),data,{barCycle:document.getElementById('cycle').value,period:document.getElementById('range').value,light:document.body.classList.contains('light-mode')});}
document.getElementById('cycle').addEventListener('change',draw);document.getElementById('range').addEventListener('change',draw);
document.getElementById('theme').addEventListener('click',()=>{document.body.classList.toggle('light-mode');document.getElementById('theme').textContent=document.body.classList.contains('light-mode')?'다크 모드':'라이트 모드';draw();});draw();
</script></body></html>`;
fs.writeFileSync(path.join(__dirname,'chart-cycles-preview.html'),html);console.log('Built recorded-data chart cycle preview');
