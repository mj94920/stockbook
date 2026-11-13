// Development entry only. Reuse main.js / preload.js unchanged with an isolated profile.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
app.setPath('userData', process.env.STOCKBOOK_AGENT_DATA || path.join(app.getPath('appData'), 'StockBook-Agent-Preview'));
const code = ['adapter.js', 'panel.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
app.on('web-contents-created', (_event, contents) => {
  contents.on('did-finish-load', () => {
    if (contents.getURL().endsWith('stockbook-app.html')) {
      const characterRoot = process.env.CHARACTER_PROJECT;
      const config = { enabled: !!characterRoot,
        moduleUrl: characterRoot ? pathToFileURL(path.join(characterRoot, 'desktop-pet/src/agent.js')).href : '',
        sprites: characterRoot ? Object.fromEntries([['neutral', 'arin_shy_dark_01.png'], ['curious', 'arin_notice_dark_01.png'], ['worried', 'arin_sleepy_dark_01.png']].map(([key, file]) => [key, pathToFileURL(path.join(characterRoot, 'android-launcher/app/src/main/res/drawable-nodpi', file)).href])) : {} };
      contents.executeJavaScript(code + '\nwindow.stockbookCharacterConfig = ' + JSON.stringify(config) + ';\nimport(' + JSON.stringify(pathToFileURL(path.join(__dirname, 'character.mjs')).href) + ');').catch(e => console.error('[Agent preview]', e));
    }
  });
});
require('../main.js');
