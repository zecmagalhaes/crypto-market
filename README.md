# 🔍 Crypto Market Scanner

Scanner multi-fator para criptomoedas com **análise técnica automatizada**, **recomendações em linguagem clara** e **aplicativo desktop nativo** com gráficos em tempo real.

---

## ⚡ Instalação Rápida

```bash
git clone https://github.com/zecmagalhaes/crypto-market.git
cd crypto-market

# Instalar TUDO (scanner CLI + app desktop + atalho no menu)
chmod +x install.sh
./install.sh
```

Depois de instalar, abra o aplicativo pelo **menu de aplicativos do sistema** (buscar "Crypto Scanner") ou digite `crypto-scanner` no terminal.

---

## 🖥️ Como Usar o App Desktop

Depois de rodar `./install.sh`, o Crypto Scanner aparece como um **aplicativo normal** no seu sistema:

| Ação | Como fazer |
|---|---|
| **Abrir pelo menu** | Pressione `Super` (tecla Windows) → digite "Crypto Scanner" → Enter |
| **Abrir pelo terminal** | Digite `crypto-scanner` e pressione Enter |
| **Fixar na barra** | Clique com botão direito no ícone → "Add to Favorites" / "Fixar" |
| **Atalho na área de trabalho** | Copie o arquivo de `~/.local/share/applications/crypto-scanner.desktop` para `~/Desktop/` |

### Navegação no App

```
┌──────────────────────────────────────────────────┐
│  📊 Dashboard  │  Grid com todos os pares        │
│  📈 Detalhe    │  Gráfico + análise do par       │
│  📋 Histórico  │  Análises anteriores            │
│  ⚙️  Ajustes   │  Watchlist, alertas, intervalo  │
└──────────────────────────────────────────────────┘
```

### Dashboard
- Abre automaticamente com os **20 pares principais**
- Cada card mostra: preço em tempo real, score, sinal e sparkline
- **Clique em qualquer par** para ver o gráfico detalhado
- Atualização automática a cada 15 minutos (configurável)

### Gráfico Detalhado
- Candlestick interativo com zoom, scroll e crosshair
- Indicadores: EMA 20 (azul), EMA 50 (roxo), Bollinger Bands (laranja tracejado)
- Volume no painel inferior
- Linhas tracejadas: Entry (amarelo), Stop (vermelho), TP1/TP2 (verde)
- Seletor de timeframe: 15m / 1H / 4H / 1D / 1S

---

## ⌨️ Como Usar o Scanner CLI (Terminal)

Se preferir só o terminal, sem interface gráfica:

```bash
cd crypto-market
npm install

# Análise completa com breakdown colorido
node index.js -s BTCUSDT

# Análise simplificada (ideal para scripts)
node index.js -s SOLUSDT -q

# Saída otimizada para Telegram (com recomendação em português)
node run-scan.js BTCUSDT
node run-scan.js ETHUSDT
```

### Exemplo de saída do `run-scan.js`:

```
🔴 BTCUSDT — Score: 38/100

🧭 Recomendação
🔴 EVITAR BTC agora
🚫 Motivo: médio prazo (1D) em tendência de baixa e risco maior que o retorno
   (1:0.9, TP menor que o stop).
⚠️ Risco elevado de perda. Não é momento de entrada.

🎯 Níveis Técnicos
Entrada: $63,064.14
Stop: $61,236.29 (-2.90%)
Alvo 1: $64,692.83 (+2.58%)
R:R: 1:0.9 | Volatilidade: $616.53

📊 Detalhes Técnicos
Tendência 4H: bullish
Tendência 1D: bearish
Funding neutro | Top traders: 61% long | Vol 24h: 893M USDT
```

---

## 📊 Como Interpretar o Score

| Score | Cor | Ação | Significado |
|---|---|---|---|
| 🟢 **75-100** | Verde | **BOA OPORTUNIDADE** | Vários fatores técnicos alinhados, R:R favorável, estrutura clara |
| 🟡 **60-74** | Amarelo | **OPORTUNIDADE MODERADA** | Alguns fatores positivos, mas existe risco — cuidado |
| ⚪ **40-59** | Cinza | **NEUTRO — AGUARDAR** | Mercado sem direção clara, melhor esperar próximo ciclo |
| 🔴 **0-39** | Vermelho | **EVITAR** | Estrutura fraca, tendência contra, risco elevado |

A recomendação sempre explica **o motivo concreto** em português claro — não apenas o número.

---

## 🧠 Como Funciona a Análise

O scanner combina **5 fatores independentes** em um score de 0 a 100:

