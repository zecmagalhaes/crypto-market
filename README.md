# 🔍 Crypto Market Scanner

Scanner multi-fator para criptomoedas com **análise técnica automatizada**, **recomendações em linguagem clara** e **aplicativo desktop nativo** com gráficos em tempo real.

## ✨ Funcionalidades

### 📊 Scanner CLI
- **Score 0-100** combinando 5 fatores independentes:
  - Estrutura de mercado (4H + 1D): tendência, BOS, CHoCH, FVG, liquidity sweeps
  - Momentum (4H): RSI, MACD, divergências
  - Volume (4H): confirmação, clímax, exaustão
  - Estrutura 1D: confirmação de tendência de médio prazo
  - Sentimento (Futures): funding rate, open interest, long/short ratio, volatilidade
- **Níveis de trade** automáticos: entrada, stop loss, take profit, R:R
- **Recomendação em português claro**: 🟢 BOA OPORTUNIDADE / 🟡 MODERADA / ⚪ NEUTRO / 🔴 EVITAR
- **Cron jobs** prontos para análises automáticas matinais e vespertinas

### 🖥️ App Desktop (Electron)

| Funcionalidade | Descrição |
|---|---|
| 📊 **Dashboard** | Grid com top 20 pares, score colorido, preço em tempo real, sparkline |
| 📈 **Gráfico** | Candlestick interativo + EMA 20/50 + Bollinger Bands + Volume |
| ⏱️ **Timeframes** | 15m / 1H / 4H / 1D / 1S |
| 🎯 **Análise** | Breakdown completo por fator com níveis de trade no gráfico |
| 📋 **Histórico** | Salvo automaticamente em SQLite, filtrável por par, exportável |
| ⚙️ **Configurações** | Watchlist editável, threshold de alerta, intervalo de scan |
| 🖥️ **System Tray** | Minimiza para bandeja, status de conexão em tempo real |
| 🔔 **Alertas** | Notificações nativas quando score atinge threshold |
| 🌙 **Tema escuro** | Interface otimizada para longas sessões de análise |

## 📦 Instalação

### Pré-requisitos
- **Node.js 18+**
- **npm 9+**
- **Linux** (Ubuntu 22.04+, Fedora 38+, etc.) para o app desktop
- O scanner CLI funciona em qualquer sistema com Node.js

### Scanner CLI (todas as plataformas)

```bash
git clone git@github.com:zecmagalhaes/crypto-market.git
cd crypto-market
npm install

# Análise de um par
node index.js -s BTCUSDT

# Saída simplificada (ideal para scripts/Telegram)
node run-scan.js BTCUSDT
node run-scan.js SOLUSDT
```

### App Desktop (apenas Linux)

```bash
cd desktop
npm install
npm start
```

#### Gerar executável

```bash
npm run build          # AppImage + .deb
npm run build:dir      # Diretório descompactado
```

Saída em `desktop/dist/`.

## 🚀 Uso

### Terminal

```bash
# Análise completa com breakdown visual
node index.js -s BTCUSDT

# Análise simplificada
node index.js -s ETHUSDT -q

# Criar cron job para análise automática (ex: 7h e 20h BRT)
# Adicione ao crontab:
# 0 10 * * * cd /caminho/crypto-market && node run-scan.js BTCUSDT
# 0 23 * * * cd /caminho/crypto-market && node run-scan.js SOLUSDT
```

### App Desktop

1. Abra o aplicativo → Dashboard carrega automaticamente com os 20 pares padrão
2. Clique em qualquer par → gráfico completo + análise detalhada
3. Aba **Histórico** → todas as análises salvas
4. Aba **Configurações** → editar watchlist, thresholds, intervalo de scan

## 📊 Como interpretar o Score

| Score | Sinal | Ação recomendada |
|---|---|---|
| 🟢 **75-100** | COMPRA FORTE | Vários fatores alinhados, boa oportunidade |
| 🟡 **60-74** | COMPRA MODERADA | Oportunidade existe mas há riscos |
| ⚪ **40-59** | NEUTRO | Mercado indefinido, melhor aguardar |
| 🔴 **0-39** | VENDA / EVITAR | Estrutura fraca, risco elevado |

A recomendação sempre inclui o **motivo concreto** (ex: "tendência 1D baixista e R:R desfavorável"), não apenas o número.

## 🧠 Fatores da Análise

### Estrutura de Mercado (30 pts)
- Detecção de tendência multi-timeframe (4H + 1D)
- Break of Structure (BOS) e Change of Character (CHoCH)
- Fair Value Gaps (FVG) e Liquidity Sweeps
- Suporte e resistência por swing points

### Momentum (15 pts)
- RSI(14) com zonas de sobrecompra/sobrevenda
- MACD(12,26,9) com cruzamentos e divergências
- Força e consistência da tendência

### Volume (10 pts)
- Volume vs média móvel (confirmação/exaustão)
- Clímax de volume (possível reversão)
- Delta de volume comprador vs vendedor

### Sentimento — Futures (25 pts)
- Funding Rate (positivo/negativo, magnitude)
- Open Interest (crescimento/declínio, sinal de alavancagem)
- Long/Short Ratio (top traders + global)
- Volatilidade 24h e range

### Bônus de Confluência
- +5 pts quando estrutura 4H e 1D estão alinhadas (ambas bullish ou ambas bearish)

## 🗂️ Estrutura do Projeto

```
crypto-market/
├── index.js              # Scanner CLI com interface colorida
├── run-scan.js           # Runner otimizado para cron/Telegram
├── package.json
├── src/
│   ├── binance.js        # API client (spot + futures, zero deps)
│   ├── indicators.js     # RSI, MACD, EMA, BB, VWAP, ATR, swing points
│   ├── structure.js      # BOS, CHoCH, FVG, liquidity sweeps, tendência
│   ├── sentiment.js      # Funding rate, open interest, long/short ratio
│   └── scorer.js         # Scoring engine 0-100 com breakdown por fator
└── desktop/              # App Electron
    ├── main.js           # Electron main (DB, IPC, scanner)
    ├── preload.js        # Context bridge seguro
    ├── package.json
    └── renderer/
        ├── index.html
        ├── styles.css    # Dark theme profissional
        ├── app.js        # Controller de navegação
        ├── charts.js     # Lightweight Charts (TradingView)
        ├── websocket.js  # Binance WebSocket tempo real
        ├── scanner.js    # Wrapper IPC
        └── components/
            ├── dashboard.js  # Grid de pares
            ├── detail.js     # Gráfico + análise
            ├── history.js    # Histórico
            └── settings.js   # Configurações
```

## 🔌 Dependências

### Core (zero dependências externas)
O scanner CLI usa apenas `fetch` nativo do Node.js para consultar a API pública da Binance. **Nenhuma biblioteca externa necessária.**

### Desktop
- **Electron 30** — runtime desktop
- **Lightweight Charts 4** — gráficos candlestick (biblioteca do TradingView)
- **better-sqlite3** — banco local para histórico
- **ws** — WebSocket cliente

## ⚠️ Aviso

**Este software é uma ferramenta de análise técnica automatizada. NÃO é recomendação financeira.**

- Scores e sinais são baseados em indicadores técnicos e dados públicos da Binance
- Sempre faça sua própria análise antes de operar
- Trading de criptomoedas envolve risco elevado de perda
- Performance passada não garante resultados futuros

## 📝 Licença

MIT

---

Feito por [@zecmagalhaes](https://github.com/zecmagalhaes)
