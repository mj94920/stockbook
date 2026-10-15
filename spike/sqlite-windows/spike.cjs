// 검증 전용 스파이크 — 앱 코드가 아니다. 저장소 앱 코드·의존성에 영향 없음 (CI 러너의 작업 사본에서만 better-sqlite3 를 설치한다).
// 실행: <패키징된 앱의 실행 파일>(ELECTRON_RUN_AS_NODE=1)  spike.cjs  [리포트 출력 폴더]
// 목적: docs/SQLITE-STORAGE-DESIGN.md §2-3 스파이크 5항목 + §4-5 형 변환 표의 12.x 재확인 + 강제 종료/잠금 관찰.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');

// ── 자식 프로세스 모드 ───────────────────────────────────────────────────────
if (process.argv[2] === 'child') {
  const Database = require('better-sqlite3');
  const [, , , mode, dbfile] = process.argv;
  const say = (s) => process.stdout.write(s + '\n');
  const hold = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  const db = new Database(dbfile);
  db.pragma('journal_mode = WAL'); db.pragma('synchronous = NORMAL');
  db.exec('CREATE TABLE IF NOT EXISTS t(id INTEGER PRIMARY KEY, v TEXT)');
  if (mode === 'uncommitted') {
    const ins = db.prepare('INSERT INTO t(v) VALUES(?)');
    db.transaction(() => { for (let i = 0; i < 1000; i++) ins.run('base' + i); })();
    say('COMMITTED 1000');
    db.exec('BEGIN');
    for (let i = 0; i < 5000; i++) ins.run('pending' + i);
    say('IN_TX'); hold(60000);
  } else if (mode === 'streaming') {
    const ins = db.prepare('INSERT INTO t(v) VALUES(?)');
    for (let i = 1; ; i++) { ins.run('row' + i); if (i % 50 === 0) say('N ' + i); }
  } else if (mode === 'lock') {
    db.exec('BEGIN IMMEDIATE'); db.prepare('INSERT INTO t(v) VALUES(?)').run('locked-row');
    say('LOCKED'); hold(4000); db.exec('COMMIT'); say('RELEASED'); db.close();
  }
  return;
}