### 1. Estrutura de Mercado (30 pontos)
Analisa o comportamento do preço em dois timeframes:
- **4 horas**: tendência de curto prazo, rompimentos (BOS), mudanças de caráter (CHoCH), gaps de liquidez (FVG)
- **1 dia**: confirmação de tendência de médio prazo
- **Bônus de confluência (+5 pts)**: quando 4H e 1D estão alinhados (ambos subindo ou ambos caindo)

### 2. Momentum (15 pontos)
Força e direção do movimento atual:
- **RSI(14)**: identifica zonas de sobrecompra (>70) e sobrevenda (<30)
- **MACD**: cruzamentos de média e detecção de divergências
- **Força da tendência**: consistência e aceleração do movimento

### 3. Volume (10 pontos)
Confirma se o movimento tem força por trás:
- Volume atual vs média (confirmação ou exaustão)
- Clímax de volume (possível reversão)
- Volume crescente = tendência saudável

### 4. Sentimento Futures (25 pontos)
Dados do mercado de derivativos (Binance Futures):
- **Funding Rate**: custo de manter posições (positivo = mais comprados)
- **Open Interest**: contratos abertos (crescimento = mais gente entrando)
- **Long/Short Ratio**: proporção de comprados vs vendidos (top traders + global)
- **Volatilidade 24h**: amplitude de movimento recente

### 5. Níveis de Trade
Calculados automaticamente a partir dos dados:
- **Entrada**: preço atual
- **Stop Loss**: baseado no ATR(14) — volatilidade média
- **Take Profit 1 e 2**: projeção baseada em estrutura (swing points)
- **R:R (Risco:Retorno)**: quanto você ganha pra cada 1 que arrisca

---

## 📁 Estrutura do Projeto

```
crypto-market/
├── install.sh              # ⭐ Instalador completo (roda 1x)
├── index.js                # Scanner CLI com interface colorida
├── run-scan.js             # Runner com recomendação em português (Telegram/cron)
├── package.json
├── src/
│   ├── binance.js          # API Binance (spot + futures) — zero dependências
│   ├── indicators.js       # RSI, MACD, EMA, Bollinger, VWAP, ATR, swing points
│   ├── structure.js        # BOS, CHoCH, FVG, liquidity sweeps, tendência
│   ├── sentiment.js        # Funding rate, open interest, long/short ratio
│   └── scorer.js           # Engine de scoring 0-100 com breakdown por fator
└── desktop/                # App Electron
    ├── install.sh → ../install.sh   # Atalho para o instalador
    ├── main.js             # Electron main (DB SQLite, IPC, chama o scanner)
    ├── preload.js          # Bridge segura renderer ↔ main process
    ├── package.json
    ├── crypto-scanner.desktop  # Atalho .desktop para menu de apps
    └── renderer/
        ├── index.html      # 4 páginas: Dashboard, Detail, History, Settings
        ├── styles.css      # Tema escuro profissional
        ├── app.js          # Controller de navegação
        ├── charts.js       # Lightweight Charts (TradingView library)
        ├── websocket.js    # Binance WebSocket — preço em tempo real
        ├── scanner.js      # Wrapper IPC para o motor de análise
        └── components/
            ├── dashboard.js    # Grid de pares com score e sparkline
            ├── detail.js       # Gráfico candlestick + análise completa
            ├── history.js      # Histórico de análises salvas
            └── settings.js     # Watchlist, alertas, intervalo de scan
```

---

## ⏰ Automação com Cron

Para receber análises automáticas todo dia:

```bash
# Editar crontab
crontab -e

# Adicionar (ex: 7h e 20h horário de Brasília = 10h e 23h UTC)
0 10 * * * cd /caminho/crypto-market && node run-scan.js BTCUSDT
0 10 * * * cd /caminho/crypto-market && node run-scan.js SOLUSDT
0 23 * * * cd /caminho/crypto-market && node run-scan.js BTCUSDT
0 23 * * * cd /caminho/crypto-market && node run-scan.js SOLUSDT
```

A saída do `run-scan.js` é formatada em HTML para Telegram — ideal para bots e notificações.

---

## 🔧 Build (Gerar Instalador)

```bash
cd desktop
npm run build          # Gera AppImage + .deb em dist/
npm run build:dir      # Gera diretório executável (sem empacotar)
```

---

## ⚠️ Aviso Legal

**Este software é uma ferramenta de análise técnica automatizada. NÃO é recomendação financeira.**

- Scores e sinais são calculados a partir de indicadores técnicos e dados públicos da Binance
- Sempre faça sua própria análise antes de tomar decisões de investimento
- Trading de criptomoedas envolve **risco elevado de perda**
- Performance passada não garante resultados futuros

---

## 📝 Licença

MIT © [Ezequiel Magalhães](https://github.com/zecmagalhaes)
