'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerAiLogin } = require('../src/desktop/ai-login.cjs');

test('AI login reads CLI status, rejects foreign frames, and requires confirmation before shared logout', async () => {
  let handle;
  const sender = { mainFrame: { url: 'file:///app.html' } };
  const event = { sender, senderFrame: sender.mainFrame };
  let confirmation = 0;
  const calls = [];
  registerAiLogin({
    ipcMain: { handle: (_name, fn) => { handle = fn; } },
    getMainWindow: () => ({ webContents: sender }),
    getPageUrl: () => 'file:///app.html',
    dialog: { showMessageBox: async () => ({ response: confirmation }) },
    execute: async command => {
      calls.push(command);
      if (command === 'codex login status') return { code: 0, text: 'Logged in using ChatGPT' };
      if (command === 'claude auth status') return { code: 0, text: '{"loggedIn":false}' };
      return { code: 0, text: '' };
    },
    startLogin: async command => { calls.push(command); return { ok: true }; },
  });
  assert.equal((await handle({ sender, senderFrame: {} }, 'codex', 'status')).ok, false);
  assert.equal((await handle(event, 'codex; bad', 'status')).ok, false);
  assert.equal((await handle(event, 'codex', 'status')).state, 'connected');
  assert.equal((await handle(event, 'claude', 'status')).state, 'signed-out');
  assert.equal((await handle(event, 'codex', 'logout')).cancelled, true);
  assert.equal(calls.includes('codex logout'), false);
  confirmation = 1;
  assert.equal((await handle(event, 'codex', 'logout')).ok, true);
  assert.equal(calls.at(-1), 'codex logout');
  assert.equal((await handle(event, 'claude', 'login')).ok, true);
  assert.equal(calls.at(-1), 'claude auth login');
});
