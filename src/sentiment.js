/**
 * Análise de Sentimento — métricas de futures da Binance
 * Funding Rate, Open Interest, Long/Short Ratio
 */

import {
  getFundingRate,
  getOpenInterest,
  getOpenInterestHist,
  getLongShortRatio,
  getGlobalLongShortRatio,
  get24hTicker,
} from './binance.js';

import { avg } from './indicators.js';

// ── Funding Rate Analysis ─────────────────────────────

/**
 * Interpreta o funding rate:
 * - Muito positivo (> 0.01%): mercado muito comprado, risco de flush
 * - Neutro (-0.005% a 0.01%): saudável
 * - Muito negativo (< -0.005%): mercado muito vendido, possível short squeeze
 */
export async function analyzeFunding(symbol) {
  try {
    const data = await getFundingRate(symbol);
    const rate = data.rate;
    const ratePercent = rate * 100;

    let signal = 'neutral';
    let score = 0;

    if (rate > 0.001) { // > 0.1%
      signal = 'bearish';
      score = -2; // muito long = possível flush
    } else if (rate > 0.0005) {
      signal = 'slightly_bearish';
      score = -1;
    } else if (rate < -0.0005) {
      signal = 'bullish';
      score = 2; // muito short = possível squeeze
    } else if (rate < -0.0001) {
      signal = 'slightly_bullish';
      score = 1;
    }

    return {
      rate: ratePercent,
      rateRaw: rate,
      signal,
      score,
      description: rate > 0.001
        ? `Funding muito alto (${ratePercent.toFixed(4)}%) — mercado sobreaquecido em longs`
        : rate < -0.0005
          ? `Funding negativo (${ratePercent.toFixed(4)}%) — mercado pesado em shorts`
          : `Funding neutro (${ratePercent.toFixed(4)}%)`,
    };
  } catch (e) {
    return { error: e.message, rate: null, signal: 'unknown', score: 0 };
  }
}

// ── Open Interest Analysis ────────────────────────────

/**
 * Analisa tendência do Open Interest:
 * - OI subindo + preço subindo = tendência forte, momentum real
 * - OI subindo + preço caindo = distribuição, sinal bearish
 * - OI caindo + preço subindo = short squeeze, fraco
 * - OI caindo + preço caindo = desalavancagem, pode ser fundo
 */
export async function analyzeOpenInterest(symbol) {
  try {
    const [current, hist] = await Promise.all([
      getOpenInterest(symbol),
      getOpenInterestHist(symbol, '5m', 30),
    ]);

    if (hist.length < 2) return { error: 'Dados insuficientes', signal: 'unknown', score: 0 };

    // Tendência do OI
    const firstHalf = hist.slice(0, 15);
    const secondHalf = hist.slice(15);
    const firstAvg = avg(firstHalf.map(h => h.value));
    const secondAvg = avg(secondHalf.map(h => h.value));
    const oiChange = ((secondAvg - firstAvg) / firstAvg) * 100;

    let signal = 'neutral';
    let score = 0;

    if (oiChange > 5) {
      signal = 'oi_surging';
      score = 1;
    } else if (oiChange > 2) {
      signal = 'oi_rising';
      score = 0.5;
    } else if (oiChange < -5) {
      signal = 'oi_dropping';
      score = -1;
    } else if (oiChange < -2) {
      signal = 'oi_declining';
      score = -0.5;
    }

    // OI atual
    const oiValue = current.value;
    const oiInMillions = (oiValue / 1_000_000).toFixed(1);

    return {
      currentOI: oiValue,
      oiMillions: parseFloat(oiInMillions),
      oiChangePercent: oiChange,
      signal,
      score,
      description: `OI: $${oiInMillions}M (${oiChange > 0 ? '+' : ''}${oiChange.toFixed(1)}% em 2.5h)`,
    };
  } catch (e) {
    return { error: e.message, signal: 'unknown', score: 0 };
  }
}

// ── Long/Short Ratio ──────────────────────────────────

/**
 * Interpreta o ratio long/short:
 * - Muitos longs vs shorts = mercado otimista demais → cautela
 * - Ratio equilibrado = saudável
 * - Ratio muito extremo = sinal contrário (contrarian)
 */
