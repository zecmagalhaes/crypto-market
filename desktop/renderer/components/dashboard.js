/**
 * Dashboard — Grid de pares com score, preço e sparkline
 */

class Dashboard {
  constructor() {
    this.container = document.getElementById('dashboard-grid');
    this.lastUpdate = document.getElementById('last-update');
    this.btnRefresh = document.getElementById('btn-refresh-all');
    this.scanInterval = null;
    this.unsubscribers = [];
  }

  async init() {
    this.btnRefresh.addEventListener('click', () => this.refreshAll());

    this.container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-dim);">
        <div style="font-size: 40px; margin-bottom: 12px;">⏳</div>
        <p>Carregando pares e executando análises...</p>
      </div>
    `;

    await this.refreshAll();
    this.startAutoScan();
  }

  async refreshAll() {
    const watchlist = await window.api.getWatchlist();
    if (!watchlist || watchlist.length === 0) {
      this.container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-dim);">
          <p>Watchlist vazia. Adicione pares nas Configurações.</p>
        </div>`;
      return;
    }

    this.container.innerHTML = '';
    const symbols = watchlist.map(w => w.symbol);

    // Connect WebSocket
    this._connectWS(symbols);

    // Run scans
    const results = await scannerService.scanAll(symbols, (done, total, sym) => {
      this.lastUpdate.textContent = `Analisando ${done}/${total}...`;
    });

    // Render cards
    for (const r of results) {
      this._renderCard(r);
    }

    this.lastUpdate.textContent = `Atualizado ${new Date().toLocaleTimeString('pt-BR')}`;

    // Save latest scans
    for (const r of results) {
      await window.api.saveScan(r);
    }
  }

  _connectWS(symbols) {
    // Clean up old subs
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];

    priceStream.connect(symbols);

    symbols.forEach(sym => {
      const unsub = priceStream.subscribe(sym, (data) => {
        this._updatePrice(sym, data.price, data.change);
      });
      this.unsubscribers.push(unsub);
    });
  }

  _renderCard(result) {
    const card = document.createElement('div');
    card.className = 'pair-card';
    card.dataset.symbol = result.symbol;

    const scoreClass = result.score >= 75 ? 'score-strong' :
      result.score >= 60 ? 'score-moderate' :
      result.score >= 40 ? 'score-neutral' : 'score-weak';

    const signalClass = result.signal.includes('COMPRA') ? 'signal-buy' :
      result.signal.includes('VENDA') ? 'signal-sell' : 'signal-neutral';

    const barColor = result.score >= 60 ? 'var(--green)' :
      result.score >= 40 ? 'var(--yellow)' : 'var(--red)';

    card.innerHTML = `
      <div class="pair-card-header">
        <span class="pair-symbol">${result.symbol.replace('USDT', '/USDT')}</span>
        <span id="change-${result.symbol}" class="pair-change dim">--</span>
      </div>
      <div class="pair-price" id="price-${result.symbol}">
        $${result.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div class="pair-score-row">
        <div class="score-bar">
          <div class="score-bar-fill" style="width:${result.score}%; background:${barColor}"></div>
        </div>
        <span class="score-value ${scoreClass}" style="padding: 2px 8px; border-radius: 4px;">${result.score}</span>
      </div>
      <div class="pair-signal ${signalClass}">${result.signal}</div>
      <div class="pair-sparkline" id="spark-${result.symbol}"></div>
    `;

    card.addEventListener('click', () => {
      App.navigate('detail', result.symbol);
    });

    this.container.appendChild(card);

    // Draw mini sparkline
    this._drawSparkline(result.symbol);
  }

  _updatePrice(symbol, price, change) {
    const priceEl = document.getElementById(`price-${symbol}`);
    const changeEl = document.getElementById(`change-${symbol}`);
    if (!priceEl) return;

    // Format based on price
    const decimals = price >= 1000 ? 2 : price >= 1 ? 2 : price >= 0.01 ? 4 : 6;
    priceEl.textContent = `$${price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

    if (changeEl && change !== undefined) {
      changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
      changeEl.className = `pair-change ${change >= 0 ? 'green' : 'red'}`;
    }
  }

  async _drawSparkline(symbol) {
    const container = document.getElementById(`spark-${symbol}`);
    if (!container || container._drawn) return;
    container._drawn = true;

    try {
      const klines = await scannerService.getKlines(symbol, '1h', 50);
      if (!klines || klines.length < 2) return;

      const canvas = document.createElement('canvas');
      canvas.width = container.clientWidth * 2;
      canvas.height = 100;
      canvas.style.width = '100%';
      canvas.style.height = '50px';
      container.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      const closes = klines.map(k => k.close);
      const min = Math.min(...closes);
      const max = Math.max(...closes);
      const range = max - min || 1;
      const w = canvas.width;
      const h = canvas.height;

      const isUp = closes[closes.length - 1] >= closes[0];
      ctx.strokeStyle = isUp ? '#3fb950' : '#f85149';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';

      ctx.beginPath();
      closes.forEach((c, i) => {
        const x = (i / (closes.length - 1)) * w;
        const y = h - ((c - min) / range) * (h - 10) - 5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

    } catch (e) { /* ignore */ }
  }

  startAutoScan() {
    this.stopAutoScan();
    this.scanInterval = setInterval(() => this.refreshAll(), 15 * 60 * 1000);
  }

  stopAutoScan() {
    if (this.scanInterval) clearInterval(this.scanInterval);
  }

  destroy() {
    this.stopAutoScan();
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];
  }
}

const dashboard = new Dashboard();
