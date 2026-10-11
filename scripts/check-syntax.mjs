#!/usr/bin/env node
// StockBook 정적 검사: JS 문법 · HTML 인라인 스크립트 문법 · JSON 유효성 · 금지 패턴
// 실행: npm run check   (CI의 첫 번째 관문)
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const JS_FILES   = ['main.js', 'preload.js'];
const HTML_FILES = ['index.html', 'splash.html'];
const JSON_FILES = ['package.json'];

let failed = 0;
const fail = (msg) => { failed++; console.error(`✗ ${msg}`); };
const ok   = (msg) => console.log(`✓ ${msg}`);

function checkSource(code, label) {
  try {
    // 컴파일만 하고 실행하지 않는다 (문법 오류 · 중복 선언 · 잘못된 async 등 검출)
    new vm.Script(code, { filename: label });
    ok(label);
  } catch (e) {
    const where = e.stack?.split('\n')[0] ?? '';
    fail(`${label}: ${e.message}  ${where}`);
  }
}

for (const f of JS_FILES) {
  if (!existsSync(f)) { fail(`${f} 없음`); continue; }
  // CommonJS 파일은 함수 래퍼로 감싸 require/module 사용을 허용
  checkSource(`(function (exports, require, module, __filename, __dirname) {\n${readFileSync(f, 'utf8')}\n})`, f);
}

for (const f of HTML_FILES) {
  if (!existsSync(f)) continue;
  const html = readFileSync(f, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc=/.test(attrs)) continue;
    if (/type=["'](?!text\/javascript|module)[^"']+["']/.test(attrs)) continue; // JSON-LD 등 제외
    const line = html.slice(0, m.index).split('\n').length;
    checkSource(m[2], `${f}#script${++i} (line ${line})`);
  }
}

for (const f of JSON_FILES) {
  if (!existsSync(f)) continue;
  try { JSON.parse(readFileSync(f, 'utf8')); ok(f); }
  catch (e) { fail(`${f}: ${e.message}`); }
}

// 프로젝트 규칙 위반 검사
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.build?.win?.target !== 'nsis') fail('package.json build.win.target 은 반드시 "nsis" 여야 함');
if (pkg.build?.asar !== false) fail('package.json build.asar 는 false 여야 함');

const main = readFileSync('main.js', 'utf8');
if (/nodeIntegration\s*:\s*true/.test(main)) fail('main.js: nodeIntegration:true 금지');
if (/contextIsolation\s*:\s*false/.test(main)) fail('main.js: contextIsolation:false 금지');

// Electron 파일 목록에 포함된 파일이 실제로 존재하는지
for (const f of pkg.build?.files ?? []) {
  if (!/[*?]/.test(f) && !existsSync(f)) fail(`build.files 에 있는 ${f} 가 존재하지 않음`);
}

if (failed) { console.error(`\n${failed}건 실패`); process.exit(1); }
console.log('\n모든 정적 검사 통과');
