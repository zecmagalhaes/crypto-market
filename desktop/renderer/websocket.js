/**
 * WebSocketManager — unified Binance WebSocket with dynamic subscribe/unsubscribe,
 * exponential backoff reconnection, ping keepalive, and status observability.
 */
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.activeStreams = new Map();   // streamName -> Set<callback>
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.maxBackoff = 30000;          // 30s cap
    this.maxRetries = 10;             // after 10 failures → status 'failed'
    this.pingInterval = null;
    this._status = 'disconnected';
    this._listeners = new Map();      // event -> Set<callback>
  }

  // ── Public API ──────────────────────────────────────

  /** Initialize connection (call once on boot) */
  init() {
    this._connect();
  }

  /**
   * Subscribe to a stream and register a callback.
   * Returns an unsubscribe function for convenience.
   */
  subscribe(streamName, callback) {
    if (!this.activeStreams.has(streamName)) {
      this.activeStreams.set(streamName, new Set());
    }
    this.activeStreams.get(streamName).add(callback);

    // If already connected, send SUBSCRIBE immediately
    if (this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this._sendSubscribe([streamName]);
    }

    // Return an unsubscribe function
    return () => this._removeCallback(streamName, callback);
  }

  /**
   * Unsubscribe from a stream. If no callbacks remain, send UNSUBSCRIBE.
   */
  unsubscribe(streamName) {
    if (!this.activeStreams.has(streamName)) return;

    if (this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      this._sendUnsubscribe([streamName]);
    }

    this.activeStreams.delete(streamName);
  }

  /**
   * Register event listener.
   * Supported events: 'status', 'error', 'kline', 'ticker'
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
  }

  /** Clean shutdown */
  disconnect() {
    this._clearTimers();
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.activeStreams.clear();
    this.reconnectAttempts = 0;
    this._setStatus('disconnected');
  }

  /** Current connection status */
  get status() {
    return this._status;
  }

  // ── Internal: Connection Lifecycle ──────────────────

  _connect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch (e) { /* ignore */ }
    }

    this._setStatus('connecting');
    this.ws = new WebSocket('wss://stream.binance.com:9443/ws');

    this.ws.onopen = () => this._onOpen();
    this.ws.onmessage = (event) => this._onMessage(event);
    this.ws.onclose = (event) => this._onClose(event);
    this.ws.onerror = (err) => {
      this._emit('error', err);
      // onclose will fire after onerror — let _onClose handle reconnect
    };
  }

  _onOpen() {
    this.reconnectAttempts = 0;
    this._setStatus('connected');

    // Start ping keepalive (every 3 minutes)
    this._clearPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'PING' }));
      }
    }, 3 * 60 * 1000);

    // Re-subscribe all streams that have callbacks
    const streamNames = [...this.activeStreams.keys()];
    console.log('[WS] Conectado. Streams ativas:', streamNames.length, streamNames.slice(0, 5).join(', '));
    if (streamNames.length > 0) {
      this._sendSubscribe(streamNames);
    }
  }

  _onMessage(event) {
    let data;
    try { data = JSON.parse(event.data); } catch (e) { return; }

    // PONG response — ignore
    if (data.result === null && data.id) return;

    // Stream data from combined streams or single-stream response
    if (data.stream) {
      // Combined streams format: { stream: "btcusdt@miniTicker", data: {...} }
      const streamName = data.stream;
      this._dispatch(streamName, data.data);
    } else if (data.e) {
      // Single-stream format: { e: "24hrMiniTicker", s: "BTCUSDT", ... }
      // Build stream name from event type
      const streamName = `${data.s.toLowerCase()}@${this._eventToStreamType(data.e)}`;
      this._dispatch(streamName, data);
    }
  }

  _onClose(event) {
    this._clearPing();

    if (this._status === 'disconnected') return; // intentional shutdown

    this.reconnectAttempts++;
    this._setStatus('reconnecting');

    if (this.reconnectAttempts > this.maxRetries) {
      this._setStatus('failed');
      this._emit('error', new Error('WebSocket: max retries exceeded'));
      // Retry once more after 60s
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts = 0;
        this._connect();
      }, 60000);
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), this.maxBackoff);
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  // ── Internal: Subscribe / Unsubscribe Messages ──────

  _sendSubscribe(streams) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = {
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now(),
    };
    this.ws.send(JSON.stringify(msg));
  }

  _sendUnsubscribe(streams) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = {
      method: 'UNSUBSCRIBE',
      params: streams,
      id: Date.now(),
    };
    this.ws.send(JSON.stringify(msg));
  }

  // ── Internal: Helpers ───────────────────────────────

  _dispatch(streamName, data) {
    const callbacks = this.activeStreams.get(streamName);
    if (callbacks) {
      callbacks.forEach(cb => { try { cb(data); } catch (e) { /* prevent one callback from breaking others */ } });
    }

    // Also emit typed events
    if (streamName.includes('@miniTicker')) {
      this._emit('ticker', data);
    } else if (streamName.includes('@kline')) {
      this._emit('kline', data);
    }
  }

  _removeCallback(streamName, callback) {
    const cbs = this.activeStreams.get(streamName);
    if (!cbs) return;
    cbs.delete(callback);
    if (cbs.size === 0) {
      this.activeStreams.delete(streamName);
      if (this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
        this._sendUnsubscribe([streamName]);
      }
    }
  }

  _eventToStreamType(eventType) {
    // Binance event types → stream suffix
    switch (eventType) {
      case '24hrMiniTicker': return 'miniTicker';
      case 'kline':          return 'kline'; // interval is in data.k.i
      default:               return 'unknown';
    }
  }

  _setStatus(status) {
    this._status = status;
    this._emit('status', status);
  }

  _emit(event, data) {
    const cbs = this._listeners.get(event);
    if (cbs) {
      cbs.forEach(cb => { try { cb(data); } catch (e) { /* prevent one listener from breaking others */ } });
    }
  }

  _clearPing() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
  }

  _clearTimers() {
    this._clearPing();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}

// Singleton — replaces old PriceStream
const priceStream = new WebSocketManager();

// Alias for backward compatibility (app.js still references priceStream)
const wsManager = priceStream;
