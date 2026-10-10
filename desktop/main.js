// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

import { app, BrowserWindow, protocol, net, shell, ipcMain, dialog, session } from 'electron';
import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultRoots, scanPlugins, listProjects } from './scanner.js';
import { resolveAppPath as resolveIn } from './paths.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_EXT = /\.(als|rpp|rpp-bak|flp|song|bwproject|cpr|npr|ptx|pts|logicx|band|reason|zip)$/i;
const MAX_READ = 400 * 1024 * 1024;
const allowedDirs = new Set(), allowedFiles = new Set();
const pendingOpen = []; // macOS open-file events that arrive before the window exists
let win = null;

// ES modules are blocked on file://, so serve the static site through a privileged app:// scheme.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const inside = (p, dir) => { const r = path.relative(dir, p); return r && !r.startsWith('..') && !path.isAbsolute(r); };
function readable(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) return false;
  const full = path.resolve(p);
  return allowedFiles.has(full) || [...allowedDirs].some(d => inside(full, d));
}

function projectArgs(argv) {
  return argv.slice(1).filter(a => typeof a === 'string' && !a.startsWith('-') && PROJECT_EXT.test(a) && existsSync(a) && statSync(a).isFile()).map(a => path.resolve(a));
}

function sendOpenFiles(paths) {
  if (!paths.length) return;
  paths.forEach(p => allowedFiles.add(p));
  const go = () => win?.webContents.send('open-files', paths);
  if (win?.webContents.isLoading()) win.webContents.once('did-finish-load', go); else go();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, title: 'PluginChek', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs') },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => { if (!e.url.startsWith('app://')) e.preventDefault(); });
  win.on('closed', () => { win = null; });
  win.loadURL('app://pluginchek/index.html');
}

function registerIpc() {
  ipcMain.handle('inventory:scan', async () => scanPlugins(defaultRoots()));
  ipcMain.handle('dialog:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    allowedDirs.add(path.resolve(r.filePaths[0]));
    return path.resolve(r.filePaths[0]);
  });
  ipcMain.handle('projects:list', async (_e, dir) => (allowedDirs.has(path.resolve(String(dir))) ? listProjects(path.resolve(String(dir))) : []));
  ipcMain.handle('projects:read', async (_e, p) => {
    if (!readable(p)) throw new Error('Path not permitted');
    const st = await fs.stat(p);
    if (!st.isFile()) throw new Error('Not a file');
    const fh = await fs.open(p, 'r');
    try { const len = Math.min(st.size, MAX_READ); const buf = Buffer.alloc(len); await fh.read(buf, 0, len, 0); return new Uint8Array(buf.buffer, buf.byteOffset, len); } finally { await fh.close(); }
  });
  ipcMain.handle('fs:exists', async (_e, paths) => {
    if (!Array.isArray(paths) || paths.length > 20000) return [];
    // Never stat UNC / network / device paths: touching \\host\share on Windows starts an SMB login and leaks credentials.
    const safe = p => typeof p === 'string' && p.length < 4096 && path.isAbsolute(p) && !/^(\\\\|\/\/)/.test(p) && !p.includes('\0');
    return Promise.all(paths.map(async p => { try { return safe(p) && !!(await fs.stat(p)); } catch { return false; } }));
  });
  ipcMain.handle('app:version', () => app.getVersion());
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } sendOpenFiles(projectArgs(argv)); });
  app.on('open-file', (e, p) => { e.preventDefault(); if (PROJECT_EXT.test(p)) { if (app.isReady() && win) sendOpenFiles([path.resolve(p)]); else pendingOpen.push(path.resolve(p)); } });
  app.whenReady().then(() => {
    protocol.handle('app', req => {
      const full = resolveIn(root, new URL(req.url).pathname);
      return full ? net.fetch(pathToFileURL(full).toString()) : new Response('Not found', { status: 404 });
    });
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    registerIpc();
    createWindow();
    sendOpenFiles([...projectArgs(process.argv), ...pendingOpen.splice(0)]);
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
