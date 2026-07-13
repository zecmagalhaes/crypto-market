/**
 * Market Structure Analysis — Smart Money Concepts (SMC)
 * Detecta BOS, CHoCH, Order Blocks, FVG, Liquidity Sweeps
 * e classifica tendência multi-timeframe
 */

import { EMA, findSwings } from './indicators.js';

// ── Break of Structure (BOS) ──────────────────────────

/**
 * Detecta BOS bullish: preço rompe um swing high anterior
 * Detecta BOS bearish: preço rompe um swing low anterior
 */
export function detectBOS(klines, lookback = 5) {
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);

  const bosSignals = [];

  // Varre da esquerda pra direita procurando rompimentos
  for (let i = lookback * 2; i < klines.length; i++) {
    // Maior high dos últimos N candles antes do atual
    let prevHigh = -Infinity;
    let prevHighIdx = -1;
    for (let j = i - lookback; j >= i - lookback * 3; j--) {
      if (j < 0) break;
      if (highs[j] > prevHigh) {
        prevHigh = highs[j];
        prevHighIdx = j;
      }
    }

    // Menor low dos últimos N candles
    let prevLow = Infinity;
    let prevLowIdx = -1;
    for (let j = i - lookback; j >= i - lookback * 3; j--) {
      if (j < 0) break;
      if (lows[j] < prevLow) {
        prevLow = lows[j];
        prevLowIdx = j;
      }
    }

    // BOS Bullish: candle atual rompe o high anterior
    if (closes[i] > prevHigh && prevHighIdx !== -1) {
      bosSignals.push({
        index: i,
        type: 'bullish',
        price: closes[i],
        brokenLevel: prevHigh,
        brokenIndex: prevHighIdx,
      });
    }

    // BOS Bearish: candle atual rompe o low anterior
    if (closes[i] < prevLow && prevLowIdx !== -1) {
      bosSignals.push({
        index: i,
        type: 'bearish',
        price: closes[i],
        brokenLevel: prevLow,
        brokenIndex: prevLowIdx,
      });
    }
  }

  return bosSignals;
}

// ── Change of Character (CHoCH) ──────────────────────

/**
 * CHoCH: mudança na estrutura de mercado
 * Bullish CHoCH: após tendência de baixa (lower lows), faz um higher high
 * Bearish CHoCH: após tendência de alta (higher highs), faz um lower low
 */
export function detectCHoCH(klines, swingLookback = 8) {
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const chochSignals = [];

  const { swingHighs, swingLows } = findSwings(highs, lows, swingLookback);
  const swings = [
    ...swingHighs.map(s => ({ index: s.index, type: 'high', price: s.price })),
    ...swingLows.map(s => ({ index: s.index, type: 'low', price: s.price })),
  ].sort((a, b) => a.index - b.index);

  // Analisa sequência dos últimos swings
  const recentSwings = swings.filter(s => s.index > klines.length - 60);
  if (recentSwings.length < 4) return chochSignals;

  // Últimos 4 swings
  const last = recentSwings.slice(-4);

  // Padrão CHoCH bullish: sequência de lows mais baixos → high mais alto
  if (last[0].type === 'high' && last[2].type === 'high') {
    if (last[2].price > last[0].price && last[1].price < last[3]?.price) {
      chochSignals.push({
        index: last[2].index,
        type: 'bullish',
        description: 'CHoCH bullish — estrutura inverteu para alta',
        price: last[2].price,
      });
    }
  }

  // Padrão CHoCH bearish: sequência de highs mais altos → low mais baixo
  if (last[0].type === 'low' && last[2].type === 'low') {
    if (last[2].price < last[0].price && last[1].price > last[3]?.price) {
      chochSignals.push({
        index: last[2].index,
        type: 'bearish',
        description: 'CHoCH bearish — estrutura inverteu para baixa',
        price: last[2].price,
      });
    }
  }

  return chochSignals;
}

// ── Higher Highs / Lower Lows ─────────────────────────

/**
 * Classifica tendência baseada na sequência de swing points
 */
export function trendStructure(klines, lookback = 8) {
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);

  const { swingHighs, swingLows } = findSwings(highs, lows, lookback);
  const swings = [
    ...swingHighs.map(s => ({ index: s.index, type: 'high', price: s.price })),
    ...swingLows.map(s => ({ index: s.index, type: 'low', price: s.price })),
  ].sort((a, b) => a.index - b.index);

  // Analisa últimas 3 altas e 3 baixas
  const recentHighs = swings.filter(s => s.type === 'high').slice(-3);
  const recentLows = swings.filter(s => s.type === 'low').slice(-3);

  let trend = 'neutral';
  let strength = 0;

  // Higher Highs + Higher Lows = bullish
  const hhSequence = recentHighs.length >= 2 &&
    recentHighs[recentHighs.length - 1].price > recentHighs[recentHighs.length - 2].price;
  const hlSequence = recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price;

  const lhSequence = recentHighs.length >= 2 &&
    recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price;
  const llSequence = recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price < recentLows[recentLows.length - 2].price;

  if (hhSequence && hlSequence) {
    trend = 'bullish';
    strength = 2;
  } else if (hhSequence) {
    trend = 'leaning_bullish';
    strength = 1;
  } else if (lhSequence && llSequence) {
    trend = 'bearish';
    strength = -2;
  } else if (llSequence) {
    trend = 'leaning_bearish';
    strength = -1;
  } else if (lhSequence && hlSequence) {
    trend = 'consolidation';
    strength = 0;
  }

  // Confirmação com EMA alignment
  const closes = klines.map(k => k.close);
  const ema20Arr = EMA(closes, 20);
  const ema50Arr = EMA(closes, 50);
  const last = closes.length - 1;

  const emaAlignment = ema20Arr[last] !== null && ema50Arr[last] !== null
    ? (ema20Arr[last] > ema50Arr[last] ? 'bullish' : 'bearish')
    : 'neutral';

  return {
    trend,
    strength,
    emaAlignment,
    recentHighs: recentHighs.map(s => s.price),
    recentLows: recentLows.map(s => s.price),
  };
}

