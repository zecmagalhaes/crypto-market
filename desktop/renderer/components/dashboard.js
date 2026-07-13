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

  log(msg) { console.log('[Dashboard]', msg); }
  error(msg) { console.error('[Dashboard]', msg); }

  async init() {
    this.btnRefresh.addEventListener('click', () => this.refreshAll());
    this._showStatus('⏳', 'Verificando conexão...');

    // Teste básico: consegue falar com o main process?
    try {
      const test = await window.api.getWatchlist();
      this.log('Watchlist recebida: ' + (test ? test.length : 0) + ' pares');
    } catch (e) {
      this.error('IPC falhou: ' + e.message);
      this._showError(
        'Falha na comunicação com o motor de análise',
        'O processo principal do app pode ter falhado ao iniciar.\n\n' +
        'Tente:\n' +
        '1. Fechar e reabrir o app\n' +
        '2. Rodar ./diagnose.sh no terminal\n' +
        '3. Verificar se better-sqlite3 foi rebuildado: cd desktop && npx @electron/rebuild'
      );
      return;
    }

    await this.refreshAll();
    this.startAutoScan();
  }

  async refreshAll() {
    this._showStatus('⏳', 'Carregando watchlist...');

    let watchlist;
    try {
      watchlist = await window.api.getWatchlist();
      this.log('Watchlist carregada: ' + JSON.stringify(watchlist?.map(w => w.symbol)));
    } catch (e) {
      this.error('getWatchlist falhou: ' + e.message);
      this._showError('Erro ao carregar watchlist', e.message);
      return;
    }

    if (!watchlist || watchlist.length === 0) {
      this._showStatus('📋', 'Watchlist vazia. Adicione pares em Configurações.');
      return;
    }

    this.container.innerHTML = '';
    const symbols = watchlist.map(w => w.symbol);
    this._connectWS(symbols);

    this._showStatus('🔍', 'Iniciando análises...');
    let scanCount = 0;
    let failCount = 0;

    for (const sym of symbols) {
      this._showStatus('🔍', `Analisando ${sym} (${scanCount + failCount + 1}/${symbols.length})...`);

      try {
        const result = await scannerService.scan(sym);
        if (result) {
          this._renderCard(result);
          scanCount++;
          this.log(sym + ' scaneado: score=' + result.score);
        } else {
          failCount++;
          this.error(sym + ' retornou null');
          this._renderErrorCard(sym, 'Scan falhou');
        }
      } catch (e) {
        failCount++;
        this.error(sym + ' erro: ' + e.message);
        this._renderErrorCard(sym, e.message);
      }
    }

    this.lastUpdate.textContent = `Atualizado ${new Date().toLocaleTimeString('pt-BR')} — ${scanCount} OK, ${failCount} falhas`;
    this.log('Scan completo: ' + scanCount + ' ok, ' + failCount + ' falhas');
  }

  _showStatus(emoji, text) {
    if (this.container.children.length === 1 && this.container.children[0].classList.contains('status-msg')) {
      this.container.children[0].innerHTML = `
        <div style="font-size:40px;margin-bottom:12px">${emoji}</div>
        <p>${text}</p>`;
    } else {
      this.container.innerHTML = `
        <div class="status-msg" style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-dim)">
          <div style="font-size:40px;margin-bottom:12px">${emoji}</div>
          <p>${text}</p>
        </div>`;
    }
  }

  _showError(title, detail) {
    this.container.innerHTML = `
      <div class="status-msg" style="grid-column:1/-1;text-align:center;padding:60px">
        <div style="font-size:40px;margin-bottom:12px">❌</div>
        <p style="color:var(--red);font-weight:600;margin-bottom:12px">${title}</p>
        <pre style="color:var(--text-dim);font-size:12px;white-space:pre-wrap;text-align:left;max-width:500px;margin:0 auto">${detail}</pre>
        <button onclick="location.reload()" class="btn btn-primary" style="margin-top:16px">🔄 Tentar novamente</button>
      </div>`;
  }

  _connectWS(symbols) {
    this.unsubscribers.forEach(fn => fn());
    this.unsubscribers = [];

    try {
      priceStream.connect(symbols);
      this.log('WebSocket conectado para ' + symbols.length + ' pares');
    } catch (e) {
      this.error('WebSocket falhou: ' + e.message);
    }

    symbols.forEach(sym => {
      try {
        const unsub = priceStream.subscribe(sym, (data) => {
          this._updatePrice(sym, data.price, data.change);
        });
        this.unsubscribers.push(unsub);
      } catch (e) {
        this.error('subscribe falhou para ' + sym + ': ' + e.message);
      }
    });
  }

  _renderCard(result) {
    const card = document.createElement('div');
    card.className = 'pair-card';
    card.dataset.symbol = result.symbol;

    const scoreClass = result.score >= 75 ? 'score-strong' :
      result.score >= 60 ? 'score-moderate' :
      result.score >= 40 ? 'score-neutral' : 'score-weak';

    const signalClass = result.signal?.includes('COMPRA') ? 'signal-buy' :
      result.signal?.includes('VENDA') ? 'signal-sell' : 'signal-neutral';

    const barColor = result.score >= 60 ? 'var(--green)' :
      result.score >= 40 ? 'var(--yellow)' : 'var(--red)';

    const decimals = result.price >= 1000 ? 2 : result.price >= 1 ? 2 : result.price >= 0.01 ? 4 : 6;

    card.innerHTML = `
      <div class="pair-card-header">
        <span class="pair-symbol">${result.symbol.replace('USDT', '/USDT')}</span>
        <span id="change-${result.symbol}" class="pair-change dim">--</span>
      </div>
      <div class="pair-price" id="price-${result.symbol}">
        $${result.price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      </div>
      <div class="pair-score-row">
        <div class="score-bar">
          <div class="score-bar-fill" style="width:${result.score}%; background:${barColor}"></div>
        </div>
        <span class="score-value ${scoreClass}" style="padding: 2px 8px; border-radius: 4px;">${result.score}</span>
      </div>
      <div class="pair-signal ${signalClass}">${result.signal || '--'}</div>
      <div class="pair-sparkline" id="spark-${result.symbol}"></div>
    `;

    card.addEventListener('click', () => {
      App.navigate('detail', result.symbol);
    });

    this.container.appendChild(card);

    setTimeout(() => this._drawSparkline(result.symbol), 100);
  }

  _renderErrorCard(symbol, error) {
    const card = document.createElement('div');
    card.className = 'pair-card';
    card.style.opacity = '0.5';
    card.innerHTML = `
      <div class="pair-card-header">
        <span class="pair-symbol">${symbol.replace('USDT', '/USDT')}</span>
        <span class="pair-change red">Erro</span>
      </div>
      <div style="font-size:12px;color:var(--red);margin-top:8px">${error}</div>
    `;
    this.container.appendChild(card);
  }

  _updatePrice(symbol, price, change) {
    const priceEl = document.getElementById(`price-${symbol}`);
    const changeEl = document.getElementById(`change-${symbol}`);
    if (!priceEl) return;

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
      canvas.width = container.clientWidth * 2 || 560;
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
    } catch (e) {
      this.error('Sparkline ' + symbol + ': ' + e.message);
    }
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
