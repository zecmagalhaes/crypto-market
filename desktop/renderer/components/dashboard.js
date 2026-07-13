/**
 * Dashboard — Cache instantâneo + WebSocket + scans em background
 */

class Dashboard {
  constructor() {
    this.container = document.getElementById('dashboard-grid');
    this.lastUpdate = document.getElementById('last-update');
    this.btnRefresh = document.getElementById('btn-refresh-all');
    this.scanInterval = null;
    this.unsubscribers = [];
    this.scanning = false;
  }

  log(msg) { console.log('[Dashboard]', msg); }

  async init() {
    this.btnRefresh.addEventListener('click', () => this.refreshAll());

    // Teste rápido de IPC
    try {
      await window.api.health();
    } catch (e) {
      this._showError('Falha no motor', 'Tente fechar e reabrir o app.\n\nErro: ' + e.message);
      return;
    }

    // 1. Carrega cache instantâneo (últimos scans salvos)
    const cached = await this._loadCached();
    if (cached.length > 0) {
      this._showCached(cached);
      this.log('Cache carregado: ' + cached.length + ' pares');
    }

    // 2. Busca watchlist e conecta WebSocket
    const watchlist = await window.api.getWatchlist();
    if (!watchlist?.length) {
      this._showStatus('star', 'Watchlist vazia', 'Adicione pares em Ajustes');
      return;
    }

    this._connectWS(watchlist.map(w => w.symbol));

    // 3. Scans em background — atualiza cards conforme chegam
    if (!cached.length) this._showStatus('hourglass_top', 'Analisando', 'Buscando dados da Binance...');
    await this._scanInBackground(watchlist.map(w => w.symbol), cached);
    this.scanning = false;

    this.lastUpdate.textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR');
    this.startAutoScan();
  }

  async _loadCached() {
    try {
      return await window.api.getRecentScans() || [];
    } catch (e) {
      this.log('Cache indisponível: ' + e.message);
      return [];
    }
  }

  _showCached(scans) {
    this.container.innerHTML = '';
    for (const s of scans) {
      this._renderCard(s);
      setTimeout(() => this._drawSparkline(s.symbol), 200);
    }
  }

  _showStatus(icon, title, text) {
    this.container.innerHTML = `
      <div class="status-msg">
        <span class="material-symbols-outlined status-icon" style="font-size:48px;color:var(--md-on-surface-dim)">${icon}</span>
        <h3>${title}</h3>
        <p>${text}</p>
      </div>`;
  }

  _showError(title, detail) {
    this.container.innerHTML = `
      <div class="status-msg">
        <span class="material-symbols-outlined status-icon" style="font-size:48px;color:var(--md-error)">error</span>
        <h3 style="color:var(--md-error)">${title}</h3>
        <pre>${detail}</pre>
        <button onclick="location.reload()" class="btn btn-primary" style="margin-top:12px">
          <span class="material-symbols-outlined" style="font-size:16px">refresh</span>
          Tentar novamente
        </button>
      </div>`;
  }

  async _scanInBackground(symbols, cached) {
    this.scanning = true;
    const cachedMap = new Map(cached.map(s => [s.symbol, s]));
    let done = 0;

    for (const sym of symbols) {
      if (!this.scanning) break;
      this.lastUpdate.textContent = 'Atualizando ' + (done + 1) + '/' + symbols.length + '...';

      const result = await scannerService.scan(sym);
      if (result && this.scanning) {
        // Atualiza ou cria o card
        const existing = document.querySelector(`.pair-card[data-symbol="${sym}"]`);
        if (existing) {
          this._updateCard(existing, result);
        } else {
          this._renderCard(result);
          setTimeout(() => this._drawSparkline(sym), 100);
        }
      }
      done++;
    }
  }

  async refreshAll() {
    if (this.scanning) return;
    const watchlist = await window.api.getWatchlist();
    if (!watchlist?.length) return;

    this.lastUpdate.textContent = 'Atualizando...';
    await this._scanInBackground(watchlist.map(w => w.symbol), []);
    this.lastUpdate.textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR');
  }

  _connectWS(symbols) {
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];
    try { priceStream.connect(symbols); } catch (e) {}

