'use strict';

const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { normalizePacket, normalizeReport, validCode, schema, exportHtml } = require('./report-data.js');

const authFlags = ['-c', 'cli_auth_credentials_store="auto"', '-c', 'forced_login_method="chatgpt"'];
const maxOutput = 128 * 1024;
const error = message => ({ ok: false, error: message });
const authMessages = {
  unavailable: 'Windows용 Codex CLI를 찾을 수 없습니다.',
  'sign-in': 'PowerShell에서 codex login을 실행해 ChatGPT 계정으로 연결하세요.',
  failed: 'Codex CLI 로그인 상태를 확인하지 못했습니다.',
};

async function findCodex(env = process.env) {
  if (process.platform !== 'win32') return null;
  const dirs = (env.Path || env.PATH || '').split(path.delimiter)
    .map(value => value.trim().replace(/^"|"$/g, '')).filter(value => path.isAbsolute(value));
  const bundled = path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
  const builds = await fs.readdir(bundled, { withFileTypes: true }).catch(() => []);
  const bundledPaths = await Promise.all(builds.filter(item => item.isDirectory() && /^[a-f0-9]{16}$/i.test(item.name))
    .map(async item => {
      const dir = path.join(bundled, item.name);
      return { dir, modified: (await fs.stat(dir).catch(() => null))?.mtimeMs || 0 };
    }));
  dirs.push(...bundledPaths.sort((a, b) => b.modified - a.modified).map(item => item.dir));
  for (const dir of new Set(dirs)) {
    const executable = path.join(dir, 'codex.exe');
    if ((await fs.stat(executable).catch(() => null))?.isFile()) return executable;
  }
  return null;
}

function cliEnvironment(env) {
  // Inherit the Windows account and CLI home. Keep app/provider keys and endpoint overrides out of the child.
  const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'userprofile',
    'username', 'home', 'homedrive', 'homepath', 'localappdata', 'appdata', 'programdata', 'codex_home']);
  return Object.fromEntries(Object.entries(env).filter(([name]) => allowed.has(name.toLowerCase())));
}

function runProcess(executable, args, { cwd, input = '', timeout, env, captureStatus = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let bytes = 0, aborted = false;
    const stop = () => { aborted = true; child.kill(); };
    const timer = setTimeout(stop, timeout);
    const collect = (chunk, keep) => {
      bytes += chunk.length;
      if (bytes > maxOutput) stop();
      else if (keep) chunks.push(chunk);
    };
    child.stdout.on('data', chunk => collect(chunk, true));
    child.stderr.on('data', chunk => collect(chunk, captureStatus));
    child.stdin.on('error', () => {}); // The CLI may exit before reading stdin.
    child.once('error', () => { clearTimeout(timer); reject(new Error('CLI start failed')); });
    child.once('close', code => {
      clearTimeout(timer);
      if (aborted) reject(new Error('CLI limit reached'));
      else resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') });
    });
    child.stdin.end(input, 'utf8');
  });
}

async function inScratch(task) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stockbook-ai-report-'));
  try {
    return await task(dir);
  } finally {
    await Promise.all(['schema.json', 'result.json'].map(name => fs.unlink(path.join(dir, name)).catch(() => {})));
    await fs.rmdir(dir).catch(() => {});
  }
}

function createCodex({ discover = findCodex, launch = runProcess, env = process.env } = {}) {
  const childEnv = cliEnvironment(env);
  async function probe(executable, cwd) {
    const { code, stdout } = await launch(executable, [...authFlags, 'login', 'status'],
      { cwd, env: childEnv, timeout: 10000, captureStatus: true });
    if (code === 0 && /^Logged in using ChatGPT\s*$/mi.test(stdout)) return 'connected';
    if (/^Not logged in\s*$/mi.test(stdout) || code === 0 && /^Logged in using /mi.test(stdout)) return 'sign-in';
    return 'failed';
  }
  return {
    async status() {
      try {
        const exe = await discover(env);
        return exe ? await inScratch(dir => probe(exe, dir)) : 'unavailable';
      } catch { return 'failed'; }
    },
    async generate(packet) {
      const exe = await discover(env);
      if (!exe) return error(authMessages.unavailable);
      return inScratch(async dir => {
        const status = await probe(exe, dir);
        if (status !== 'connected') return error(authMessages[status]);
        const schemaFile = path.join(dir, 'schema.json'), resultFile = path.join(dir, 'result.json');
        await fs.writeFile(schemaFile, JSON.stringify(schema));
        const args = ['-a', 'never', 'exec', '--ignore-user-config', '--strict-config', '--ephemeral', '--skip-git-repo-check',
          '--sandbox', 'read-only', '--color', 'never', '--output-schema', schemaFile, '--output-last-message', resultFile,
          ...authFlags, '-c', 'web_search="disabled"', '-c', 'model_reasoning_effort="low"',
          ...['apps', 'hooks', 'memories', 'multi_agent', 'shell_tool', 'shell_snapshot', 'view_image',
            'skill_mcp_dependency_install'].flatMap(feature => ['--disable', feature]), '-'];
        const prompt = [
          '제공된 JSON만 사용해 한국어 종목 관찰 보고서를 작성하세요. 외부 조회와 로컬 파일 접근은 필요 없습니다.',
          '조건검색 판정이 있으면 충족·미충족·판정 불가와 실제 값·기준값을 첫 근거에 제시하세요. 조건검색 결과 자체를 다시 판정하지 마세요.',
          'summary는 핵심 판정과 해석을 요약하세요. findings는 판정 근거, 반대 근거, 확인할 조건 순서로 작성하고 실제 제공된 날짜를 인용하세요.',
          'chart는 선택 범위 관측치이며 rows는 상세 표본입니다. 상세 표본의 기간이나 최저·최고를 선택 범위 전체로 설명하지 마세요.',
          'investorHistory의 누적은 명시된 수신일만 합산한 값입니다. disclosure는 해당 회계연도 사업보고서 수치이며 연결과 별도를 구분하세요.',
          '체크리스트의 직접 체크 여부를 판정으로 사용하지 마세요. 계산 자료와 명확한 기준이 있는 항목만 근거와 함께 해석하세요.',
          'entrySignal은 차트에 쓰인 진입 조건 결과입니다. null은 판정 근거 부족이며 조건 미충족이나 실제 매수 주체로 해석하지 마세요.',
          '판정에 영향을 주는 누락 자료만 limitations에 짧게 적고, 누락값을 0이나 미충족으로 바꾸거나 지표·수치를 만들지 마세요.',
          '종가·거래량·수급의 관찰과 해석을 구분하세요. 매매 지시나 가격 목표를 제시하지 마세요.',
          JSON.stringify(packet),
        ].join('\n');
        const { code } = await launch(exe, args, { cwd: dir, input: prompt, env: childEnv, timeout: 180000 });
        if (code !== 0 || (await fs.stat(resultFile).catch(() => null))?.size > maxOutput) {
          return error('Codex CLI가 보고서를 완료하지 못했습니다. 로그인과 사용량을 확인해 주세요.');
        }
        let result;
        try { result = JSON.parse(await fs.readFile(resultFile, 'utf8')); } catch {}
        const report = normalizeReport({ packet, result, createdAt: new Date().toISOString() });
        return report ? { ok: true, report } : error('보고서 형식 또는 근거 날짜가 원자료와 일치하지 않습니다.');
      });
    },
  };
}

