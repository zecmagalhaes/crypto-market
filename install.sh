#!/usr/bin/env bash
set -e

# ═══════════════════════════════════════════════════════════
# Crypto Scanner — Instalador Desktop Linux
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
echo "  Projeto: $PROJECT_DIR"
echo ""

# ── 0. Verificar dependências do sistema ──────────────

echo "  [0/5] Verificando dependências do sistema..."

MISSING=""

check_pkg() {
  dpkg -s "$1" >/dev/null 2>&1 || MISSING="$MISSING $1"
}

check_pkg libgtk-3-0
check_pkg libnss3
check_pkg libx11-xcb1
check_pkg libxcomposite1
check_pkg libxdamage1
check_pkg libxrandr2
check_pkg libgbm1
check_pkg libasound2
check_pkg libpango-1.0-0

if [ -n "$MISSING" ]; then
  echo ""
  echo "  ⚠️  Pacotes necessários para o Electron não encontrados:"
  echo "     $MISSING"
  echo ""
  echo "  Instale com:"
  echo "     sudo apt install$MISSING"
  echo ""
  read -p "  Deseja instalar agora? (s/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Ss]$ ]]; then
    sudo apt install -y $MISSING
  else
    echo "  Continuando sem instalar. O app pode não abrir."
  fi
else
  echo "         ✅ Todas as dependências do sistema OK"
fi

# ── 1. Instalar dependências npm ──────────────────────

echo "  [1/5] Instalando dependências do scanner..."
cd "$PROJECT_DIR"
npm install --silent 2>/dev/null || npm install

echo "  [2/5] Instalando dependências do desktop..."
cd "$DESKTOP_DIR"
npm install --silent 2>/dev/null || npm install

# Rebuild better-sqlite3 contra a versão do Electron
echo "         Rebuildando módulos nativos para Electron..."
npx @electron/rebuild -m . 2>/dev/null || {
  echo "         ⚠️  @electron/rebuild falhou. Tentando manualmente..."
  cd "$DESKTOP_DIR/node_modules/better-sqlite3"
  npx node-gyp rebuild --target=30.0.0 --arch=x64 --dist-url=https://electronjs.org/headers 2>/dev/null || true
  cd "$DESKTOP_DIR"
}

# Copiar Lightweight Charts pro renderer
if [ ! -f "$DESKTOP_DIR/renderer/lib/lightweight-charts.standalone.production.js" ]; then
  echo "         Copiando Lightweight Charts..."
  mkdir -p "$DESKTOP_DIR/renderer/lib"
  cp "$DESKTOP_DIR/node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js" \
     "$DESKTOP_DIR/renderer/lib/" 2>/dev/null || {
    echo "         ⚠️  Erro ao copiar Lightweight Charts. Baixando..."
    curl -sL "https://unpkg.com/lightweight-charts@4/dist/lightweight-charts.standalone.production.js" \
      -o "$DESKTOP_DIR/renderer/lib/lightweight-charts.standalone.production.js"
  }
fi

# ── 2. Criar diretórios ────────────────────────────────

mkdir -p "$BIN_DIR" "$APPS_DIR" "$ICONS_DIR"

# ── 3. Criar launcher (comando global) ─────────────────
# ⚠️ Caminho ABSOLUTO do projeto é fixado aqui

cat > "$LAUNCHER" << LAUNCHEREOF
#!/usr/bin/env bash
cd "$DESKTOP_DIR"
exec npx electron . --no-sandbox "\$@"
LAUNCHEREOF

chmod +x "$LAUNCHER"

echo "  [3/5] Launcher criado: $LAUNCHER"

# ── 4. Instalar ícone e atalho .desktop ────────────────

if [ -f "$DESKTOP_DIR/assets/icon.png" ]; then
  cp "$DESKTOP_DIR/assets/icon.png" "$ICONS_DIR/crypto-scanner.png"
  echo "  [4/5] Ícone instalado"
fi

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

echo "  [5/5] Atalho criado no menu de aplicativos"

# Atualizar cache
update-desktop-database "$APPS_DIR" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

# ── Verificar PATH ─────────────────────────────────────

if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  echo ""
  echo "  ⚠️  $HOME/.local/bin não está no seu PATH."
  echo "     Adicione ao seu ~/.bashrc:"
  echo ""
  echo '     export PATH="$HOME/.local/bin:$PATH"'
  echo ""
fi

# ── Done ───────────────────────────────────────────────

echo ""
echo "  ✅ Instalação concluída!"
echo ""
echo "  🚀 Abrir o Crypto Scanner:"
echo "     - Menu de aplicativos → 'Crypto Scanner'"
echo "     - Terminal → crypto-scanner"
echo ""
echo "  🔍 Scanner CLI (terminal):"
echo "     node $PROJECT_DIR/index.js -s BTCUSDT"
echo ""
echo "  🩺 Diagnóstico (se não abrir):"
echo "     $PROJECT_DIR/diagnose.sh"
echo ""
echo "  🔄 Atualizar:"
echo "     cd $PROJECT_DIR && git pull && ./install.sh"
echo ""
