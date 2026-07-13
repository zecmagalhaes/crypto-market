/**
 * Indicadores Técnicos — implementação pura, zero dependências
 * RSI, MACD, EMA, SMA, Bollinger Bands, VWAP, ATR
 */

// ── Helpers ───────────────────────────────────────────

export function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

// ── SMA ───────────────────────────────────────────────

export function SMA(data, period) {
  const result = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    result[i] = avg(data.slice(i - period + 1, i + 1));
  }
  return result;
}

// ── EMA ───────────────────────────────────────────────

export function EMA(data, period) {
  const result = new Array(data.length).fill(null);
  const k = 2 / (period + 1);
  // seed com SMA
  result[period - 1] = avg(data.slice(0, period));
  for (let i = period; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

// ── RSI ───────────────────────────────────────────────

export function RSI(data, period = 14) {
  const result = new Array(data.length).fill(null);
  if (data.length < period + 1) return result;

  let gains = 0, losses = 0;
  for (let i = 1; i < period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - (100 / (1 + rs));
    }
  }
  return result;
}

// ── MACD ──────────────────────────────────────────────

export function MACD(data, fast = 12, slow = 26, signal = 9) {
  const emaFast = EMA(data, fast);
  const emaSlow = EMA(data, slow);
  const macdLine = new Array(data.length).fill(null);
  for (let i = 0; i < data.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  const validMacd = macdLine.filter(v => v !== null);
  const signalLineRaw = EMA(validMacd, signal);

  const signalLine = new Array(data.length).fill(null);
  let si = 0;
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== null) {
      signalLine[i] = signalLineRaw[si++];
    }
  }

  const histogram = new Array(data.length).fill(null);
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram[i] = macdLine[i] - signalLine[i];
    }
  }

  return { macdLine, signalLine, histogram };
}

// ── Bollinger Bands ───────────────────────────────────

export function BollingerBands(data, period = 20, multiplier = 2) {
  const sma = SMA(data, period);
  const upper = new Array(data.length).fill(null);
  const lower = new Array(data.length).fill(null);
  const bandwidth = new Array(data.length).fill(null);

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const mean = sma[i];
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    upper[i] = mean + multiplier * std;
    lower[i] = mean - multiplier * std;
    bandwidth[i] = (upper[i] - lower[i]) / mean; // % bandwidth
  }

  return { sma, upper, lower, bandwidth };
}

// ── VWAP ──────────────────────────────────────────────

export function VWAP(klines) {
  // VWAP acumulado desde o início da série
  const result = new Array(klines.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < klines.length; i++) {
    const typical = (klines[i].high + klines[i].low + klines[i].close) / 3;
    cumPV += typical * klines[i].volume;
    cumV += klines[i].volume;
    if (cumV > 0) result[i] = cumPV / cumV;
  }
  return result;
}

// ── ATR (Average True Range) ──────────────────────────

export function ATR(klines, period = 14) {
  const tr = new Array(klines.length).fill(0);
  for (let i = 1; i < klines.length; i++) {
    const h = klines[i].high;
    const l = klines[i].low;
    const prevC = klines[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
  }
  const atr = new Array(klines.length).fill(null);
  // seed com SMA
  if (tr.length > period) {
    atr[period] = avg(tr.slice(1, period + 1));
    for (let i = period + 1; i < tr.length; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }
  }
  return { tr, atr };
}

// ── Volume médio (SMA de volume) ─────────────────────

export function volumeMA(klines, period = 20) {
  const volumes = klines.map(k => k.volume);
  return SMA(volumes, period);
}

// ── Máximos/Mínimos locais ───────────────────────────

export function findSwings(highs, lows, lookback = 5) {
  const swingHighs = [];
  const swingLows = [];
  for (let i = lookback; i < highs.length - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHigh = false;
      if (lows[j] <= lows[i]) isLow = false;
    }
    if (isHigh) swingHighs.push({ index: i, price: highs[i] });
    if (isLow) swingLows.push({ index: i, price: lows[i] });
  }
  return { swingHighs, swingLows };
}

// ── Níveis de Suporte/Resistência ────────────────────

export function findLevels(klines, sensitivity = 0.03) {
  // Usa swing points agrupados por proximidade
  const { swingHighs, swingLows } = findSwings(
    klines.map(k => k.high),
    klines.map(k => k.low),
    5
  );

  const cluster = (points) => {
    if (points.length === 0) return [];
    const clusters = [];
    const sorted = [...points].sort((a, b) => a.price - b.price);
    let current = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const lastAvg = avg(current.map(p => p.price));
      if (Math.abs(sorted[i].price - lastAvg) / lastAvg < sensitivity) {
        current.push(sorted[i]);
      } else {
        if (current.length >= 2) clusters.push({ price: avg(current.map(p => p.price)), touches: current.length });
        current = [sorted[i]];
      }
    }
    if (current.length >= 2) clusters.push({ price: avg(current.map(p => p.price)), touches: current.length });
    return clusters.sort((a, b) => b.touches - a.touches);
  };

  return {
    resistances: cluster(swingHighs),
    supports: cluster(swingLows),
  };
}

// ── Cálculo de drawdown ──────────────────────────────

export function maxDrawdown(data) {
  let peak = -Infinity;
  let maxDD = 0;
  for (const v of data) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}
