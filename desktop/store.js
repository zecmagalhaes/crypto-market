/**
 * Store — Armazenamento simples em JSON (zero dependências nativas)
 * Substitui better-sqlite3 sem precisar de rebuild no Electron
 */

import fs from 'fs';
import path from 'path';

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch (e) {
      console.error('[Store] Erro ao carregar:', e.message);
    }
    return { watchlist: [], scans: [], settings: {} };
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Store] Erro ao salvar:', e.message);
    }
  }

  // Watchlist
  getWatchlist() {
    return this.data.watchlist.filter(w => w.enabled !== false);
  }

  addToWatchlist(symbol) {
    const existing = this.data.watchlist.find(w => w.symbol === symbol.toUpperCase());
    if (existing) {
      existing.enabled = true;
    } else {
      this.data.watchlist.push({ symbol: symbol.toUpperCase(), added_at: Date.now(), enabled: true });
    }
    this._save();
  }

  removeFromWatchlist(symbol) {
    this.data.watchlist = this.data.watchlist.filter(w => w.symbol !== symbol);
    this._save();
  }

  // Scans
  saveScan(scan) {
    this.data.scans.push({
      ...scan,
      id: Date.now(),
      timestamp: Date.now(),
    });
    // Keep last 5000 scans max
    if (this.data.scans.length > 5000) {
      this.data.scans = this.data.scans.slice(-5000);
    }
    this._save();
  }

  getHistory(symbol, limit = 100) {
    let scans = this.data.scans;
    if (symbol) scans = scans.filter(s => s.symbol === symbol);
    return scans.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  getRecentScans() {
    const latest = new Map();
    for (const s of this.data.scans) {
      const existing = latest.get(s.symbol);
      if (!existing || s.timestamp > existing.timestamp) {
        latest.set(s.symbol, s);
      }
    }
    return [...latest.values()].sort((a, b) => b.score - a.score);
  }

  // Settings
  getSetting(key) {
    return this.data.settings[key] || null;
  }

  setSetting(key, value) {
    this.data.settings[key] = String(value);
    this._save();
  }

  // Init defaults
  ensureDefaults() {
    if (this.data.watchlist.length === 0) {
      const defaults = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
        'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
        'MATICUSDT', 'UNIUSDT', 'ATOMUSDT', 'LTCUSDT', 'ETCUSDT',
        'FILUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'NEARUSDT',
      ];
      this.data.watchlist = defaults.map(s => ({ symbol: s, added_at: Date.now(), enabled: true }));
      this._save();
    }
  }
}

export default Store;
