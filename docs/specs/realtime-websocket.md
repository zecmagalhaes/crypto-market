# Spec: WebSocket em Tempo Real — Kline + Oportunidades

**Status:** APROVADO  
**Autor:** product-architect  
**Data:** 2026-07-13  
**Branch alvo:** `feat/realtime-websocket`

---

## Sumário

1. [Problema](#1-problema)
2. [Arquitetura de WebSocket](#2-arquitetura-de-websocket)
3. [Atualização em Tempo Real](#3-atualização-em-tempo-real)
4. [Detecção de Oportunidades](#4-detecção-de-oportunidades)
5. [Edge Cases](#5-edge-cases)
6. [Estruturas de Dados](#6-estruturas-de-dados)
7. [Plano de Implementação](#7-plano-de-implementação)

---

## 1. Problema

### Estado atual

| Componente | O que faz | O que falta |
|---|---|---|
| `websocket.js` | Conecta `miniTicker` (preço + var%) | Sem stream de kline — candle detail não tem OHLC real |
| `charts.js:_startRealtime()` | Usa preço do miniTicker pra simular vela | OHLC fake (open=price; high=price; low=price; close=price) |
| `dashboard.js` | Preço em tempo real nos cards | Sem destaque visual de oportunidades; scan só a cada 15 min |
| `main.js` | Handler `notify` via IPC | Nunca é chamado — sem notificações nativas |

### O que precisa ser construído

1. **Streams de kline** para candles reais (OHLC genuíno da Binance)
2. **Dashboard reativo** com preços atualizados sem travar a UI
3. **Detector de oportunidades em background** que dispara notificações e badges visuais

---

## 2. Arquitetura de WebSocket

### 2.1 Streams da Binance — o que usar

A Binance oferece WebSocket público em `wss://stream.binance.com:9443`. As streams relevantes:

| Stream | Formato da URL | Dados | Uso no app |
|---|---|---|---|
| `miniTicker` | `symbol@miniTicker` | `{e, E, s, c, o, h, l, v, q}` — preço atual, open, high, low, volume 24h, variação % | **Dashboard**: preço instantâneo + variação 24h nos cards |
| `kline_1s` | `symbol@kline_1s` | `{e, E, s, k: {t, T, s, i, o, h, l, c, v, ...}}` — vela de 1 segundo | **Gráfico detalhado**: atualização ultra-fina da última vela em timeframes curtos (15m, 1h) |
| `kline_1m` | `symbol@kline_1m` | Idem, vela de 1 minuto | **Gráfico detalhado**: atualização da última vela em timeframes longos (4h, 1d, 1w) |
| `!miniTicker@arr` | `!miniTicker@arr` | Array de todos os miniTickers (1000 ms) | **Dashboard alternativo**: quando watchlist > 20 pares, usar stream global em vez de 20 streams individuais |

### 2.2 Qual stream para cada parte do app

```
┌────────────────────────────────────────────────────────────┐
│                      App Desktop                            │
│                                                             │
│  ┌──────────────┐              ┌──────────────────────────┐ │
│  │  Dashboard    │              │  Gráfico Detalhado       │ │
│  │  (20 cards)   │              │  (1 par por vez)         │ │
│  │               │              │                          │ │
│  │  miniTicker   │              │  miniTicker + kline_1s   │ │
│  │  (preço + %)  │              │  (preço + OHLC real)     │ │
│  └──────┬───────┘              └──────────┬───────────────┘ │
│         │                                  │                 │
│         │     WebSocket Manager            │                 │
│         └────────────┬─────────────────────┘                 │
│                      │                                       │
│              wss://stream.binance.com:9443                   │
│              (até 1024 streams por conexão)                  │
└─────────────────────────────────────────────────────────────┘
```

**Regra de seleção:**

- **Dashboard sempre ativo**: conecta `miniTicker` para todos os pares da watchlist assim que o app abre
- **Gráfico detalhado**: quando o usuário navega para detail, adiciona `kline_1s` (se timeframe ≤ 1h) ou `kline_1m` (se timeframe ≥ 4h) para aquele par específico
- **Ao voltar pro dashboard**: remove o stream de kline do par que estava em detail (mantém só miniTicker)

### 2.3 Gerenciamento de Conexão

**Limite da Binance:** 1024 streams por conexão WebSocket. Com 20 pares na watchlist, isso não é problema. Mas o código deve ser defensivo.

**Arquitetura proposta — `WebSocketManager` unificado:**

```js
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.activeStreams = new Map();     // streamName -> Set<callback>
    this.reconnectAttempts = 0;
    this.maxBackoff = 30000;            // 30s máximo entre tentativas
    this.pendingSymbols = [];           // symbols aguardando conexão
    this.status = 'disconnected';
    this.listeners = new Map();         // event -> Set<callback>
  }
}
```

**Ciclo de vida da conexão:**

```
  disconnected ──► connecting ──► connected ──► connected (re-subscribe)
       ▲                │              │
       │                │              │
       └──◄── backoff ──┘              │
       │                               │
       └──◄── max retries exhausted ───┘ (desiste, notifica UI)
```

### 2.4 Algoritmo de Reconexão com Backoff Exponencial

```
Tentativa 1:   1s (imediato)
Tentativa 2:   2s
Tentativa 3:   4s
Tentativa 4:   8s
Tentativa 5:  16s
Tentativa 6+: 30s (cap)
```

Após 10 tentativas consecutivas sem sucesso: status `failed`, notificar usuário na UI. Timer de retry sobe para 60s.

### 2.5 Re-subscription automática

Quando o WebSocket reconecta, todas as streams ativas precisam ser re-assinadas. O manager mantém um `Set` de nomes de stream ativos e reenvia o subscribe na reconexão:

```js
_onOpen() {
  this.status = 'connected';
  this.reconnectAttempts = 0;
  
  // Re-subscribe all active streams
  const streams = [...this.activeStreams.keys()];
  if (streams.length > 0) {
    const msg = {
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now()
    };
    this.ws.send(JSON.stringify(msg));
  }
}
```

**IMPORTANTE:** Usar o formato de **subscribe/unsubscribe via mensagem JSON** (não URL path), porque permite adicionar/remover streams dinamicamente sem reconectar:

```
ws = new WebSocket('wss://stream.binance.com:9443/ws');

// Subscribe
ws.send(JSON.stringify({
  method: 'SUBSCRIBE',
  params: ['btcusdt@miniTicker', 'btcusdt@kline_1m'],
  id: 1
}));

// Unsubscribe
ws.send(JSON.stringify({
  method: 'UNSUBSCRIBE',
  params: ['btcusdt@kline_1m'],
  id: 2
}));
```

**Vantagem sobre o formato atual (URL path):**
- Atual: reconectar para cada mudança de streams → flicker de status
- Novo: adiciona/remove streams sem derrubar a conexão

### 2.6 API do WebSocketManager

```js
// Inicialização (chamado uma vez no boot do app)
wsManager.init();

// Dashboard: subscribe nos miniTickers da watchlist
wsManager.subscribe('btcusdt@miniTicker', (data) => { /* update card */ });

// Detail chart: subscribe em kline quando usuário abre gráfico
wsManager.subscribe('btcusdt@kline_1m', (data) => { /* update candle */ });

// Remove stream quando não é mais necessário
wsManager.unsubscribe('btcusdt@kline_1m');

// Status observable
wsManager.on('status', (status) => { /* update connection dot */ });

// Cleanup
wsManager.disconnect();
```

---

## 3. Atualização em Tempo Real

### 3.1 Dashboard — Throttle de Preços

**Problema:** `miniTicker` dispara ~1 evento/segundo por par. Com 20 pares = 20 callbacks/s no renderer. Se cada callback fizer `innerHTML` ou `textContent` no DOM → 60 FPS degradados.

**Solução: Throttle por símbolo com `requestAnimationFrame`**

```js
class PriceThrottle {
  constructor() {
    this.pending = new Map(); // symbol -> { price, change }
    this.rafId = null;
  }

  update(symbol, price, change) {
    this.pending.set(symbol, { price, change });
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => this._flush());
    }
  }

  _flush() {
    this.rafId = null;
    for (const [symbol, data] of this.pending) {
      dashboard.updatePrice(symbol, data.price, data.change);
    }
    this.pending.clear();
  }
}
```

**Frequência efetiva:** ~16ms (60fps) — agrupa todos os updates de preço em um único frame de renderização.

**Regra:** Nunca chamar `textContent`/`innerHTML` diretamente no callback do WebSocket. Sempre passar pelo throttle.

### 3.2 Gráfico Detalhado — Atualização Real de Velas com Kline Stream

**Problema atual:** `_startRealtime()` no `charts.js` usa `miniTicker` (só preço) pra simular OHLC. A vela fica com `open = high = low = price` — incorreto.

**Solução:** Usar stream `kline_1s` ou `kline_1m` que entrega o OHLC real.

```js
/**
 * Estrutura do evento kline da Binance:
 * {
 *   e: "kline",
 *   E: 123456789,
 *   s: "BTCUSDT",
 *   k: {
 *     t: 1234567890000,   // open time
 *     T: 1234600000000,   // close time
 *     s: "BTCUSDT",
 *     i: "1m",            // interval
 *     o: "40000.00",      // open
 *     h: "40100.00",      // high
 *     l: "39900.00",      // low
 *     c: "40050.00",      // close
 *     v: "100.5",         // volume
 *     x: false,           // is this kline closed?
 *     ...
 *   }
 * }
 */
```

**Algoritmo de atualização da vela no chart:**

```js
_onKlineUpdate(symbol, kline) {
  const barTime = Math.floor(kline.t / 1000); // Binance envia ms, Lightweight Charts usa segundos
  
  if (!this.lastBar || barTime > this.lastBar.time) {
    // NOVA VELA: a anterior fechou (kline.x === true no evento anterior)
    // Insere a vela anterior como finalizada e cria nova
    if (this.lastBar) {
      try { this.candleSeries.update(this.lastBar); } catch(e) {}
    }
    this.lastBar = {
      time: barTime,
      open: parseFloat(kline.o),
      high: parseFloat(kline.h),
      low: parseFloat(kline.l),
      close: parseFloat(kline.c),
    };
  } else {
    // MESMA VELA: atualiza OHLC
    this.lastBar.high = Math.max(this.lastBar.high, parseFloat(kline.h));
    this.lastBar.low = Math.min(this.lastBar.low, parseFloat(kline.l));
    this.lastBar.close = parseFloat(kline.c);
  }
  
  // Atualiza a série do chart
  try { 
    this.candleSeries.update(this.lastBar); 
    
    // Também atualiza volume se disponível
    if (this.volumeSeries && kline.v) {
      const vol = parseFloat(kline.v);
      const isUp = this.lastBar.close >= this.lastBar.open;
      this.volumeSeries.update({ 
        time: barTime, 
        value: vol,
        color: isUp ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'
      });
    }
  } catch(e) {}
}
```

**Escolha do intervalo de kline conforme timeframe do gráfico:**

| Timeframe do gráfico | Stream kline a usar | Motivo |
|---|---|---|
| 15m | `kline_1s` | Muito tempo até fechar vela de 15m — usar 1s pra máxima granularidade |
| 1h | `kline_1s` | Mesmo motivo — vela de 1h demora pra fechar |
| 4h | `kline_1m` | Kline de 1s seria overkill (14400 ticks por vela); 1m é suficiente |
| 1d | `kline_1m` | 1m dá granularidade suficiente pra um dia |
| 1w | `kline_1m` | Idem |

**Transição de timeframe no gráfico:**

Quando usuário muda de 15m → 4h:
1. `unsubscribe('btcusdt@kline_1s')`
2. `subscribe('btcusdt@kline_1m')`
3. Recarregar dados históricos via REST (já existente em `chart:klines` IPC)

### 3.3 Estratégia Polling vs Push

| Dado | Método | Frequência | Justificativa |
|---|---|---|---|
| Preço instantâneo | **Push** (miniTicker) | ~1s | Já existe, funciona bem |
| OHLC da vela | **Push** (kline) | 1s ou 1m | Necessário pra candle real |
| Score/Scan completo | **Poll** (REST → IPC) | 5-15 min (configurável) | Scan é pesado (múltiplas APIs + cálculos). Não faz sentido via WS |
| Histórico de klines | **REST** (GET /klines) | On-demand (troca de timeframe) | Dados históricos não vêm por WS |
| Sentimento (funding, OI) | **REST** (parte do scan) | Junto com scan completo | Endpoints de futures não têm WebSocket público gratuito |

---

## 4. Detecção de Oportunidades

### 4.1 Scanner em Background

**Funcionamento:**

```
  Timer (5-15 min)         WebSocket (constante)
       │                        │
       ▼                        ▼
  ScannerService.scan()     Preço em tempo real
       │                        │
       ▼                        ▼
  Novo score calculado      Preço sempre atualizado
       │
       ▼
  score >= threshold? ──NÃO──► nada
       │
      SIM
       │
       ▼
  ┌─────────────────────────────┐
  │ 1. Badge visual no card     │
  │ 2. Electron Notification    │
  │ 3. Card sobe no ranking     │
  └─────────────────────────────┘
```

**Implementação no `dashboard.js`:**

```js
// Hook pós-scan: verificar oportunidades
_onScanComplete(results) {
  const threshold = this.alertThreshold; // padrão 60, configurável em settings
  
  for (const result of results) {
    if (result.score >= threshold) {
      this._highlightOpportunity(result);
      this._notifyOpportunity(result);
    } else {
      this._clearHighlight(result.symbol);
    }
  }
  
  // Reordena cards: oportunidades primeiro, depois por score
  this._sortCards();
}
```

### 4.2 Badge Visual no Card (CSS Animation)

**Classes CSS a adicionar no `styles.css`:**

```css
/* Card de oportunidade */
.pair-card.opportunity {
  border: 2px solid var(--md-success);
  box-shadow: 0 0 12px rgba(63, 185, 80, 0.3);
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 8px rgba(63, 185, 80, 0.2); }
  50% { box-shadow: 0 0 20px rgba(63, 185, 80, 0.5); }
}

/* Badge de "novo" no canto do card */
.pair-card .opportunity-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--md-success);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.5); }
}
```

**Classes de severidade:**

| Score range | Classe CSS | Cor da borda |
|---|---|---|
| 75-100 | `opportunity-strong` | `#3fb950` (verde) — glow duplo |
| 60-74 | `opportunity-moderate` | `#d2991d` (amarelo) — glow simples |
| Abaixo | Nenhuma | Normal |

### 4.3 Notificações Nativas (Electron)

**Fluxo:**

```
Renderer (dashboard.js)               Main Process (main.js)
─────────────────────                ─────────────────────
                                                                
score >= threshold                                          
  │                                                         
  ├─► window.api.notify(             ──► ipcMain.handle('notify')
  │     title, body)                      │
  │                                       ├─ new Notification({title, body}).show()
  │                                       └─ (se app minimizado) tray.displayBalloon()
```

**Handler existente já funciona — precisa ser chamado:**

```js
// Em dashboard.js, após scan:
async _notifyOpportunity(result) {
  const title = `${result.emoji} ${result.symbol.replace('USDT', '/USDT')} — Score ${result.score}`;
  const body = `${result.signal} | Entrada: $${result.entry.toFixed(2)} | R:R 1:${result.rr}`;
  
  // Só notifica se não foi notificado recentemente (debounce 5 min por par)
  const lastNotif = this.lastNotification.get(result.symbol);
  if (lastNotif && Date.now() - lastNotif < 5 * 60 * 1000) return;
  
  this.lastNotification.set(result.symbol, Date.now());
  await window.api.notify(title, body);
}
```

**Configuração de threshold via settings (HTML já existe):**

O HTML em `index.html` já tem `<select id="setting-alert-threshold">` com opções 75, 60, 40. O `settings.js` já persiste via `window.api.setSetting('alertThreshold', value)`. Basta ler no boot.

### 4.4 Debounce de Notificações

Para evitar spam quando o score fica oscilando em torno do threshold:

```js
// Mapa de cool-down por símbolo
this.notificationCooldown = new Map(); // symbol -> timestamp

_shouldNotify(symbol) {
  const last = this.notificationCooldown.get(symbol);
  if (!last) return true;
  return (Date.now() - last) > 5 * 60 * 1000; // 5 minutos
}
```

---

## 5. Edge Cases

### 5.1 WebSocket Cai → Reconexão com Backoff

```
Estado: CONNECTED
  │
  ├─ onclose/onerror disparado
  │
  ▼
Estado: RECONNECTING
  │
  ├─ delay = min(1000 * 2^attempt, 30000)
  ├─ setTimeout(() => reconnect(), delay)
  │
  ├─ onopen → Estado: CONNECTED (re-subscribe todos os streams ativos)
  │
  └─ Após 10 tentativas → Estado: FAILED
       │
       ├─ Notificar UI: "WebSocket indisponível — reconectando em 60s"
       └─ setTimeout(() => resetAndRetry(), 60000)
```

**O que a UI mostra durante a desconexão:**
- `#connection-status` fica amarelo (`connecting`) ou vermelho (`disconnected`)
- Preços congelam no último valor conhecido (exibir com opacidade reduzida)
- Gráfico continua mostrando última vela (sem atualização)
- Banner no topo: "Reconectando..." com spinner

### 5.2 Binance Retorna Erro ou Limita Rate

**Erros comuns da WebSocket Binance:**

| Erro | Significado | Ação |
|---|---|---|
| `{"code": 0, "msg": "Unknown error"}` | Erro genérico | Reconectar após backoff |
| `{"code": 1, "msg": "too many requests"}` | Rate limit | Backoff de 60s |
| `{"code": 3, "msg": "Invalid JSON"}` | Bug no subscribe | Log + corrigir payload |
| Conexão fechada sem msg | Binance matou conexão (idle?) | Ping a cada 3 minutos |

**Ping/Pong keepalive:**

A Binance requer ping a cada 3 minutos. O `WebSocketManager` deve implementar:

```js
// Após onopen:
this.pingInterval = setInterval(() => {
  if (this.ws?.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify({ method: 'PING' }));
  }
}, 3 * 60 * 1000);
```

**Rate limit de REST (parte do scan):**

O scan usa REST para klines + futures. A Binance tem rate limit de 1200 requests/minuto. Com 20 pares × 4 chamadas REST por scan = 80 requests a cada 5-15 min → bem dentro do limite. 

Se receber HTTP 429: esperar `Retry-After` header (ou default 60s) e retentar aquele par específico.

### 5.3 Sincronização WebSocket ↔ REST (Gap de Dados)

**Problema:** O gráfico carrega dados históricos via REST (`GET /klines`) e depois atualiza via WebSocket. Pode haver gap entre a última vela do REST e o primeiro evento do WS.

**Solução:** O evento `kline` da Binance inclui a flag `x` (isFinal). Quando o gráfico carrega:

1. Carrega REST → `klines[0..N-1]` (velas fechadas)
2. Abre WebSocket kline → primeiro evento sempre terá `x: false` (vela atual em formação)
3. Se o timestamp da primeira mensagem WS (`kline.t`) > última vela REST (`klines[N-1].time * 1000`) → gap (velas fecharam entre REST e WS connect)
4. **Tratamento do gap:** Fazer fetch REST complementar só das velas faltantes (pequeno, rápido)

```js
async _fillGap(symbol, lastRestBarTime, firstWsBarTime) {
  // lastRestBarTime em segundos, firstWsBarTime em ms
  const wsBarSec = Math.floor(firstWsBarTime / 1000);
  if (wsBarSec <= lastRestBarTime) return; // sem gap
  
  const missingKlines = await scannerService.getKlines(symbol, this.currentInterval, 5);
  // Insere velas que estão entre lastRestBarTime e wsBarSec
  for (const k of missingKlines) {
    if (k.time > lastRestBarTime && k.time < wsBarSec) {
      this.candleSeries.update({
        time: k.time, open: k.open, high: k.high, low: k.low, close: k.close
      });
    }
  }
}
```

### 5.4 App em Background / Minimizado

**Comportamento quando minimizado:**

| Recurso | Comportamento |
|---|---|
| WebSocket | **Mantém conexão** — miniTicker continua (baixo overhead) |
| Kline stream | **Remove** — se usuário não está vendo o gráfico, não precisa de kline 1s |
| Scan automático | **Pausa** — sem sentido scannear se ninguém vê |
| Notificações | **Ativas** — Electron Notification funciona mesmo com app em background |

**Implementação — detectar visibilidade:**

```js
// No renderer (app.js):
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    dashboard.stopAutoScan();
    // Se estava no detail, remove kline stream
    if (App.currentPage === 'detail') {
      wsManager.unsubscribe(`${chartManager.currentSymbol.toLowerCase()}@kline_1s`);
      wsManager.unsubscribe(`${chartManager.currentSymbol.toLowerCase()}@kline_1m`);
    }
  } else {
    dashboard.startAutoScan();
    // Re-subscribe kline se voltou pro detail
    if (App.currentPage === 'detail') {
      chartManager._startRealtime(chartManager.currentSymbol, chartManager.currentInterval);
    }
  }
});
```

**Nota:** Electron também expõe `mainWindow.isMinimized()` e evento `mainWindow.on('minimize', ...)`. Mas `visibilitychange` é mais confiável (cobre minimize + switch de desktop + lock screen).

### 5.5 Vazamento de Memória

**Cenários de risco:**

1. **Navegação rápida dashboard → detail → dashboard:** Cada transição cria/destrói streams. O `unsubscribe` deve ser garantido.
2. **Callbacks acumulados:** Se `subscribe()` for chamado múltiplas vezes sem `unsubscribe()` correspondente.
3. **Timers não limpos:** `setInterval` do ping, `setTimeout` do backoff.

**Mitigações:**

```js
// Em charts.js destroy():
destroy() {
  this._stopRealtime();     // unsubscribe do kline + miniTicker
  this._clearLevels();      // remove séries do gráfico
  if (this.chart) { this.chart.remove(); this.chart = null; }
  this.lastBar = null;
}

// Em dashboard.js destroy():
destroy() {
  this.scanning = false;
  this.stopAutoScan();      // clearInterval
  this.unsubscribers.forEach(fn => fn());  // todos os unsubscribe
  this.unsubscribers = [];
}
```

**Verificação de memória:** Após 50 transições dashboard↔detail, heap não deve crescer mais que 20%.

---

## 6. Estruturas de Dados

### 6.1 Mensagem miniTicker (já em uso)

```ts
interface MiniTickerEvent {
  e: "24hrMiniTicker";  // event type
  E: number;            // event time (ms)
  s: string;            // symbol (e.g. "BTCUSDT")
  c: string;            // close price (last price)
  o: string;            // open price 24h ago
  h: string;            // high price 24h
  l: string;            // low price 24h
  v: string;            // volume 24h (base asset)
  q: string;            // volume 24h (quote asset)
}
```

### 6.2 Mensagem kline (nova — precisa implementar)

```ts
interface KlineEvent {
  e: "kline";           // event type
  E: number;            // event time (ms)
  s: string;            // symbol
  k: {
    t: number;          // kline start time (ms)
    T: number;          // kline close time (ms) 
    s: string;          // symbol
    i: string;          // interval (e.g. "1m", "1s")
    f: number;          // first trade ID
    L: number;          // last trade ID
    o: string;          // open price
    h: string;          // high price
    l: string;          // low price
    c: string;          // close price (last price in this kline)
    v: string;          // base asset volume
    n: number;          // number of trades
    x: boolean;         // is this kline closed? (true = final)
    q: string;          // quote asset volume
    V: string;          // taker buy base asset volume
    Q: string;          // taker buy quote asset volume
  };
}
```

### 6.3 API do WebSocketManager

```ts
interface WebSocketManager {
  // Conexão
  init(): void;
  disconnect(): void;
  
  // Streams
  subscribe(streamName: string, callback: (data: any) => void): () => void;
  unsubscribe(streamName: string): void;
  
  // Status
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  on(event: 'status', callback: (status: string) => void): void;
  on(event: 'error', callback: (error: Error) => void): void;
}
```

### 6.4 API do PriceThrottle

```ts
interface PriceThrottle {
  update(symbol: string, price: number, change: number): void;
  flush(): void;
  destroy(): void;
}
```

### 6.5 Integração com o ChartManager existente

Métodos a modificar em `charts.js`:

```ts
interface ChartManager {
  // EXISTENTE — manter
  init(container: HTMLElement): void;
  loadData(symbol: string, interval: string): Promise<void>;
  drawLevels(levels: any): void;
  resize(): void;
  destroy(): void;
  
  // MODIFICAR — usar kline stream em vez de miniTicker
  _startRealtime(symbol: string, interval: string): void;
  _stopRealtime(): void;
  
  // NOVO — handler específico pra kline
  _onKlineUpdate(kline: KlineEvent['k']): void;
  
  // NOVO — detectar e preencher gap REST↔WS
  _fillGap(symbol: string, lastRestBarTime: number, firstWsBarTime: number): Promise<void>;
}
```

---

## 7. Plano de Implementação

### Fase 1: WebSocketManager (arquivo novo)
- **Arquivo:** `desktop/renderer/websocket.js` — reescrever completamente
- **Escopo:** Classe `WebSocketManager` com subscribe/unsubscribe dinâmico, backoff exponencial, ping/pong, status observable
- **Teste:** Conectar 20 miniTickers → desconectar ethernet → verificar reconexão automática

### Fase 2: Kline Stream no Gráfico
- **Arquivo:** `desktop/renderer/charts.js` — modificar `_startRealtime()` e `_stopRealtime()`
- **Escopo:** Substituir `priceStream.subscribe()` por `wsManager.subscribe('SYMBOL@kline_1s')` com handler de OHLC real
- **Teste:** Abrir detail → verificar que candles atualizam OHLC real (não mais open=high=low=close)

### Fase 3: PriceThrottle no Dashboard
- **Arquivo:** `desktop/renderer/components/dashboard.js` — adicionar throttle + usar wsManager
- **Escopo:** `PriceThrottle` com `requestAnimationFrame`, substituir `priceStream` por `wsManager`
- **Teste:** Dashboard com 20 pares → 60fps estáveis (sem jank ao atualizar preços)

### Fase 4: Detector de Oportunidades
- **Arquivos:** `dashboard.js`, `styles.css`, `main.js`
- **Escopo:** Hook pós-scan com threshold check, classes CSS de glow/pulse, notificações nativas
- **Teste:** Forçar score > 60 via mock → verificar card com glow + notificação no OS

### Fase 5: Edge Cases e Resiliência
- **Arquivos:** `websocket.js`, `charts.js`, `dashboard.js`, `app.js`
- **Escopo:** Gap filling REST↔WS, visibilitychange para pausar em background, memory leak prevention, rate limit handling
- **Teste:** Minimizar app 5 min → reabrir → dados frescos; 50 transições dashboard↔detail → sem leak

---

## Checklist de Validação

- [ ] WebSocket conecta e reconecta com backoff exponencial
- [ ] Subscribe/unsubscribe dinâmico funciona (sem reconexão full)
- [ ] Ping a cada 3 minutos mantém conexão viva
- [ ] Dashboard mostra preços em tempo real sem travar (60fps)
- [ ] Gráfico detalhado atualiza última vela com OHLC real da Binance
- [ ] Trocar timeframe no gráfico troca o stream de kline (1s ↔ 1m)
- [ ] Cards com score ≥ threshold mostram glow verde pulsante
- [ ] Notificação nativa dispara quando score ≥ threshold (com debounce 5 min)
- [ ] Ao minimizar, scan pausa e kline stream é removido
- [ ] Ao reabrir, scan retoma e kline é re-assinado
- [ ] Conexão cai → status UI mostra "Reconectando" → volta sozinho
- [ ] 50 transições dashboard↔detail não causam memory leak
- [ ] Gap REST↔WS é detectado e preenchido automaticamente

---

## HANDOFF

**STATUS:** APROVADO  
**PROXIMO_AGENTE:** implementation-engineer  
**ARTEFATOS:** `docs/specs/realtime-websocket.md`  

### Resumo para o implementation-engineer:

Esta spec cobre 5 fases de implementação para transformar o dashboard de estático em tempo real:

1. **Reescrever `websocket.js`** — WebSocketManager unificado com subscribe/unsubscribe dinâmico, backoff exponencial, ping keepalive
2. **Corrigir `charts.js`** — usar stream `kline_1s`/`kline_1m` pra OHLC real (não mais simular com miniTicker)
3. **Adicionar `PriceThrottle` no dashboard** — agrupar updates de preço com `requestAnimationFrame` pra 60fps
4. **Detector de oportunidades** — hook pós-scan com threshold, CSS glow pulse, notificações nativas Electron
5. **Edge cases** — gap filling, visibilitychange, memory leak prevention

As seções 2-6 deste documento contêm APIs exatas, estruturas de dados e algoritmos prontos para implementação.