    symbols.forEach(sym => {
      try {
        const unsub = priceStream.subscribe(sym, data => this._updatePrice(sym, data.price, data.change));
        this.unsubscribers.push(unsub);
      } catch (e) {}
    });
  }

  _renderCard(result) {
    const card = document.createElement('div');
    card.className = 'pair-card';
    card.dataset.symbol = result.symbol;
    this._fillCard(card, result);
    card.addEventListener('click', () => App.navigate('detail', result.symbol));
    card.addEventListener('mousedown', this._ripple);
    this.container.appendChild(card);
  }

  _updateCard(card, result) {
    this._fillCard(card, result);
  }

  _fillCard(card, result) {
    const s = result.score;
    const scoreClass = s >= 75 ? 'score-strong' : s >= 60 ? 'score-moderate' : s >= 40 ? 'score-neutral' : 'score-weak';
    const barColor = s >= 60 ? 'var(--md-success)' : s >= 40 ? 'var(--md-warning)' : 'var(--md-error)';
    const signalClass = result.signal?.includes('COMPRA') ? 'signal-buy' : result.signal?.includes('VENDA') ? 'signal-sell' : 'signal-neutral';
    const d = result.price >= 1000 ? 2 : result.price >= 1 ? 2 : result.price >= .01 ? 4 : 6;

    card.innerHTML = `
      <div class="pair-card-header">
        <span class="pair-symbol">${result.symbol.replace('USDT', '/USDT')}</span>
        <span id="change-${result.symbol}" class="pair-change dim">--</span>
      </div>
      <div class="pair-price" id="price-${result.symbol}">
        $${result.price.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}
      </div>
      <div class="pair-score-row">
        <div class="score-bar"><div class="score-bar-fill" style="width:${Math.max(s,3)}%;background:${barColor}"></div></div>
        <span class="score-value ${scoreClass}">${s}</span>
      </div>
      <span class="pair-signal ${signalClass}">${result.signal || '--'}</span>
      <div class="pair-sparkline" id="spark-${result.symbol}"></div>`;
  }

  _updatePrice(symbol, price, change) {
    const priceEl = document.getElementById(`price-${symbol}`);
    const changeEl = document.getElementById(`change-${symbol}`);
    if (!priceEl) return;
    const d = price >= 1000 ? 2 : price >= 1 ? 2 : price >= .01 ? 4 : 6;
    priceEl.textContent = '$' + price.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    if (changeEl && change !== undefined) {
      changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
      changeEl.className = 'pair-change ' + (change >= 0 ? 'up' : 'down');
    }
  }

  async _drawSparkline(symbol) {
    const container = document.getElementById('spark-${symbol}');
    if (!container || container._drawn) return;
    container._drawn = true;
    try {
      const klines = await scannerService.getKlines(symbol, '1h', 50);
      if (!klines?.length || klines.length < 2) return;
      const canvas = document.createElement('canvas');
      canvas.width = 560; canvas.height = 96;
      canvas.style.cssText = 'width:100%;height:48px';
      container.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      const closes = klines.map(k => k.close);
      const min = Math.min(...closes), max = Math.max(...closes), range = max - min || 1;
      const isUp = closes.at(-1) >= closes[0];
      const gradient = ctx.createLinearGradient(0, 0, 0, 96);
      gradient.addColorStop(0, isUp ? 'rgba(102,187,106,.25)' : 'rgba(239,83,80,.25)');
      gradient.addColorStop(1, 'transparent');
      ctx.beginPath();
      closes.forEach((c, i) => {
        const x = (i / (closes.length - 1)) * 560;
        const y = 90 - ((c - min) / range) * 70;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.lineTo(560, 96); ctx.lineTo(0, 96); ctx.closePath();
      ctx.fillStyle = gradient; ctx.fill();
      ctx.beginPath();
      closes.forEach((c, i) => {
        const x = (i / (closes.length - 1)) * 560;
        const y = 90 - ((c - min) / range) * 70;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = isUp ? 'var(--md-success)' : 'var(--md-error)';
      ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    } catch (e) {}
  }

  _ripple(e) {
    const card = e.currentTarget;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = card.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    card.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }

  startAutoScan() {
    this.stopAutoScan();
    this.scanInterval = setInterval(() => this.refreshAll(), 15 * 60 * 1000);
  }

  stopAutoScan() { if (this.scanInterval) clearInterval(this.scanInterval); }

  destroy() {
    this.scanning = false;
    this.stopAutoScan();
    this.unsubscribers.forEach(fn => fn());
  }
}

const dashboard = new Dashboard();
