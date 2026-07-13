/**
 * Detail View — Gráfico + breakdown + níveis com Material Design
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

    document.querySelectorAll('#chart-timeframe button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tf === this.currentTF);
      btn.onclick = () => this.switchTimeframe(btn.dataset.tf);
    });

    document.getElementById('btn-back').onclick = () => App.navigate('dashboard');

    const result = await scannerService.scan(symbol);
    if (!result) {
      document.getElementById('detail-price').textContent = 'Erro';
      return;
    }

    this._updateHeader(result);
    this._renderBreakdown(result);
    this._renderLevels(result);
    this._renderIndicators(result);

    const container = document.getElementById('detail-chart');
    chartManager.init(container);
    await chartManager.loadData(symbol, this.currentTF);
    chartManager.drawLevels(result);

    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = priceStream.subscribe(symbol, data => {
      document.getElementById('detail-price').textContent =
        '$' + data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const changeEl = document.getElementById('detail-change');
      changeEl.textContent = (data.change >= 0 ? '+' : '') + data.change.toFixed(2) + '%';
      changeEl.className = 'change ' + (data.change >= 0 ? 'up' : 'down');
    });
  }

  async switchTimeframe(tf) {
    this.currentTF = tf;
    document.querySelectorAll('#chart-timeframe button').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.tf === tf));
    const container = document.getElementById('detail-chart');
    chartManager.init(container);
    await chartManager.loadData(this.symbol, tf);
    const cached = scannerService.getCached(this.symbol);
    if (cached) chartManager.drawLevels(cached);
  }

  _updateHeader(result) {
    document.getElementById('detail-price').textContent =
      '$' + result.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const badge = document.getElementById('detail-score');
    badge.textContent = result.score;
    badge.className = 'score-badge ' + (
      result.score >= 75 ? 'score-strong' : result.score >= 60 ? 'score-moderate' :
      result.score >= 40 ? 'score-neutral' : 'score-weak');
  }

  _renderBreakdown(result) {
    const b = result.breakdown;
    const items = [
      { label: 'Estrutura 4H', score: b.structure4h?.rawScore || 0, max: 15 },
      { label: 'Momentum 4H', score: b.momentum?.rawScore || 0, max: 15 },
      { label: 'Volume 4H', score: b.volume?.rawScore || 0, max: 10 },
      { label: 'Estrutura 1D', score: b.structure1d?.rawScore || 0, max: 15 },
      { label: 'Sentimento', score: b.sentiment?.rawScore || 0, max: 25 },
    ];

    let html = '<h3><span class="material-symbols-outlined" style="font-size:16px">analytics</span> Breakdown</h3>';
    for (const item of items) {
      const pct = (item.score / item.max) * 100;
      const color = pct >= 60 ? 'var(--md-success)' : pct >= 40 ? 'var(--md-warning)' : 'var(--md-error)';
      html += `<div class="breakdown-item">
        <span class="label">${item.label}</span>
        <div class="breakdown-mini-bar"><div style="width:${pct}%;height:100%;background:${color};border-radius:2px"></div></div>
        <span class="value">${item.score}/${item.max}</span></div>`;
    }
    if (b.confluenceBonus > 0) {
      html += `<div class="breakdown-item"><span class="label" style="color:var(--md-success)">Confluência</span><span></span><span class="value" style="color:var(--md-success)">+${b.confluenceBonus} pts</span></div>`;
    }
    document.getElementById('detail-breakdown').innerHTML = html;
  }

  _renderLevels(result) {
    const tpPct = ((result.takeProfit1 - result.entry) / result.entry * 100);
    const slPct = ((result.stopLoss - result.entry) / result.entry * 100);
    const fmt = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById('detail-levels').innerHTML = `
      <h3><span class="material-symbols-outlined" style="font-size:16px">target</span> Níveis</h3>
      <div class="level-row"><span class="label">Entrada</span><span class="value" style="color:var(--md-primary)">${fmt(result.entry)}</span></div>
      <div class="level-row"><span class="label">Stop Loss</span><span class="value" style="color:var(--md-error)">${fmt(result.stopLoss)} (${slPct.toFixed(2)}%)</span></div>
      <div class="level-row"><span class="label">Alvo 1</span><span class="value" style="color:var(--md-success)">${fmt(result.takeProfit1)} (+${tpPct.toFixed(2)}%)</span></div>
      <div class="level-row"><span class="label">Alvo 2</span><span class="value" style="color:var(--md-success)">${fmt(result.takeProfit2)}</span></div>
      <div class="level-row"><span class="label">R:R</span><span class="value" style="color:${result.rr>=1.5?'var(--md-success)':'var(--md-warning)'}">1:${result.rr}</span></div>`;
  }

  _renderIndicators(result) {
    const b = result.breakdown;
    document.getElementById('detail-indicators').innerHTML = `
      <h3><span class="material-symbols-outlined" style="font-size:16px">bar_chart</span> Indicadores</h3>
      <div class="indicators-row">
        <div class="indicator-item"><div class="indicator-label">ATR(14)</div><div class="indicator-value">$${result.atr?.toFixed(2)||'--'}</div></div>
        <div class="indicator-item"><div class="indicator-label">EMA 20</div><div class="indicator-value">$${result.ema20?.toFixed(2)||'--'}</div></div>
        <div class="indicator-item"><div class="indicator-label">EMA 50</div><div class="indicator-value">$${result.ema50?.toFixed(2)||'--'}</div></div>
        <div class="indicator-item"><div class="indicator-label">Suporte</div><div class="indicator-value positive">$${result.nearestSupport?.toFixed(2)||'--'}</div></div>
        <div class="indicator-item"><div class="indicator-label">Resistência</div><div class="indicator-value negative">$${result.nearestResistance?.toFixed(2)||'--'}</div></div>
        <div class="indicator-item"><div class="indicator-label">Tendência 4H</div><div class="indicator-value">${b.structure4h?.structure?.trend||'--'}</div></div>
        <div class="indicator-item"><div class="indicator-label">Tendência 1D</div><div class="indicator-value">${b.structure1d?.structure?.trend||'--'}</div></div>
        <div class="indicator-item" style="grid-column:1/-1"><div class="indicator-label">Sentimento Futures</div><div class="indicator-value" style="font-size:12px;font-weight:400">${b.sentiment?.description||'--'}</div></div>
      </div>`;
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    chartManager.destroy();
  }
}

const detailView = new DetailView();
