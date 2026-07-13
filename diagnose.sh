#!/usr/bin/env bash
#
# 🩺 Crypto Scanner — Diagnóstico
# Rode este script se o app não abrir
#

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$PROJECT_DIR/desktop"

echo ""
echo "🩺 Crypto Scanner — Diagnóstico"
echo "════════════════════════════════"
echo ""

PASS=0
FAIL=0

check() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  ✅ $desc"
    ((PASS++))
  else
    echo "  ❌ $desc"
    echo "     ↳ $*"
    ((FAIL++))
  fi
}

info() {
  echo "  ℹ️  $1"
}

# ── Sistema ───────────────────────────────────────────

echo "📋 Sistema"
info "Ubuntu: $(lsb_release -ds 2>/dev/null || echo 'desconhecido')"
info "Kernel: $(uname -r)"
info "Display: ${DISPLAY:-não definido (sem GUI?)}"
echo ""

# ── Node.js ───────────────────────────────────────────

echo "📋 Node.js"
info "Node: $(node -v 2>/dev/null || echo 'NÃO ENCONTRADO')"
info "npm:  $(npm -v 2>/dev/null || echo 'NÃO ENCONTRADO')"
check "node --version funciona" node --version
check "npm --version funciona" npm --version
echo ""

# ── Dependências do Electron ──────────────────────────

echo "📋 Dependências do Electron (bibliotecas do sistema)"
for lib in libgtk-3-0 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpango-1.0-0; do
  t64="${lib}t64"
  check "$lib" bash -c "dpkg -s '$lib' >/dev/null 2>&1 || dpkg -s '$t64' >/dev/null 2>&1"
done
echo ""

# ── Projeto ───────────────────────────────────────────

echo "📋 Projeto"
check "diretório do projeto: $PROJECT_DIR" test -d "$PROJECT_DIR"
check "desktop/: $DESKTOP_DIR" test -d "$DESKTOP_DIR"
check "node_modules/ (scanner)" test -d "$PROJECT_DIR/node_modules"
check "desktop/node_modules/ (Electron)" test -d "$DESKTOP_DIR/node_modules"
check "electron instalado" test -f "$DESKTOP_DIR/node_modules/.bin/electron"
check "lightweight-charts (lib)" test -f "$DESKTOP_DIR/renderer/lib/lightweight-charts.standalone.production.js"
check "chart lib tem conteúdo" test -s "$DESKTOP_DIR/renderer/lib/lightweight-charts.standalone.production.js"
echo ""

# ── Launcher ──────────────────────────────────────────

echo "📋 Launcher"
check "~/.local/bin/crypto-scanner" test -f "$HOME/.local/bin/crypto-scanner"
check "launcher executável" test -x "$HOME/.local/bin/crypto-scanner"
check "launcher aponta para lugar certo" grep -q "$DESKTOP_DIR" "$HOME/.local/bin/crypto-scanner" 2>/dev/null
check "atalho .desktop" test -f "$HOME/.local/share/applications/crypto-scanner.desktop"
check "ícone" test -f "$HOME/.local/share/icons/hicolor/256x256/apps/crypto-scanner.png"
check "~/.local/bin no PATH" bash -c '[[ ":$PATH:" == *":$HOME/.local/bin:"* ]]'
echo ""

# ── Teste do scanner CLI ──────────────────────────────

echo "📋 Scanner CLI"
check "index.js existe" test -f "$PROJECT_DIR/index.js"
echo ""

# ── Tentar abrir com log ──────────────────────────────

echo "📋 Teste de execução"
echo "  Tentando abrir o Electron com log de erro..."
echo ""

cd "$DESKTOP_DIR"
if timeout 8 npx electron . --no-sandbox 2>&1; then
  echo ""
  echo "  ✅ App abriu com sucesso!"
else
  exit_code=$?
  if [ $exit_code -eq 124 ]; then
    echo ""
    echo "  ✅ App abriu (timeout de 8s — normal, o app está rodando)"
  else
    echo ""
    echo "  ❌ App falhou ao abrir (exit code: $exit_code)"
    echo ""
    echo "  Erros comuns:"
    echo "  - 'cannot open display' → sem servidor X11 (não é desktop?)"
    echo "  - 'error while loading shared libraries' → dependência faltando"
    echo "  - 'GPU process isn't usable' → passar --disable-gpu"
    echo ""
    echo "  Tente manualmente:"
    echo "    cd $DESKTOP_DIR && npx electron . --no-sandbox --disable-gpu"
  fi
fi

echo ""
echo "════════════════════════════════"
echo "  Resultado: $PASS ✅ / $FAIL ❌"
echo "════════════════════════════════"
echo ""
