// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

import { app, BrowserWindow, protocol, net, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Set(['index.html', 'app.js', 'parser-core.js', 'ui-assistance.js', 'styles.css']);

// ES modules are blocked on file://, so serve the static site through a privileged app:// scheme.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 860, title: 'PluginChek', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => { if (!e.url.startsWith('app://')) e.preventDefault(); });
  win.loadURL('app://pluginchek/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const name = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    if (!ALLOWED.has(name)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(path.join(root, name)).toString());
  });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
