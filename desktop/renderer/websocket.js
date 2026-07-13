/**
 * Binance WebSocket — dados em tempo real
 */

const WS_URL = 'wss://stream.binance.com:9443/ws';

class PriceStream {
  constructor() {
    this.ws = null;
    this.subscribers = new Map(); // symbol -> Set<callback>
    this.prices = new Map();
    this.status = 'disconnected';
    this.onStatusChange = null;
  }

  connect(symbols) {
    if (this.ws) this.ws.close();

    this._setStatus('connecting');

    // Multi-stream: um WebSocket pra todos os pares
    const streams = symbols.map(s => `${s.toLowerCase()}@miniTicker`).join('/');
    this.ws = new WebSocket(`${WS_URL}/${streams}`);

    this.ws.onopen = () => this._setStatus('connected');

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.stream) {
        const symbol = data.data.s;
        const price = parseFloat(data.data.c);
        const change = parseFloat(data.data.P);
        this.prices.set(symbol, { price, change, time: Date.now() });

        const subs = this.subscribers.get(symbol);
        if (subs) subs.forEach(cb => cb({ symbol, price, change }));
      }
    };

    this.ws.onclose = () => {
      this._setStatus('disconnected');
      // Reconnect after 5s
      setTimeout(() => this.connect(symbols), 5000);
    };

    this.ws.onerror = () => this._setStatus('disconnected');
  }

  subscribe(symbol, callback) {
    if (!this.subscribers.has(symbol)) this.subscribers.set(symbol, new Set());
    this.subscribers.get(symbol).add(callback);

    // Send current price if we have it
    const current = this.prices.get(symbol);
    if (current) callback(current);

    return () => this.subscribers.get(symbol)?.delete(callback);
  }

  getPrice(symbol) {
    return this.prices.get(symbol);
  }

  getAllPrices() {
    return Object.fromEntries(this.prices);
  }

  _setStatus(status) {
    this.status = status;
    if (this.onStatusChange) this.onStatusChange(status);
  }

  disconnect() {
    if (this.ws) this.ws.close();
    this.ws = null;
  }
}

// Singleton
const priceStream = new PriceStream();
