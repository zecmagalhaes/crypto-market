import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let tray = null;
let store = null;

// ── Window ────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Crypto Scanner',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Tray ──────────────────────────────────────────────

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Crypto Scanner');

  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Scanner', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Sair', click: () => { tray = null; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow.show());
}

// ── IPC Handlers ──────────────────────────────────────

function setupIPC() {
  ipcMain.handle('health', () => ({
    ok: true,
    store: !!store,
    node: process.version,
    electron: process.versions.electron,
    arch: process.arch,
  }));

  ipcMain.handle('watchlist:get', () => store.getWatchlist());
  ipcMain.handle('watchlist:add', (_, symbol) => { store.addToWatchlist(symbol); return true; });
  ipcMain.handle('watchlist:remove', (_, symbol) => { store.removeFromWatchlist(symbol); return true; });

  ipcMain.handle('scans:save', (_, scan) => { store.saveScan(scan); });
  ipcMain.handle('scans:history', (_, symbol, limit) => store.getHistory(symbol, limit));
  ipcMain.handle('scans:recent', () => store.getRecentScans());

  ipcMain.handle('settings:get', (_, key) => store.getSetting(key));
  ipcMain.handle('settings:set', (_, key, value) => store.setSetting(key, value));

  ipcMain.handle('scanner:run', async (_, symbol) => {
    try {
      const { getKlines, getPrice } = await import('../src/binance.js');
      const { calculateScore } = await import('../src/scorer.js');

      const [klines4h, klines1d, price] = await Promise.all([
        getKlines(symbol, '4h', 100),
        getKlines(symbol, '1d', 100),
        getPrice(symbol),
      ]);

      if (klines4h.length < 50 || klines1d.length < 50) {
        throw new Error('Dados insuficientes');
      }

      const result = await calculateScore(symbol, klines4h, klines1d);
      result.lastPrice = price;

      const l = result.levels;
      const tp1Pct = ((l.takeProfit1 - l.entry) / l.entry * 100);
      const slPct = ((l.stopLoss - l.entry) / l.entry * 100);
      const rr = Math.abs(tp1Pct / slPct);

      store.saveScan({
        symbol, score: result.score, signal: result.signal, price,
        entry: l.entry, stopLoss: l.stopLoss, takeProfit: l.takeProfit1,
        rr: Number(rr.toFixed(2)), breakdown: result.breakdown,
      });

      return { symbol, score: result.score, signal: result.signal, emoji: result.emoji,
        price, entry: l.entry, stopLoss: l.stopLoss, takeProfit1: l.takeProfit1,
        takeProfit2: l.takeProfit2, rr: Number(rr.toFixed(2)), atr: l.atr,
        ema20: l.ema20, ema50: l.ema50, nearestSupport: l.nearestSupport,
        nearestResistance: l.nearestResistance, breakdown: result.breakdown };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('chart:klines', async (_, symbol, interval, limit) => {
    try {
      const { getKlines } = await import('../src/binance.js');
      const klines = await getKlines(symbol, interval, limit || 200);
      return klines.map(k => ({
        time: k.openTime / 1000, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume,
      }));
    } catch (err) { return []; }
  });

  ipcMain.handle('notify', (_, title, body) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  });
}

// ── App Lifecycle ─────────────────────────────────────

app.whenReady().then(() => {
  const storePath = path.join(app.getPath('userData'), 'store.json');
  store = new Store(storePath);
  store.ensureDefaults();
  console.log('[Main] Store initialized at', storePath);
  console.log('[Main] Watchlist:', store.getWatchlist().map(w => w.symbol).join(', '));

  setupIPC();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});

app.on('activate', () => { if (mainWindow) mainWindow.show(); });
