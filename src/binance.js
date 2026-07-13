/**
 * Binance API Client — zero dependências, fetch nativo
 * Spot + Futures public endpoints
 */

const SPOT_BASE = 'https://api.binance.com/api/v3';
const FUTURES_BASE = 'https://fapi.binance.com/fapi/v1';
const FUTURES_OPEN_INTEREST = 'https://fapi.binance.com/futures/data';

const FETCH_TIMEOUT_MS = 15_000;

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      // Tenta extrair mensagem de erro da Binance
      let binanceMsg = '';
      try {
        const body = await res.json();
        if (body.msg) binanceMsg = ` — Binance: ${body.msg}`;
      } catch {}
      throw new Error(`HTTP ${res.status} from ${url}${binanceMsg}`);
    }
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout (${FETCH_TIMEOUT_MS / 1000}s) — ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── SPOT ──────────────────────────────────────────────

/** Puxa velas (klines) do spot */
export async function getKlines(symbol, interval, limit = 100) {
  const url = `${SPOT_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const raw = await fetchJSON(url);
  return raw.map(k => ({
    openTime: k[0],
    open:     parseFloat(k[1]),
    high:     parseFloat(k[2]),
    low:      parseFloat(k[3]),
    close:    parseFloat(k[4]),
    volume:   parseFloat(k[5]),
    closeTime: k[6],
  }));
}

/** Preço atual spot */
export async function getPrice(symbol) {
  const url = `${SPOT_BASE}/ticker/price?symbol=${symbol}`;
  const data = await fetchJSON(url);
  return parseFloat(data.price);
}

/** Ticker 24h (volume, high, low, variação) */
export async function get24hTicker(symbol) {
  const url = `${SPOT_BASE}/ticker/24hr?symbol=${symbol}`;
  return fetchJSON(url);
}

// ── FUTURES ───────────────────────────────────────────

/** Funding rate atual (último registro) */
export async function getFundingRate(symbol) {
  const url = `${FUTURES_BASE}/fundingRate?symbol=${symbol}&limit=1`;
  const data = await fetchJSON(url);
  // API retorna array, pegamos o último
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Sem dados de funding rate para ${symbol} — par pode não existir em futures`);
  }
  const last = data[data.length - 1];
  return {
    rate: parseFloat(last.fundingRate),
    time: last.fundingTime,
  };
}

/** Open Interest */
export async function getOpenInterest(symbol) {
  const url = `${FUTURES_OPEN_INTEREST}/openInterest?symbol=${symbol}`;
  const data = await fetchJSON(url);
  return {
    value: parseFloat(data.openInterest),
    time: data.time,
  };
}

/** Open Interest histórico (últimos registros) */
export async function getOpenInterestHist(symbol, period = '5m', limit = 30) {
  const url = `${FUTURES_OPEN_INTEREST}/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`;
  const data = await fetchJSON(url);
  return data.map(d => ({
    value: parseFloat(d.sumOpenInterest),
    time: d.timestamp,
  }));
}

/** Long/Short Ratio (top traders) */
export async function getLongShortRatio(symbol, period = '5m', limit = 30) {
  const url = `${FUTURES_OPEN_INTEREST}/topLongShortPositionRatio?symbol=${symbol}&period=${period}&limit=${limit}`;
  const data = await fetchJSON(url);
  return data.map(d => ({
    longRatio: parseFloat(d.longAccount),
    shortRatio: parseFloat(d.shortAccount),
    time: d.timestamp,
  }));
}

/** Long/Short Ratio (contas — global) */
export async function getGlobalLongShortRatio(symbol, period = '5m', limit = 30) {
  const url = `${FUTURES_OPEN_INTEREST}/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=${limit}`;
  const data = await fetchJSON(url);
  return data.map(d => ({
    longRatio: parseFloat(d.longAccount),
    shortRatio: parseFloat(d.shortAccount),
    time: d.timestamp,
  }));
}

/** Velas de futures (pra confirmar volume de futuros) */
export async function getFuturesKlines(symbol, interval, limit = 100) {
  const url = `${FUTURES_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const raw = await fetchJSON(url);
  return raw.map(k => ({
    openTime: k[0],
    open:     parseFloat(k[1]),
    high:     parseFloat(k[2]),
    low:      parseFloat(k[3]),
    close:    parseFloat(k[4]),
    volume:   parseFloat(k[5]),
    closeTime: k[6],
  }));
}

/** Order book (top bids/asks) */
export async function getOrderBook(symbol, limit = 20) {
  const url = `${SPOT_BASE}/depth?symbol=${symbol}&limit=${limit}`;
  const data = await fetchJSON(url);
  return {
    bids: data.bids.map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
    asks: data.asks.map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) })),
  };
}

/** Exchange info (filtros de preço, tick size, etc) */
export async function getExchangeInfo(symbol) {
  const url = `${SPOT_BASE}/exchangeInfo?symbol=${symbol}`;
  return fetchJSON(url);
}
