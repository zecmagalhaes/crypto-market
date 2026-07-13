/**
 * Settings View — Watchlist e configurações de alerta
 */

class SettingsView {
  constructor() {
    this.input = document.getElementById('input-add-pair');
    this.btnAdd = document.getElementById('btn-add-pair');
    this.list = document.getElementById('watchlist-items');
    this.alertThreshold = document.getElementById('setting-alert-threshold');
    this.scanInterval = document.getElementById('setting-scan-interval');
  }

  async show() {
    await this._renderWatchlist();
    await this._loadSettings();

    this.btnAdd.onclick = () => this._addPair();
    this.input.onkeydown = (e) => { if (e.key === 'Enter') this._addPair(); };

    this.alertThreshold.onchange = () => {
      window.api.setSetting('alertThreshold', this.alertThreshold.value);
    };

    this.scanInterval.onchange = () => {
      window.api.setSetting('scanInterval', this.scanInterval.value);
    };
  }

  async _renderWatchlist() {
    const watchlist = await window.api.getWatchlist();
    this.list.innerHTML = watchlist.map(w => `
      <li>
        <span>${w.symbol.replace('USDT', '/USDT')}</span>
        <button class="btn-remove" data-symbol="${w.symbol}">✕</button>
      </li>
    `).join('');

    this.list.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.removeFromWatchlist(btn.dataset.symbol);
        await this._renderWatchlist();
      });
    });
  }

  async _addPair() {
    const symbol = this.input.value.trim().toUpperCase();
    if (!symbol || !symbol.endsWith('USDT') || symbol.length < 6) {
      this.input.style.borderColor = 'var(--red)';
      setTimeout(() => this.input.style.borderColor = '', 1500);
      return;
    }

    const watchlist = await window.api.getWatchlist();
    if (watchlist.length >= 20) {
      alert('Máximo 20 pares na watchlist.');
      return;
    }

    await window.api.addToWatchlist(symbol);
    this.input.value = '';
    await this._renderWatchlist();
  }

  async _loadSettings() {
    const threshold = await window.api.getSetting('alertThreshold');
    if (threshold) this.alertThreshold.value = threshold;

    const interval = await window.api.getSetting('scanInterval');
    if (interval) this.scanInterval.value = interval;
  }
}

const settingsView = new SettingsView();
