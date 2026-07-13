/**
 * App Controller — Gerencia navegação e ciclo de vida
 */

const App = {
  currentPage: 'dashboard',

  async init() {
    // Navigation
    document.querySelectorAll('.nav-links li').forEach(link => {
      link.addEventListener('click', () => {
        this.navigate(link.dataset.page);
      });
    });

    // Connection status
    priceStream.onStatusChange = (status) => {
      const dot = document.getElementById('connection-status');
      const text = dot.nextElementSibling;
      dot.className = 'status-dot ' + status;
      text.textContent = status === 'connected' ? 'Conectado' :
        status === 'connecting' ? 'Conectando...' : 'Desconectado';
    };

    // Start on dashboard
    await this.navigate('dashboard');
  },

  async navigate(page, param) {
    // Deactivate current
    if (this.currentPage === 'detail') detailView.destroy();
    if (this.currentPage === 'dashboard') dashboard.destroy();

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));

    // Activate new
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    const navLink = document.querySelector(`[data-page="${page}"]`);
    if (navLink) navLink.classList.add('active');

    this.currentPage = page;

    // Load page
    switch (page) {
      case 'dashboard':
        await dashboard.init();
        break;
      case 'detail':
        await detailView.show(param);
        break;
      case 'history':
        await historyView.show();
        break;
      case 'settings':
        await settingsView.show();
        break;
    }
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());

// Handle resize for charts
window.addEventListener('resize', () => {
  if (App.currentPage === 'detail') chartManager.resize();
});
