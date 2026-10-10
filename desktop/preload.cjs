// PluginChek™ — Copyright © 2026 Sheldon Davidson. MIT License. SPDX-License-Identifier: MIT
// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('pluginchek', {
  scanInventory: () => ipcRenderer.invoke('inventory:scan'),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  listProjects: dir => ipcRenderer.invoke('projects:list', dir),
  readFile: p => ipcRenderer.invoke('projects:read', p),
  fsExists: paths => ipcRenderer.invoke('fs:exists', paths),
  pathForFile: file => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  onOpenFiles: cb => ipcRenderer.on('open-files', (_e, paths) => cb(paths)),
  version: () => ipcRenderer.invoke('app:version'),
});