// ── Fair Value Gaps (FVG) ─────────────────────────────

/**
 * Detecta FVGs (imbalances) — gaps entre candles consecutivos
 */
export function detectFVG(klines) {
  const fvgs = [];
  for (let i = 1; i < klines.length; i++) {
    const prev = klines[i - 1];
    const curr = klines[i];

    // FVG Bullish: low atual > high do anterior
    if (curr.low > prev.high) {
      fvgs.push({
        index: i,
        type: 'bullish',
        top: curr.low,
        bottom: prev.high,
        size: curr.low - prev.high,
      });
    }

    // FVG Bearish: high atual < low do anterior
    if (curr.high < prev.low) {
      fvgs.push({
        index: i,
        type: 'bearish',
        top: prev.low,
        bottom: curr.high,
        size: prev.low - curr.high,
      });
    }
  }
  return fvgs;
}

// ── Liquidity Sweeps ─────────────────────────────────

/**
 * Detecta liquidity sweeps: candle perfura um nível e reverte
 */
export function detectLiquiditySweeps(klines, lookback = 10) {
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const closes = klines.map(k => k.close);
  const sweeps = [];

  for (let i = lookback; i < klines.length - 1; i++) {
    // Procura equal highs/lows nos últimos N candles
    let eqHigh = null, eqLow = null;

    for (let j = i - lookback; j < i; j++) {
      for (let kk = j + 1; kk < i; kk++) {
        if (Math.abs(highs[j] - highs[kk]) / highs[j] < 0.003) {
          eqHigh = Math.max(highs[j], highs[kk]);
        }
        if (Math.abs(lows[j] - lows[kk]) / lows[j] < 0.003) {
          eqLow = Math.min(lows[j], lows[kk]);
        }
      }
    }

    // Sweep de equal high: rompe e fecha abaixo
    if (eqHigh && highs[i] > eqHigh * 1.001 && closes[i] < eqHigh) {
      sweeps.push({ index: i, type: 'bearish_sweep', level: eqHigh });
    }

    // Sweep de equal low: rompe e fecha acima
    if (eqLow && lows[i] < eqLow * 0.999 && closes[i] > eqLow) {
      sweeps.push({ index: i, type: 'bullish_sweep', level: eqLow });
    }
  }

  return sweeps;
}

// ── Análise completa de estrutura ────────────────────

export function analyzeStructure(klines) {
  const bos = detectBOS(klines);
  const choch = detectCHoCH(klines);
  const fvg = detectFVG(klines);
  const sweeps = detectLiquiditySweeps(klines);

  // Trend via swing analysis
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const closes = klines.map(k => k.close);

  // Método simplificado de trend por máximos/mínimos relativos
  const n = klines.length;
  const half = Math.floor(n / 2);
  const firstHalfHigh = Math.max(...highs.slice(0, half));
  const secondHalfHigh = Math.max(...highs.slice(half));
  const firstHalfLow = Math.min(...lows.slice(0, half));
  const secondHalfLow = Math.min(...lows.slice(half));

  const priceChange = ((closes[n - 1] - closes[0]) / closes[0]) * 100;

  let trend = 'neutral';
  if (secondHalfHigh > firstHalfHigh && secondHalfLow > firstHalfLow) {
    trend = 'bullish';
  } else if (secondHalfHigh < firstHalfHigh && secondHalfLow < firstHalfLow) {
    trend = 'bearish';
  } else if (secondHalfHigh > firstHalfHigh) {
    trend = 'leaning_bullish';
  } else if (secondHalfLow < firstHalfLow) {
    trend = 'leaning_bearish';
  }

  // BOS mais recentes
  const lastBos = bos.slice(-3);
  const lastChoch = choch.slice(-1);
  const lastSweeps = sweeps.slice(-2);

  return {
    trend,
    priceChangePercent: priceChange,
    recentBos: lastBos,
    recentChoch: lastChoch,
    recentFvg: fvg.slice(-5),
    recentSweeps: lastSweeps,
    // Métricas quantitativas
    bosCount: { bullish: bos.filter(b => b.type === 'bullish').length, bearish: bos.filter(b => b.type === 'bearish').length },
    chochCount: choch.length,
    fvgCount: fvg.length,
    sweepCount: sweeps.length,
  };
}