function registerAiReports({ ipcMain, dialog, getMainWindow, getPageUrl, userData, codex = createCodex() }) {
  let preview = null, busy = false;
  const handle = (name, fn) => ipcMain.handle('ai-report-' + name, async (event, input) => {
    const win = getMainWindow(), contents = win?.webContents;
    if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame ||
        !getPageUrl() || event.senderFrame?.url.split('#')[0] !== getPageUrl()) return error('요청한 화면을 확인할 수 없습니다.');
    try { return await fn(input, win); } catch { return error('요청을 완료하지 못했습니다. 다시 시도해 주세요.'); }
  });
  const directory = () => path.join(userData(), 'ai-reports');
  const reportPath = code => path.join(directory(), code + '.json');
  handle('status', async () => ({ ok: true, status: await codex.status() }));
  handle('preview', input => {
    preview = null;
    const packet = normalizePacket(input);
    if (!packet) return error('차트 원자료가 부족하거나 종목·기간이 일치하지 않습니다.');
    preview = { packet, id: randomUUID(), expires: Date.now() + 5 * 60 * 1000 };
    return { ok: true, id: preview.id, packet };
  });
  handle('run', async (id, win) => {
    if (busy) return error('다른 분석이 실행 중입니다.');
    if (!preview || id !== preview.id || Date.now() >= preview.expires) return error('보낼 자료를 다시 확인해 주세요.');
    const draft = preview;
    busy = true;
    try {
      const answer = await dialog.showMessageBox(win, {
        type: 'question', title: 'Codex CLI 자료 전송', message: '확인한 종목 자료를 OpenAI로 보내 분석할까요?',
        detail: `종목 ${draft.packet.code}의 차트, 조건검색, 수급·공시 자료 중 미리보기에 표시된 자료와 수동 체크 상태가 전송됩니다. 연결된 ChatGPT 계정의 사용량을 사용합니다.`,
        buttons: ['취소', '전송하고 분석'], cancelId: 0, defaultId: 0,
      });
      if (answer.response !== 1) return { ok: false, cancelled: true };
      if (preview !== draft || Date.now() >= draft.expires) return error('보낼 자료를 다시 확인해 주세요.');
      preview = null;
      return await codex.generate(draft.packet);
    } finally { busy = false; }
  });
  handle('load', async code => {
    if (!validCode(code)) return error('지원하지 않는 종목 코드입니다.');
    try {
      const file = reportPath(code);
      if ((await fs.stat(file)).size > maxOutput) return error('저장된 보고서를 읽을 수 없습니다.');
      const report = normalizeReport(JSON.parse(await fs.readFile(file, 'utf8')));
      return report?.packet.code === code ? { ok: true, report } : error('저장된 보고서를 읽을 수 없습니다.');
    } catch (err) {
      return err.code === 'ENOENT' ? { ok: true, report: null } : error('저장된 보고서를 읽을 수 없습니다.');
    }
  });
  handle('save', async input => {
    const report = normalizeReport(input);
    if (!report) return error('저장할 보고서가 없습니다.');
    const file = reportPath(report.packet.code), temp = file + '.' + randomUUID() + '.tmp';
    await fs.mkdir(directory(), { recursive: true });
    try {
      await fs.writeFile(temp, JSON.stringify(report), { flag: 'wx' });
      await fs.rename(temp, file);
    } finally { await fs.unlink(temp).catch(() => {}); }
    return { ok: true };
  });
  handle('export', async (input, win) => {
    const report = normalizeReport(input);
    if (!report) return error('내보낼 보고서가 없습니다.');
    const selection = await dialog.showSaveDialog(win, {
      title: 'AI 분석 보고서 저장', defaultPath: 'StockBook-' + report.packet.code + '-AI.html',
      filters: [{ name: 'HTML 보고서', extensions: ['html'] }],
    });
    if (selection.canceled || !selection.filePath) return { ok: false, cancelled: true };
    await fs.writeFile(selection.filePath, exportHtml(report), 'utf8');
    return { ok: true };
  });
}

module.exports = { createCodex, registerAiReports };
