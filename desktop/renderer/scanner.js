/**
 * Scanner wrapper — chama o scanner no main process via IPC
 */

class ScannerService {
  constructor() {
    this.scanCache = new Map(); // symbol -> { result, timestamp }
  }

  async scan(symbol) {
    try {
      const result = await window.api.runScan(symbol);
      if (result.error) throw new Error(result.error);

      this.scanCache.set(symbol, {
        result,
        timestamp: Date.now(),
      });

      return result;
    } catch (err) {
      console.error(`Scan error for ${symbol}:`, err);
      return null;
    }
  }

  async scanAll(symbols, onProgress) {
    const results = [];
    for (let i = 0; i < symbols.length; i++) {
      if (onProgress) onProgress(i + 1, symbols.length, symbols[i]);
      const r = await this.scan(symbols[i]);
      if (r) results.push(r);
    }
    return results;
  }

  getCached(symbol) {
    const entry = this.scanCache.get(symbol);
    if (!entry) return null;
    // Cache valid for 5 minutes
    if (Date.now() - entry.timestamp > 5 * 60 * 1000) {
      this.scanCache.delete(symbol);
      return null;
    }
    return entry.result;
  }

  async getKlines(symbol, interval, limit) {
    return window.api.getKlines(symbol, interval, limit);
  }
}

const scannerService = new ScannerService();