export async function analyzeLongShortRatio(symbol) {
  try {
    const [topTraders, global] = await Promise.all([
      getLongShortRatio(symbol, '5m', 30),
      getGlobalLongShortRatio(symbol, '5m', 30),
    ]);

    const latestTop = topTraders[topTraders.length - 1];
    const latestGlobal = global[global.length - 1];

    if (!latestTop || !latestGlobal) {
      return { error: 'Dados insuficientes', signal: 'unknown', score: 0 };
    }

    const topLongPct = latestTop.longRatio * 100;
    const globalLongPct = latestGlobal.longRatio * 100;

    // Tendência do ratio dos top traders
    const firstHalf = topTraders.slice(0, 15);
    const secondHalf = topTraders.slice(15);
    const firstAvg = avg(firstHalf.map(t => t.longRatio));
    const secondAvg = avg(secondHalf.map(t => t.longRatio));
    const ratioTrend = secondAvg - firstAvg;

    let signal = 'neutral';
    let score = 0;
    const reasons = [];

    // Top traders muito posicionados
    if (topLongPct > 70) {
      signal = 'bearish_contrarian';
      score -= 1.5;
      reasons.push('Top traders excessivamente longs');
    } else if (topLongPct < 30) {
      signal = 'bullish_contrarian';
      score += 1.5;
      reasons.push('Top traders excessivamente shorts');
    }

    // Momentum do ratio
    if (ratioTrend > 0.05) {
      score += 0.5;
      reasons.push('Longs aumentando');
    } else if (ratioTrend < -0.05) {
      score -= 0.5;
      reasons.push('Longs diminuindo');
    }

    return {
      topLongPercent: topLongPct,
      globalLongPercent: globalLongPct,
      topShortPercent: 100 - topLongPct,
      globalShortPercent: 100 - globalLongPct,
      ratioTrend,
      signal,
      score,
      description: `Top traders: ${topLongPct.toFixed(0)}% long | Global: ${globalLongPct.toFixed(0)}% long`,
      reasons,
    };
  } catch (e) {
    return { error: e.message, signal: 'unknown', score: 0 };
  }
}

// ── Volume & Volatilidade ─────────────────────────────

export async function analyzeVolumeAndVolatility(symbol) {
  try {
    const ticker = await get24hTicker(symbol);

    const volume = parseFloat(ticker.volume);
    const quoteVolume = parseFloat(ticker.quoteVolume);
    const priceChange = parseFloat(ticker.priceChangePercent);
    const high = parseFloat(ticker.highPrice);
    const low = parseFloat(ticker.lowPrice);
    const lastPrice = parseFloat(ticker.lastPrice);

    // Range percentual 24h
    const rangePercent = ((high - low) / low) * 100;

    let volSignal = 'normal';
    let volScore = 0;

    // Volume alto + preço subindo = acumulação
    if (priceChange > 3 && volume > 0) {
      volSignal = 'high_bullish';
      volScore = 1;
    } else if (priceChange < -3 && volume > 0) {
      volSignal = 'high_bearish';
      volScore = -1;
    }

    return {
      volume24h: volume,
      quoteVolume24h: quoteVolume,
      priceChange24h: priceChange,
      high24h: high,
      low24h: low,
      lastPrice,
      rangePercent,
      volSignal,
      volScore,
      description: `Vol 24h: ${Math.round(quoteVolume / 1_000_000)}M USDT | Range: ${rangePercent.toFixed(1)}% | Δ24h: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`,
    };
  } catch (e) {
    return { error: e.message, signal: 'unknown', score: 0 };
  }
}

// ── Análise completa de sentimento ────────────────────

export async function analyzeSentiment(symbol) {
  const [funding, oi, ls, vol] = await Promise.all([
    analyzeFunding(symbol),
    analyzeOpenInterest(symbol),
    analyzeLongShortRatio(symbol),
    analyzeVolumeAndVolatility(symbol),
  ]);

  const sentimentScore = (funding.score || 0) + (oi.score || 0) + (ls.score || 0) + (vol.volScore || 0);

  // Normaliza o score de sentimento para 0-25 (peso 25% no score final)
  const normalized = Math.max(-25, Math.min(25, sentimentScore * 5));

  let overallSignal = 'neutral';
  if (normalized >= 10) overallSignal = 'bullish';
  else if (normalized >= 5) overallSignal = 'slightly_bullish';
  else if (normalized <= -10) overallSignal = 'bearish';
  else if (normalized <= -5) overallSignal = 'slightly_bearish';

  return {
    funding,
    openInterest: oi,
    longShortRatio: ls,
    volumeAndVolatility: vol,
    sentimentScore: normalized,
    maxScore: 25,
    overallSignal,
    description: buildSentimentDescription(funding, oi, ls, vol),
  };
}

function buildSentimentDescription(funding, oi, ls, vol) {
  const parts = [];

  if (funding.description) parts.push(funding.description);
  if (oi.description) parts.push(oi.description);
  if (ls.description) parts.push(ls.description);
  if (vol.description) parts.push(vol.description);

  return parts.join(' | ');
}
