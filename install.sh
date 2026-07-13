#!/usr/bin/env bash
set -e

# ═══════════════════════════════════════════════════════════
# Crypto Scanner — Instalador Desktop Linux
# ═══════════════════════════════════════════════════════════
#
# Este script:
#   1. Instala as dependências do projeto
#   2. Cria um atalho no menu de aplicativos (.desktop)
#   3. Cria um comando global `crypto-scanner`
#
# Após a instalação, você pode:
#   - Abrir pelo menu de aplicativos (buscar "Crypto Scanner")
#   - Rodar `crypto-scanner` no terminal
#   - Fixar na barra de tarefas / dock
#
# Uso:
#   chmod +x install.sh
#   ./install.sh
# ═══════════════════════════════════════════════════════════

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$PROJECT_DIR/desktop"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"
ICONS_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
LAUNCHER="$BIN_DIR/crypto-scanner"

echo ""
echo "  📦 Crypto Scanner — Instalador Desktop"
echo "  ───────────────────────────────────────"
echo ""

# ── 1. Instalar dependências ──────────────────────────

echo "  [1/4] Instalando dependências do scanner..."
cd "$PROJECT_DIR"
npm install --silent 2>/dev/null || npm install

echo "  [2/4] Instalando dependências do desktop..."
cd "$DESKTOP_DIR"
npm install --silent 2>/dev/null || npm install

if [ ! -f "$DESKTOP_DIR/renderer/lib/lightweight-charts.standalone.production.js" ]; then
  echo "         Copiando Lightweight Charts..."
  mkdir -p "$DESKTOP_DIR/renderer/lib"
  cp "$DESKTOP_DIR/node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js" \
     "$DESKTOP_DIR/renderer/lib/" 2>/dev/null || true
fi

# ── 2. Criar diretórios ────────────────────────────────

mkdir -p "$BIN_DIR" "$APPS_DIR" "$ICONS_DIR"

# ── 3. Criar launcher (comando global) ─────────────────

cat > "$LAUNCHER" << 'LAUNCHEREOF'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# Resolve o caminho real do projeto a partir do link simbólico
PROJECT="$(dirname "$(dirname "$SCRIPT_DIR")")/crypto-market/desktop"
cd "$PROJECT"
npx electron . --no-sandbox
LAUNCHEREOF

chmod +x "$LAUNCHER"

# ── 4. Instalar ícone e atalho .desktop ────────────────

if [ -f "$DESKTOP_DIR/assets/icon.png" ]; then
  cp "$DESKTOP_DIR/assets/icon.png" "$ICONS_DIR/crypto-scanner.png"
  echo "         Ícone instalado em $ICONS_DIR"
fi

# Gera o arquivo .desktop com caminhos absolutos
cat > "$APPS_DIR/crypto-scanner.desktop" << DESKTOPEOF
[Desktop Entry]
Type=Application
Name=Crypto Scanner
GenericName=Crypto Market Scanner
Comment=Scanner multi-fator para criptomoedas com análise técnica e gráficos em tempo real
Icon=crypto-scanner
Exec=$LAUNCHER
Terminal=false
Categories=Finance;Office;
StartupWMClass=Crypto Scanner
Keywords=crypto;bitcoin;trading;chart;analysis;
DESKTOPEOF

# Atualizar cache de ícones e aplicativos
update-desktop-database "$APPS_DIR" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

# ── Done ───────────────────────────────────────────────

echo ""
echo "  ✅ Instalação concluída!"
echo ""
echo "  🚀 Para abrir o Crypto Scanner:"
echo "     - Menu de aplicativos → buscar 'Crypto Scanner'"
echo "     - Terminal → digite: crypto-scanner"
echo ""
echo "  📊 Scanner CLI (terminal):"
echo "     cd $PROJECT_DIR && node index.js -s BTCUSDT"
echo ""
echo "  🔄 Para atualizar:"
echo "     cd $PROJECT_DIR && git pull && ./install.sh"
echo ""
