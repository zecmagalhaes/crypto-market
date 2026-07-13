/**
 * History View — Histórico de análises salvas
 */

class HistoryView {
  constructor() {
    this.container = document.getElementById('history-list');
    this.filter = document.getElementById('history-filter');
  }

  async show() {
    this.container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim)">Carregando...</div>';

    // Populate filter
    const watchlist = await window.api.getWatchlist();
    this.filter.innerHTML = '<option value="">Todos os pares</option>';
    watchlist.forEach(w => {
      this.filter.innerHTML += `<option value="${w.symbol}">${w.symbol.replace('USDT', '/USDT')}</option>`;
    });

    this.filter.onchange = () => this.load();

    await this.load();
  }

  async load() {
    const symbol = this.filter.value || null;
    const scans = await window.api.getScanHistory(symbol, 200);

    if (!scans || scans.length === 0) {
      this.container.innerHTML = `
        <div style="text-align:center;padding:60px;color:var(--text-dim)">
          <div style="font-size:40px;margin-bottom:12px">📋</div>
          <p>Nenhuma análise salva ainda.</p>
          <p class="dim">As análises são salvas automaticamente ao abrir o Dashboard.</p>
        </div>`;
      return;
    }

    this.container.innerHTML = scans.map(s => {
      const date = new Date(s.timestamp);
      const dateStr = date.toLocaleDateString('pt-BR') + ' ' +
        date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const scoreClass = s.score >= 75 ? 'score-strong' :
        s.score >= 60 ? 'score-moderate' :
        s.score >= 40 ? 'score-neutral' : 'score-weak';

      const signalClass = s.signal?.includes('COMPRA') ? 'signal-buy' :
        s.signal?.includes('VENDA') ? 'signal-sell' : 'signal-neutral';

      const price = s.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      return `
        <div class="history-item" data-symbol="${s.symbol}">
          <span class="history-date">${dateStr}</span>
          <span class="history-symbol">${s.symbol.replace('USDT', '/USDT')}</span>
          <span class="${scoreClass}" style="padding:2px 8px;border-radius:4px;text-align:center">${s.score}</span>
          <span>$${price}</span>
          <span class="history-signal ${signalClass}">${s.signal || '--'}</span>
        </div>`;
    }).join('');

    // Click to navigate to detail
    this.container.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        App.navigate('detail', item.dataset.symbol);
      });
    });
  }
}

const historyView = new HistoryView();
