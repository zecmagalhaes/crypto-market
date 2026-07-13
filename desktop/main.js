import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let tray = null;
let db = null;

// ── Database ──────────────────────────────────────────

function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'scanner.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      score INTEGER NOT NULL,
      signal TEXT NOT NULL,
      price REAL NOT NULL,
      entry REAL,
      stop_loss REAL,
      take_profit REAL,
      rr REAL,
      breakdown TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      symbol TEXT PRIMARY KEY,
      added_at INTEGER NOT NULL,
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Default watchlist
  const count = db.prepare('SELECT COUNT(*) as c FROM watchlist').get();
  if (count.c === 0) {
    const defaults = [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
      'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
      'MATICUSDT', 'UNIUSDT', 'ATOMUSDT', 'LTCUSDT', 'ETCUSDT',
      'FILUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'NEARUSDT',
    ];
    const insert = db.prepare('INSERT OR IGNORE INTO watchlist (symbol, added_at) VALUES (?, ?)');
    const now = Date.now();
    for (const s of defaults) insert.run(s, now);
  }
}

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
      preload: path.join(__dirname, 'preload.js'),
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
  // 16x16 simple icon
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
  // Watchlist
  ipcMain.handle('watchlist:get', () => {
    return db.prepare('SELECT * FROM watchlist WHERE enabled=1 ORDER BY symbol').all();
  });

  ipcMain.handle('watchlist:add', (_, symbol) => {
    db.prepare('INSERT OR REPLACE INTO watchlist (symbol, added_at, enabled) VALUES (?, ?, 1)').run(symbol.toUpperCase(), Date.now());
    return true;
  });

  ipcMain.handle('watchlist:remove', (_, symbol) => {
    db.prepare('DELETE FROM watchlist WHERE symbol=?').run(symbol);
    return true;
  });

  // Scans
  ipcMain.handle('scans:save', (_, scan) => {
    const stmt = db.prepare(`
      INSERT INTO scans (symbol, score, signal, price, entry, stop_loss, take_profit, rr, breakdown, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      scan.symbol, scan.score, scan.signal, scan.price,
      scan.entry || null, scan.stopLoss || null, scan.takeProfit || null,
      scan.rr || null, JSON.stringify(scan.breakdown || {}), Date.now()
    );
  });

  ipcMain.handle('scans:history', (_, symbol = null, limit = 100) => {
    let query = 'SELECT * FROM scans';
    const params = [];
    if (symbol) { query += ' WHERE symbol = ?'; params.push(symbol); }
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    const rows = db.prepare(query).all(...params);
    return rows.map(r => ({ ...r, breakdown: JSON.parse(r.breakdown || '{}') }));
  });

  ipcMain.handle('scans:recent', () => {
    const rows = db.prepare(`
      SELECT s.* FROM scans s
      INNER JOIN (
        SELECT symbol, MAX(timestamp) as max_ts FROM scans GROUP BY symbol
      ) latest ON s.symbol = latest.symbol AND s.timestamp = latest.max_ts
      ORDER BY s.score DESC
    `).all();
    return rows.map(r => ({ ...r, breakdown: JSON.parse(r.breakdown || '{}') }));
  });

  // Settings
  ipcMain.handle('settings:get', (_, key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return row ? row.value : null;
  });

  ipcMain.handle('settings:set', (_, key, value) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  });

  // Scanner
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

      // Save to DB
      const l = result.levels;
      const tp1Pct = ((l.takeProfit1 - l.entry) / l.entry * 100);
      const slPct = ((l.stopLoss - l.entry) / l.entry * 100);
      const rr = Math.abs(tp1Pct / slPct);

      db.prepare(`
        INSERT INTO scans (symbol, score, signal, price, entry, stop_loss, take_profit, rr, breakdown, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        symbol, result.score, result.signal, price,
        l.entry, l.stopLoss, l.takeProfit1,
        Number(rr.toFixed(2)), JSON.stringify(result.breakdown), Date.now()
      );

      return {
        symbol,
        score: result.score,
        signal: result.signal,
        emoji: result.emoji,
        price,
        entry: l.entry,
        stopLoss: l.stopLoss,
        takeProfit1: l.takeProfit1,
        takeProfit2: l.takeProfit2,
        rr: Number(rr.toFixed(2)),
        atr: l.atr,
        ema20: l.ema20,
        ema50: l.ema50,
        nearestSupport: l.nearestSupport,
        nearestResistance: l.nearestResistance,
        breakdown: result.breakdown,
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Chart data (klines)
  ipcMain.handle('chart:klines', async (_, symbol, interval, limit) => {
    try {
      const { getKlines } = await import('../src/binance.js');
      const klines = await getKlines(symbol, interval, limit || 200);
      return klines.map(k => ({
        time: k.openTime / 1000,
        open: k.open, high: k.high, low: k.low, close: k.close,
        volume: k.volume,
      }));
    } catch (err) {
      return [];
    }
  });

  // Notifications
  ipcMain.handle('notify', (_, title, body) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });
}

// ── App Lifecycle ─────────────────────────────────────

app.whenReady().then(() => {
  initDB();
  setupIPC();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});

app.on('before-quit', () => {
  if (db) db.close();
});