// ── 본 스파이크 ──────────────────────────────────────────────────────────────
const Database = require('better-sqlite3');
const outDir = process.argv[2] || path.join(process.cwd(), 'spike-out');
fs.mkdirSync(outDir, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), '스톡북-spike-'));   // 임시 경로 자체에 한글 포함
const results = []; let hardFail = 0;
const rec = (id, title, kind, ok, detail) => { results.push({ id, title, kind, ok, detail }); if (kind === 'hard' && !ok) hardFail++; console.log(`${ok ? 'PASS' : (kind === 'hard' ? 'FAIL' : 'INFO')} [${kind}] ${id} ${title} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const guard = (id, title, kind, fn) => { try { const r = fn(); rec(id, title, kind, r.ok, r.detail); } catch (e) { rec(id, title, kind, false, 'EXC ' + (e.code || '') + ' ' + e.message); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const spawnChild = (mode, file) => cp.spawn(process.execPath, [__filename, 'child', mode, file], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
const waitLine = (child, re, ms) => new Promise((res, rej) => { let buf = ''; const t = setTimeout(() => rej(new Error('timeout waiting ' + re)), ms); child.stdout.on('data', (d) => { buf += d; if (re.test(buf)) { clearTimeout(t); res(buf); } }); child.on('exit', () => { clearTimeout(t); rej(new Error('child exited early: ' + buf.slice(-200))); }); });
const exited = (child) => new Promise((r) => child.on('exit', (code, sig) => r({ code, sig })));

(async () => {
  // T0 환경
  const pkg = JSON.parse(fs.readFileSync(require.resolve('better-sqlite3/package.json'), 'utf8'));
  const tmpDb = new Database(':memory:'); const sv = tmpDb.prepare('select sqlite_version() v').get().v; tmpDb.close();
  let nodeFile = ''; try { const found = []; (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'deps' && f.name !== 'src') walk(p); } else if (f.name.endsWith('.node')) found.push(p); } })(path.dirname(require.resolve('better-sqlite3/package.json'))); nodeFile = found.find((p) => p.includes(process.platform + '-' + process.arch)) || found.find((p) => /Release/.test(p)) || found[0] || ''; } catch (_) {}
  rec('T0', '환경', 'info', true, { platform: process.platform, arch: process.arch, electron: process.versions.electron || null, node: process.versions.node, abi: process.versions.modules, napi: process.versions.napi, chrome: process.versions.chrome || null, driver: pkg.version, sqlite: sv, nodeBinary: nodeFile.split(path.sep).slice(-4).join('/'), execPath: process.execPath, user: os.userInfo().username });

  // T1 DB 열기(일반·한글·공백 경로) + WAL
  for (const [label, dir, name] of [['일반', work, 'a.db'], ['한글 디렉터리', path.join(work, '사용자 데이터', '스톡북'), 'stockbook.db'], ['한글 파일명', work, '스톡북 데이터.db']]) {
    guard('T1-' + label, `DB 열기·WAL·읽기/쓰기 (${label})`, 'hard', () => {
      fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, name); const db = new Database(f);
      const jm = db.pragma('journal_mode = WAL', { simple: true }); db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)');
      db.prepare('INSERT INTO t(v) VALUES(?)').run('한글값'); const row = db.prepare('SELECT v FROM t').get(); db.close();
      return { ok: jm === 'wal' && row.v === '한글값', detail: { journal_mode: jm, path: f, readBack: row.v } };
    });
  }

  // T2 형 변환(문서 §4-5 표)
  guard('T2', '컬럼 친화성 변환 — 문서 §4-5 표와 일치', 'hard', () => {
    const db = new Database(':memory:'); db.exec('CREATE TABLE t(r REAL, x TEXT, i INTEGER)');
    const ins = db.prepare('INSERT INTO t VALUES(?,?,?)'); const get = () => db.prepare('SELECT r,typeof(r) tr,x,typeof(x) tx,i,typeof(i) ti FROM t').get();
    const one = (a, b, c) => { db.exec('DELETE FROM t'); ins.run(a, b, c); return get(); };
    const cases = [
      ['REAL←"123"', () => one('123', null, null), (g) => g.r === 123 && g.tr === 'real'],
      ['TEXT←5', () => one(null, 5, null), (g) => g.x === '5.0' && g.tx === 'text'],
      ['TEXT←1.5', () => one(null, 1.5, null), (g) => g.x === '1.5' && g.tx === 'text'],
      ['INTEGER←"007"', () => one(null, null, '007'), (g) => g.i === 7 && g.ti === 'integer'],
      ['TEXT←"007"', () => one(null, '007', null), (g) => g.x === '007'],
      ['TEXT←lone surrogate', () => one(null, 'a\ud800b', null), (g) => g.x === 'a�b'],
      ['TEXT←NUL', () => one(null, 'a\u0000b', null), (g) => g.x === 'a\u0000b'],
      ['TEXT←emoji/한글', () => one(null, '😀한글', null), (g) => g.x === '😀한글'],
    ];
    const per = cases.map(([n, f, chk]) => { let g; try { g = f(); } catch (e) { return { n, match: false, got: 'EXC ' + e.message }; } return { n, match: !!chk(g), got: JSON.stringify(g) }; });
    const dbl = [0.1 + 0.2, 1e21, 2 ** 53, Number.MAX_VALUE].map((v) => { db.exec('DELETE FROM t'); ins.run(v, null, null); return Object.is(db.prepare('SELECT r FROM t').get().r, v); });
    db.close(); return { ok: per.every((p) => p.match) && dbl.every(Boolean), detail: { cases: per, doublesExact: dbl } };
  });

  // T3 강제 종료 복구
  try {
    const f = path.join(work, 'kill-uncommitted.db'); const c = spawnChild('uncommitted', f); await waitLine(c, /IN_TX/, 20000);
    const walSize = fs.existsSync(f + '-wal') ? fs.statSync(f + '-wal').size : 0; c.kill('SIGKILL'); const ex = await exited(c);
    const db = new Database(f); const ic = db.pragma('integrity_check', { simple: true }); const n = db.prepare('SELECT count(*) n FROM t').get().n; const pend = db.prepare("SELECT count(*) n FROM t WHERE v LIKE 'pending%'").get().n; db.close();
    rec('T3a', '강제 종료(커밋 안 된 트랜잭션): 재오픈 후 무결성·커밋분 보존·미커밋분 제거', 'hard', ic === 'ok' && n === 1000 && pend === 0, { integrity: ic, rows: n, pendingRows: pend, walBytesBeforeKill: walSize, exit: ex });
  } catch (e) { rec('T3a', '강제 종료(미커밋)', 'hard', false, 'EXC ' + e.message); }
  try {
    const f = path.join(work, 'kill-stream.db'); const c = spawnChild('streaming', f); let last = 0; c.stdout.on('data', (d) => { const m = String(d).match(/N (\d+)/g); if (m) last = parseInt(m[m.length - 1].slice(2), 10); });
    const t0 = Date.now(); while (last < 500 && Date.now() - t0 < 20000) await sleep(50);
    c.kill('SIGKILL'); const ex = await exited(c);
    const db = new Database(f); const ic = db.pragma('integrity_check', { simple: true }); const n = db.prepare('SELECT count(*) n FROM t').get().n; db.close();
    rec('T3b', '강제 종료(자동 커밋 연속 쓰기 중): 무결성 ok, 보고된 커밋 수 이상 보존', 'hard', ic === 'ok' && n >= last, { integrity: ic, rowsAfterKill: n, lastReportedCommitted: last, exit: ex });
  } catch (e) { rec('T3b', '강제 종료(연속 쓰기)', 'hard', false, 'EXC ' + e.message); }

  // T4 원자적 교체(rename)
  guard('T4a', '임시 DB 를 닫은 뒤 rename 으로 최종 DB 생성(최종 파일 없음)', 'hard', () => {
    const tmp = path.join(work, 'x.db.tmp'), fin = path.join(work, 'x.db'); const db = new Database(tmp); db.pragma('journal_mode = DELETE'); db.exec("CREATE TABLE t(v); INSERT INTO t VALUES('a')"); db.close();
    fs.renameSync(tmp, fin); const r = new Database(fin, { readonly: true }); const v = r.prepare('select v from t').get().v; r.close(); return { ok: v === 'a' && !fs.existsSync(tmp), detail: { v } };
  });
  guard('T4b', 'rename 으로 기존 파일 교체', 'hard', () => {
    const a = path.join(work, 'y.db'), b = path.join(work, 'y.db.tmp'); fs.writeFileSync(a, 'old'); fs.writeFileSync(b, 'new'); fs.renameSync(b, a); return { ok: fs.readFileSync(a, 'utf8') === 'new', detail: {} };
  });
  guard('T4c', '(관찰) DB 가 열려 있는 동안 rename / 삭제 시도', 'info', () => {
    const r = {};
    for (const [k, fn] of [['rename', (f) => fs.renameSync(f, f + '.moved')], ['unlink', (f) => fs.unlinkSync(f)]]) {
      const f = path.join(work, 'open-' + k + '.db'); const db = new Database(f); db.pragma('journal_mode = WAL'); db.exec('CREATE TABLE t(v)');
      try { fn(f); r[k] = 'success'; } catch (e) { r[k] = e.code; } try { db.close(); } catch (_) {}
    }
    return { ok: true, detail: r };
  });
  guard('T4d', '(관찰) 정상 종료 후 -wal/-shm 잔존 여부', 'info', () => {
    const f = path.join(work, 'w.db'); const db = new Database(f); db.pragma('journal_mode = WAL'); db.exec('CREATE TABLE t(v)'); db.prepare('INSERT INTO t VALUES(1)').run(); db.close();
    return { ok: true, detail: { wal: fs.existsSync(f + '-wal'), shm: fs.existsSync(f + '-shm') } };
  });

  // T5 두 프로세스 잠금(단일 인스턴스 필요성)
  try {
    const f = path.join(work, 'lock.db'); const setup = new Database(f); setup.pragma('journal_mode = WAL'); setup.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)'); setup.close();
    const holder = spawnChild('lock', f); await waitLine(holder, /LOCKED/, 20000);
    const b = new Database(f); b.pragma('busy_timeout = 300'); let writeCode = 'none', readOk = false;
    try { b.prepare('INSERT INTO t(v) VALUES(?)').run('b'); } catch (e) { writeCode = e.code || e.message; }
    try { b.prepare('SELECT count(*) n FROM t').get(); readOk = true; } catch (_) {}
    await exited(holder); let after = 'fail'; try { b.prepare('INSERT INTO t(v) VALUES(?)').run('b2'); after = 'ok'; } catch (e) { after = e.code; } b.close();
    rec('T5', '두 프로세스: 쓰기 락 보유 중 다른 프로세스의 쓰기=SQLITE_BUSY, 읽기(WAL)=허용, 락 해제 후 쓰기 성공', 'hard', /BUSY/.test(writeCode) && readOk && after === 'ok', { secondWriter: writeCode, readDuringWrite: readOk, writeAfterRelease: after });
  } catch (e) { rec('T5', '두 프로세스 잠금', 'hard', false, 'EXC ' + e.message); }

  // T6 백업 수단
  guard('T6a', 'VACUUM INTO 로 일관된 스냅샷 생성', 'hard', () => {
    const f = path.join(work, 'bk-src.db'), out = path.join(work, '스냅샷.db'); const db = new Database(f); db.pragma('journal_mode = WAL'); db.exec("CREATE TABLE t(v); INSERT INTO t VALUES('x')");
    db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`); db.close(); const r = new Database(out, { readonly: true }); const ic = r.pragma('integrity_check', { simple: true }); const n = r.prepare('select count(*) n from t').get().n; r.close(); return { ok: ic === 'ok' && n === 1, detail: { integrity: ic, rows: n } };
  });
  try {
    const f = path.join(work, 'bk2-src.db'), out = path.join(work, 'bk2-out.db'); const db = new Database(f); db.exec("CREATE TABLE t(v); INSERT INTO t VALUES('y')"); await db.backup(out); db.close();
    const r = new Database(out, { readonly: true }); const ok = r.prepare('select v from t').get().v === 'y'; r.close(); rec('T6b', 'db.backup() 온라인 백업 API', 'hard', ok, {});
  } catch (e) { rec('T6b', 'db.backup()', 'hard', false, 'EXC ' + e.message); }

  // T7 user_version / quick_check
  guard('T7', 'PRAGMA user_version 설정·조회, quick_check', 'hard', () => {
    const db = new Database(path.join(work, 'uv.db')); db.pragma('user_version = 1'); const uv = db.pragma('user_version', { simple: true }); const qc = db.pragma('quick_check', { simple: true }); db.close(); return { ok: uv === 1 && qc === 'ok', detail: { user_version: uv, quick_check: qc } };
  });

  // T8 성능 관찰
  guard('T8', '(관찰) 이 러너에서의 쓰기 성능', 'info', () => {
    const db = new Database(path.join(work, 'perf.db')); db.pragma('journal_mode = WAL'); db.pragma('synchronous = NORMAL'); db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, a TEXT, b REAL)'); const ins = db.prepare('INSERT INTO t(a,b) VALUES(?,?)');
    let t = process.hrtime.bigint(); db.transaction(() => { for (let i = 0; i < 100000; i++) ins.run('row' + i, i * 1.5); })(); const bulk = Number(process.hrtime.bigint() - t) / 1e6;
    const up = db.prepare('UPDATE t SET b = b + 1 WHERE id = 1'); t = process.hrtime.bigint(); for (let i = 0; i < 200; i++) up.run(); const one = Number(process.hrtime.bigint() - t) / 1e6 / 200; db.close();
    return { ok: true, detail: { bulkInsert100k_ms: +bulk.toFixed(1), singleUpdate_ms: +one.toFixed(3) } };
  });

  // 리포트
  const hard = results.filter((r) => r.kind === 'hard'); const md = [`# Windows SQLite 스파이크 결과`, '', `- 드라이버: better-sqlite3 ${pkg.version} / SQLite ${sv} / Electron ${process.versions.electron || '-'} (ABI ${process.versions.modules}, N-API ${process.versions.napi}, Node ${process.versions.node})`, `- 필수 항목: ${hard.filter((r) => r.ok).length}/${hard.length} 통과`, '', '| 항목 | 구분 | 결과 | 내용 |', '|---|---|---|---|'];
  for (const r of results) md.push(`| ${r.id} ${r.title} | ${r.kind} | ${r.ok ? 'PASS' : (r.kind === 'hard' ? '**FAIL**' : 'info')} | \`${(typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)).replace(/\|/g, '\\|').slice(0, 400)}\` |`);
  fs.writeFileSync(path.join(outDir, 'spike-report.json'), JSON.stringify({ results, hardFail }, null, 2)); fs.writeFileSync(path.join(outDir, 'spike-summary.md'), md.join('\n') + '\n');
  try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n필수 ${hard.length - hardFail}/${hard.length} 통과, 실패 ${hardFail}`); process.exit(hardFail ? 1 : 0);
})().catch((e) => { console.error('SPIKE CRASH', e); process.exit(2); });
