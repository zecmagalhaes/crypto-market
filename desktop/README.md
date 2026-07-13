# Crypto Scanner Desktop

App desktop nativo Linux com análise multi-fator, gráficos em tempo real e histórico.

## Stack

- **Electron 30** — app desktop cross-platform
- **Lightweight Charts** — candlestick charts (biblioteca do TradingView)
- **Binance WebSocket** — preços em tempo real
- **better-sqlite3** — histórico local
- **Scanner engine** — reutiliza o scanner CLI existente

## Requisitos

- **Node.js 18+**
- **npm 9+**
- **Linux** (Ubuntu 22.04+, Fedora 38+, etc.)

## Instalação

```bash
cd desktop
npm install        # instala dependências + Electron + copia chart lib
npm start          # inicia o app
```

## Funcionalidades

### 📊 Dashboard
- Grid com todos os pares da watchlist
- Score de 0-100 com barra colorida
- Preço em tempo real via WebSocket Binance
- Mini sparkline de 50 velas (1H)
- Auto-refresh a cada 15 min (configurável)

### 📈 Análise Detalhada
- Candlestick chart interativo (15m / 1H / 4H / 1D / 1S)
- Indicadores: EMA 20/50, Bollinger Bands, Volume
- Níveis de trade: Entrada, Stop Loss, TP1, TP2
- Suporte e resistência no gráfico
- Breakdown completo do score por fator

### 📋 Histórico
- Todas as análises salvas automaticamente
- Filtro por par
- Ordenado por data (mais recente primeiro)
- Clique para ver detalhes

### ⚙️ Configurações
- Watchlist editável (add/remove pares, máx 20)
- Threshold de alerta (score mínimo)
- Intervalo de scan automático

## Build (gerar executável)

```bash
npm run build          # gera AppImage + .deb
npm run build:dir      # gera diretório (sem empacotar)
```

Saída em `dist/`.

## Estrutura

```
desktop/
├── main.js              # Electron main process (DB, IPC, scanner)
├── preload.js           # Context bridge (API segura pro renderer)
├── renderer/
│   ├── index.html       # Interface
│   ├── styles.css       # Dark theme CSS
│   ├── app.js           # Controller (navegação)
│   ├── charts.js        # Lightweight Charts manager
│   ├── scanner.js       # IPC wrapper pro scanner
│   ├── websocket.js     # Binance WebSocket streaming
│   └── components/
│       ├── dashboard.js  # Grid de pares
│       ├── detail.js     # Gráfico + análise
│       ├── history.js    # Histórico
│       └── settings.js   # Configurações
└── assets/              # Ícones
```
