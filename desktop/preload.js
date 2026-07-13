import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Health
  health: () => ipcRenderer.invoke('health'),

  // Watchlist
  getWatchlist: () => ipcRenderer.invoke('watchlist:get'),
  addToWatchlist: (symbol) => ipcRenderer.invoke('watchlist:add', symbol),
  removeFromWatchlist: (symbol) => ipcRenderer.invoke('watchlist:remove', symbol),

  // Scans
  saveScan: (scan) => ipcRenderer.invoke('scans:save', scan),
  getScanHistory: (symbol, limit) => ipcRenderer.invoke('scans:history', symbol, limit),
  getRecentScans: () => ipcRenderer.invoke('scans:recent'),
  runScan: (symbol) => ipcRenderer.invoke('scanner:run', symbol),

  // Chart
  getKlines: (symbol, interval, limit) => ipcRenderer.invoke('chart:klines', symbol, interval, limit),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Notifications
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
});
