#!/usr/bin/env node
// StockBook 버전 일괄 갱신 — 릴리스 워크플로가 자동 호출한다. 사람이 직접 버전을 올릴 필요 없음.
//
//   node scripts/bump-version.mjs [auto|patch|minor|major|none|X.Y.Z] [--dry-run]
//
//   auto  : 마지막 태그(vX.Y.Z) 이후 커밋 메시지로 결정 (Conventional Commits)
//           - "feat!: ..." / "BREAKING CHANGE" → major
//           - "feat: ..."                     → minor
//           - 그 외 (fix/refactor/style/…)     → patch
//   none  : 버전은 그대로 두고 파일 동기화만 수행
//
// 갱신 대상: package.json · package-lock.json · index.html 의 "Stock Book vX.Y.Z" · CHANGELOG.md
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mode   = args.find(a => !a.startsWith('--')) ?? 'auto';

const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const write = (f, s) => { if (!dryRun) writeFileSync(f, s); console.log(`  · ${f}`); };

const pkg = readJson('package.json');
const cur = pkg.version.split('.').map(Number);

// ── 커밋 수집 ──────────────────────────────────────────────────────────────
const lastTag = sh('git describe --tags --abbrev=0 --match "v[0-9]*"');
const range   = lastTag ? `${lastTag}..HEAD` : '-n 1 HEAD'; // 첫 릴리스: 직전 커밋만
const commits = sh(`git log ${range} --no-merges --format=%s%x1f%b%x1e`)
  .split('\x1e').map(s => s.trim()).filter(Boolean)
  .map(s => { const [subject, body = ''] = s.split('\x1f'); return { subject: subject.trim(), body }; })
  .filter(c => !/^chore\(release\)/.test(c.subject));

// ── 새 버전 계산 ───────────────────────────────────────────────────────────
let level = mode;
if (mode === 'auto') {
  if (commits.some(c => /^\w+(\(.+\))?!:/.test(c.subject) || /BREAKING CHANGE/.test(c.body))) level = 'major';
  else if (commits.some(c => /^feat(\(.+\))?:/.test(c.subject))) level = 'minor';
  else level = 'patch';
}

let next;
if (/^\d+\.\d+\.\d+$/.test(level)) next = level.split('.').map(Number);
else if (level === 'major') next = [cur[0] + 1, 0, 0];
else if (level === 'minor') next = [cur[0], cur[1] + 1, 0];
else if (level === 'patch') next = [cur[0], cur[1], cur[2] + 1];
else if (level === 'none')  next = cur;
else { console.error(`알 수 없는 인자: ${level}`); process.exit(2); }

const version = next.join('.');

console.log(`버전: ${pkg.version} → ${version}  (level=${level}${dryRun ? ', dry-run' : ''})`);

// ── 파일 갱신 ──────────────────────────────────────────────────────────────
pkg.version = version;
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

if (existsSync('package-lock.json')) {
  const lock = readJson('package-lock.json');
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
}

if (existsSync('index.html')) {
  const s = readFileSync('index.html', 'utf8');
  const t = s.replace(/Stock Book v\d+\.\d+\.\d+/g, `Stock Book v${version}`);
  if (t !== s) write('index.html', t);
}

// ── CHANGELOG ──────────────────────────────────────────────────────────────
if (level !== 'none') {
  const date  = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // KST
  const lines = commits.length ? commits.map(c => `- ${c.subject}`).join('\n') : '- 변경 사항 요약 없음';
  const entry = `## v${version} — ${date}\n\n${lines}\n\n`;
  const head  = '# Changelog\n\n자동 생성 — `scripts/bump-version.mjs`\n\n';
  const prev  = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8').replace(head, '') : '';
  write('CHANGELOG.md', head + entry + prev);
  if (!dryRun) writeFileSync('.release-notes.md', entry.split('\n').slice(2).join('\n'));
}

// ── GitHub Actions 출력 ────────────────────────────────────────────────────
if (process.env.GITHUB_OUTPUT && !dryRun) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nlevel=${level}\n`);
}
