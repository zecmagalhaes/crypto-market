/**
 * Detail View — Gráfico completo + breakdown + níveis de trade
 */

class DetailView {
  constructor() {
    this.symbol = null;
    this.currentTF = '4h';
    this.unsubscribe = null;
  }

  async show(symbol) {
    this.symbol = symbol;
    document.getElementById('detail-symbol').textContent = symbol.replace('USDT', '/USDT');

    // Timeframe buttons
    document.querySelectorAll('#chart-timeframe button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tf === this.currentTF);
      btn.onclick = () => this.switchTimeframe(btn.dataset.tf);
    });

    // Back button
    document.getElementById('btn-back').onclick = () => App.navigate('dashboard');

    // Load data
    const result = await scannerService.scan(symbol);
    if (!result) {
      document.getElementById('detail-price').textContent = 'Erro ao carregar';
      return;
    }

    this._updateHeader(result);
    this._renderBreakdown(result);
    this._renderLevels(result);
    this._renderIndicators(result);

    // Chart
    const container = document.getElementById('detail-chart');
    chartManager.init(container);
    await chartManager.loadData(symbol, this.currentTF);
    chartManager.drawLevels(result);

    // Real-time price
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = priceStream.subscribe(symbol, (data) => {
      document.getElementById('detail-price').textContent =
        `$${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const changeEl = document.getElementById('detail-change');
      changeEl.textContent = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%`;
      changeEl.className = `change ${data.change >= 0 ? 'up' : 'down'}`;
    });
  }

  async switchTimeframe(tf) {
    this.currentTF = tf;
    document.querySelectorAll('#chart-timeframe button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tf === tf);
    });
    const container = document.getElementById('detail-chart');
    chartManager.init(container);
    await chartManager.loadData(this.symbol, tf);

    // Re-draw levels
    const cached = scannerService.getCached(this.symbol);
    if (cached) chartManager.drawLevels(cached);
  }

  _updateHeader(result) {
    document.getElementById('detail-price').textContent =
      `$${result.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const badge = document.getElementById('detail-score');
    badge.textContent = result.score;
    badge.className = 'score-badge ' + (
      result.score >= 75 ? 'score-strong' :
      result.score >= 60 ? 'score-moderate' :
      result.score >= 40 ? 'score-neutral' : 'score-weak'
    );
  }

  _renderBreakdown(result) {
    const b = result.breakdown;
    let html = '<h3>📊 Breakdown</h3>';

    const items = [
      { label: 'Estrutura 4H', score: b.structure4h?.rawScore || 0, max: 15 },
      { label: 'Momentum 4H', score: b.momentum?.rawScore || 0, max: 15 },
      { label: 'Volume 4H', score: b.volume?.rawScore || 0, max: 10 },
      { label: 'Estrutura 1D', score: b.structure1d?.rawScore || 0, max: 15 },
      { label: 'Sentimento', score: b.sentiment?.rawScore || 0, max: 25 },
    ];

    for (const item of items) {
      const pct = (item.score / item.max) * 100;
      const color = pct >= 60 ? 'var(--green)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)';
      html += `
        <div class="breakdown-item">
          <span class="label">${item.label}</span>
          <div class="breakdown-mini-bar">
            <div style="width:${pct}%; height:100%; background:${color}; border-radius:1px"></div>
          </div>
          <span class="value">${item.score}/${item.max}</span>
        </div>`;
    }

    if (b.confluenceBonus > 0) {
      html += `<div class="breakdown-item">
        <span class="label green">Confluência</span>
        <span></span>
        <span class="value green">+${b.confluenceBonus} pts</span>
      </div>`;
    }

    document.getElementById('detail-breakdown').innerHTML = html;
  }

  _renderLevels(result) {
    const tp1Pct = ((result.takeProfit1 - result.entry) / result.entry * 100);
    const slPct = ((result.stopLoss - result.entry) / result.entry * 100);

    const html = `
      <h3>🎯 Níveis de Trade</h3>
      <div class="level-row">
        <span class="label">Entrada</span>
        <span class="value blue">$${result.entry.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="level-row">
        <span class="label">Stop Loss</span>
        <span class="value red">$${result.stopLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${slPct.toFixed(2)}%)</span>
      </div>
      <div class="level-row">
        <span class="label">Take Profit 1</span>
        <span class="value green">$${result.takeProfit1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+${tp1Pct.toFixed(2)}%)</span>
      </div>
      <div class="level-row">
        <span class="label">Take Profit 2</span>
        <span class="value green">$${result.takeProfit2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="level-row">
        <span class="label">R:R (TP1)</span>
        <span class="value ${result.rr >= 1.5 ? 'green' : 'yellow'}">1:${result.rr}</span>
      </div>
    `;

    document.getElementById('detail-levels').innerHTML = html;
  }

  _renderIndicators(result) {
    const b = result.breakdown;
    const html = `
      <h3>📈 Indicadores</h3>
      <div class="indicators-row">
        <div class="indicator-item">
          <div class="indicator-label">ATR(14)</div>
          <div class="indicator-value">$${result.atr?.toFixed(2) || '--'}</div>
        </div>
        <div class="indicator-item">
          <div class="indicator-label">EMA 20</div>
          <div class="indicator-value">$${result.ema20?.toFixed(2) || '--'}</div>
        </div>
        <div class="indicator-item">
          <div class="indicator-label">EMA 50</div>
          <div class="indicator-value">$${result.ema50?.toFixed(2) || '--'}</div>
        </div>
        <div class="indicator-item">
          <div class="indicator-label">Suporte</div>
          <div class="indicator-value green">$${result.nearestSupport?.toFixed(2) || '--'}</div>
        </div>
        <div class="indicator-item">
          <div class="indicator-label">Resistência</div>
          <div class="indicator-value red">$${result.nearestResistance?.toFixed(2) || '--'}</div>
        </div>
        <div class="indicator-item">
          <div class="indicator-label">Tendência 4H</div>
          <div class="indicator-value">${b.structure4h?.structure?.trend || '--'}</div>
        </div>
        <div class="indicator-item">
          <div class="indicator-label">Tendência 1D</div>
          <div class="indicator-value">${b.structure1d?.structure?.trend || '--'}</div>
        </div>
        <div class="indicator-item" style="grid-column: 1/-1">
          <div class="indicator-label">Sentimento Futures</div>
          <div class="indicator-value" style="font-size:12px; font-weight:400">${b.sentiment?.description || '--'}</div>
        </div>
      </div>
    `;

    document.getElementById('detail-indicators').innerHTML = html;
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  }
}

const detailView = new DetailView();
