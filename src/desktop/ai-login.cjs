'use strict';

const { execFile, spawn } = require('node:child_process');
const path = require('node:path');

const commands = {
  codex: { status: 'codex login status', login: 'codex login', logout: 'codex logout' },
  claude: { status: 'claude auth status', login: 'claude auth login', logout: 'claude auth logout' },
};
const powershell = () => path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');

function run(command) {
  return new Promise(resolve => {
    execFile(powershell(), ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ' + command],
    { windowsHide: true, timeout: 15000, maxBuffer: 65536 }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, text: stdout + stderr });
    });
  });
}

function login(command) {
  return new Promise(resolve => {
    const child = spawn(powershell(), ['-NoProfile', '-NoExit', '-Command', command],
      { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', () => resolve({ ok: false }));
    child.once('spawn', () => { child.unref(); resolve({ ok: true }); });
  });
}

function registerAiLogin({ ipcMain, getMainWindow, getPageUrl, dialog, execute = run, startLogin = login }) {
  const busy = new Set();
  ipcMain.handle('ai-login', async (event, provider, action) => {
    const win = getMainWindow();
    const contents = win?.webContents;
    if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame ||
      !getPageUrl() || event.senderFrame?.url.split('#')[0] !== getPageUrl()) return { ok: false };
    if (!Object.hasOwn(commands, provider) || !Object.hasOwn(commands[provider], action)) return { ok: false };
    if (busy.has(provider)) return { ok: false, state: 'busy' };
    busy.add(provider);
    try {
      if (action === 'login') return await startLogin(commands[provider].login);
      if (action === 'logout') {
        const name = provider === 'codex' ? 'Codex' : 'Claude';
        const answer = await dialog.showMessageBox(win, {
          type: 'question', title: name + ' 로그아웃',
          message: name + ' CLI에서 로그아웃할까요?',
          detail: '이 Windows 사용자 계정의 CLI 로그인이 해제됩니다. 같은 로그인을 사용하는 다른 앱에도 적용됩니다.',
          buttons: ['취소', '로그아웃'], defaultId: 0, cancelId: 0,
        });
        if (answer.response !== 1) return { ok: true, cancelled: true };
        const result = await execute(commands[provider].logout);
        return { ok: result.code === 0 };
      }
      const result = await execute(commands[provider].status);
      if (provider === 'codex') {
        if (result.code === 0 && /Logged in using ChatGPT/i.test(result.text)) return { ok: true, state: 'connected' };
        if (result.code === 0 && /Logged in using/i.test(result.text)) return { ok: true, state: 'api-key' };
        if (/Not logged in/i.test(result.text)) return { ok: true, state: 'signed-out' };
      } else {
        try {
          const data = JSON.parse(result.text);
          if (typeof data.loggedIn === 'boolean') return { ok: true, state: data.loggedIn ? 'connected' : 'signed-out' };
        } catch {}
      }
      return { ok: false, state: 'unknown' };
    } catch {
      return { ok: false, state: 'unknown' };
    } finally {
      busy.delete(provider);
    }
  });
}

module.exports = { registerAiLogin };
