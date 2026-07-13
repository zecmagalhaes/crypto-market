/**
 * Scoring Engine — calcula score composto 0-100
 * Combinando estrutura, momentum, volume e sentimento
 */

import { RSI, MACD, EMA, BollingerBands, VWAP, ATR, SMA, findSwings } from './indicators.js';
import { analyzeStructure } from './structure.js';
import { analyzeSentiment } from './sentiment.js';

// ── Score de Estrutura (0-30) ─────────────────────────

function scoreStructure(klines) {
  const structure = analyzeStructure(klines);
  let score = 0;
  const details = [];

  // Tendência (0-15 pts)
  switch (structure.trend) {
    case 'bullish':
      score += 15;
      details.push('Tendência bullish (HH+HL)');
      break;
    case 'leaning_bullish':
      score += 10;
      details.push('Tendência levemente bullish');
      break;
    case 'neutral':
    case 'consolidation':
      score += 7;
      details.push('Consolidação/neutro');
      break;
    case 'leaning_bearish':
      score += 4;
      details.push('Tendência levemente bearish');
      break;
    case 'bearish':
      score += 0;
      details.push('Tendência bearish (LH+LL)');
      break;
  }

  // BOS recente (0-8 pts)
  const recentBos = structure.recentBos;
  const hasBosBullish = recentBos.some(b => b.type === 'bullish');
  const hasBosBearish = recentBos.some(b => b.type === 'bearish');

  if (hasBosBullish && !hasBosBearish) {
    score += 8;
    details.push('BOS bullish recente');
  } else if (hasBosBearish && !hasBosBullish) {
    score += 0;
    details.push('BOS bearish recente');
  } else if (hasBosBullish && hasBosBearish) {
    score += 4;
    details.push('BOS misto — indecisão');
  }

  // CHoCH recente (0-5 pts)
  if (structure.recentChoch.length > 0) {
    const choch = structure.recentChoch[0];
    if (choch.type === 'bullish') {
      score += 5;
      details.push('CHoCH bullish — possível reversão');
    } else {
      score += 0;
      details.push('CHoCH bearish — possível reversão');
    }
  }

  // Sweeps de liquidez (0-2 pts)
  if (structure.recentSweeps.some(s => s.type === 'bullish_sweep')) {
    score += 2;
    details.push('Liquidity sweep bullish detectado');
  } else if (structure.recentSweeps.some(s => s.type === 'bearish_sweep')) {
    score -= 2;
    details.push('Liquidity sweep bearish detectado');
  }

  return {
    score: Math.max(0, Math.min(30, score)),
    maxScore: 30,
    details,
    structure,
  };
}

// ── Score de Momentum (0-25) ──────────────────────────

function scoreMomentum(klines) {
  const closes = klines.map(k => k.close);
  const last = closes.length - 1;
  let score = 0;
  const details = [];

  // RSI (0-10 pts)
  const rsi = RSI(closes, 14);
  const lastRSI = rsi[last];

  if (lastRSI !== null) {
    if (lastRSI < 30) {
      score += 10;
      details.push(`RSI oversold (${lastRSI.toFixed(1)}) — forte sinal de compra`);
    } else if (lastRSI < 40) {
      score += 7;
      details.push(`RSI baixo (${lastRSI.toFixed(1)}) — zona de compra`);
    } else if (lastRSI < 50) {
      score += 5;
      details.push(`RSI neutro-baixo (${lastRSI.toFixed(1)})`);
    } else if (lastRSI < 60) {
      score += 3;
      details.push(`RSI neutro-alto (${lastRSI.toFixed(1)})`);
    } else if (lastRSI < 70) {
      score += 1;
      details.push(`RSI alto (${lastRSI.toFixed(1)}) — cautela`);
    } else {
      score += 0;
      details.push(`RSI overbought (${lastRSI.toFixed(1)}) — risco de venda`);
    }
  }

  // MACD (0-8 pts)
  const macd = MACD(closes);
  const lastMacd = macd.macdLine[last];
  const lastSignal = macd.signalLine[last];
  const lastHist = macd.histogram[last];

  if (lastMacd !== null && lastSignal !== null) {
    const prevHist = last > 0 ? macd.histogram[last - 1] : null;

    if (lastMacd > lastSignal && lastHist > 0) {
      // MACD bullish e histograma crescendo
      if (prevHist !== null && lastHist > prevHist) {
        score += 8;
        details.push('MACD bullish com momentum crescendo');
      } else {
        score += 6;
        details.push('MACD bullish com momentum diminuindo');
      }
    } else if (lastMacd > lastSignal) {
      score += 4;
      details.push('MACD bullish (linha > sinal) mas histograma negativo');
    } else if (lastMacd < lastSignal && lastHist < 0) {
      if (prevHist !== null && lastHist < prevHist) {
        score += 0;
        details.push('MACD bearish com momentum crescendo');
      } else {
        score += 2;
        details.push('MACD bearish mas histograma melhorando (divergência)');
      }
    } else {
      score += 1;
      details.push('MACD bearish');
    }
  }

  // EMA Alignment (0-7 pts)
  const ema20 = EMA(closes, 20);
  const ema50 = EMA(closes, 50);
  const ema200 = EMA(closes, 200);

  const e20 = ema20[last];
  const e50 = ema50[last];
  const e200 = ema200[last];

  if (e20 && e50 && e200) {
    if (e20 > e50 && e50 > e200 && closes[last] > e20) {
      score += 7;
      details.push('EMAs alinhadas (20>50>200) + preço acima — tendência forte');
    } else if (e20 > e50 && closes[last] > e20) {
      score += 5;
      details.push('Preço acima das EMAs 20 e 50');
    } else if (closes[last] > e50 && closes[last] > e200) {
      score += 3;
      details.push('Preço acima das EMAs 50 e 200');
    } else if (e20 < e50 && e50 < e200) {
      score += 0;
      details.push('EMAs bearish (20<50<200)');
    } else {
      score += 2;
      details.push('EMAs sem alinhamento claro');
    }
  } else if (e20 && e50) {
    if (e20 > e50 && closes[last] > e20) {
      score += 4;
      details.push('Preço acima das EMAs 20 e 50');
    } else if (e20 < e50) {
      score += 1;
      details.push('EMA 20 abaixo da 50');
    } else {
      score += 2;
    }
  }

  return {
    score: Math.max(0, Math.min(25, score)),
    maxScore: 25,
    details,
    indicators: { rsi: lastRSI, macd: lastMacd, signalLine: lastSignal, histogram: lastHist },
  };
}

// ── Score de Volume (0-20) ────────────────────────────

function scoreVolume(klines) {
  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  const last = klines.length - 1;
  let score = 0;
  const details = [];

  // Volume médio
  const volMA = SMA(volumes, 20);
  const avgVol = volMA[last] || 0;
  const recentVol = volumes.slice(-5);
  const recentAvg = recentVol.reduce((a, b) => a + b, 0) / recentVol.length;

  let volumeSpike = false;
  if (avgVol > 0 && recentAvg > avgVol * 1.5) {
    volumeSpike = true;
  }

  // VWAP
  const vwap = VWAP(klines);
  const lastVWAP = vwap[last];
  const lastPrice = closes[last];

  // Bollinger Bands
  const bb = BollingerBands(closes);

  // 1. Confirmação de volume na direção do movimento (0-10 pts)
  const priceGoingUp = closes[last] > closes[last - 10];
  if (volumeSpike && priceGoingUp) {
    score += 10;
    details.push('Volume alto confirmando alta — acumulação');
  } else if (volumeSpike && !priceGoingUp) {
    score += 3;
    details.push('Volume alto na queda — possível distribuição');
  } else if (volumeSpike) {
    score += 5;
    details.push('Volume acima da média');
  } else {
    score += 4;
    details.push('Volume normal');
  }

  // 2. VWAP (0-5 pts)
  if (lastVWAP !== null && lastPrice > lastVWAP) {
    score += 5;
    details.push(`Preço acima do VWAP (${lastVWAP.toFixed(2)})`);
  } else if (lastVWAP !== null) {
    score += 2;
    details.push(`Preço abaixo do VWAP (${lastVWAP.toFixed(2)})`);
  }

  // 3. Bollinger squeeze/expansion (0-5 pts)
  const lastBandwidth = bb.bandwidth[last];
  const prevBandwidthIdx = last - 20;
  const prevBandwidth = prevBandwidthIdx >= 0 ? bb.bandwidth[prevBandwidthIdx] : null;
  if (lastBandwidth !== null && prevBandwidth !== null) {
    if (lastBandwidth < prevBandwidth * 0.7) {
      // Squeeze — volatilidade comprimindo, breakout iminente
      score += 3;
      details.push('Bollinger squeeze — possível breakout iminente');

      // Se preço tá perto da banda superior no squeeze = bullish bias
      if (lastPrice > bb.sma[last]) {
        score += 2;
        details.push('Preço acima da média no squeeze — viés altista');
      }
    } else if (lastBandwidth > prevBandwidth * 1.5) {
      score += 2;
      details.push('Bollinger expansion — volatilidade alta');
    } else {
      score += 1;
      details.push('Bollinger bands normais');
    }
  }

  return {
    score: Math.max(0, Math.min(20, score)),
    maxScore: 20,
    details,
    indicators: { vwap: lastVWAP, avgVol, recentAvg, volumeSpike, bbUpper: bb.upper[last], bbLower: bb.lower[last], bbSMA: bb.sma[last] },
  };
}

// ── Níveis de Entrada / Stop / Alvo ──────────────────

function calculateLevels(klines, trend) {
  const closes = klines.map(k => k.close);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const last = klines.length - 1;
  const lastPrice = closes[last];

  // ATR para volatilidade
  const atrResult = ATR(klines, 14);
  const atrVal = atrResult.atr[last] || lastPrice * 0.01;

  // Suporte e resistência por swing points
  const lookback = 10;
  const { swingHighs, swingLows } = findSwings(highs, lows, lookback);

  // Suporte: low mais próximo abaixo do preço
  const supports = swingLows
    .filter(l => l.price < lastPrice)
    .sort((a, b) => b.price - a.price);
  const nearestSupport = supports.length > 0 ? supports[0].price : lastPrice - atrVal * 2;

  // Resistência: high mais próximo acima do preço
  const resistances = swingHighs
    .filter(h => h.price > lastPrice)
    .sort((a, b) => a.price - b.price);
  const nearestResistance = resistances.length > 0 ? resistances[0].price : lastPrice + atrVal * 2;

  // EMAs como suporte/resistência dinâmico
  const ema20Arr = EMA(closes, 20);
  const ema50Arr = EMA(closes, 50);
  const ema20 = ema20Arr[last];
  const ema50 = ema50Arr[last];

  let entry, stopLoss, takeProfit1, takeProfit2;

  if (trend === 'bullish' || trend === 'leaning_bullish') {
    // Compra: entrada no pullback até suporte, stop abaixo, TP na resistência
    entry = lastPrice;
    stopLoss = Math.min(nearestSupport - atrVal * 0.5, (ema20 || nearestSupport) - atrVal * 0.5);
    takeProfit1 = nearestResistance;
    takeProfit2 = nearestResistance + atrVal;
  } else if (trend === 'bearish' || trend === 'leaning_bearish') {
    // Venda: entrada no rally até resistência, stop acima, TP no suporte
    entry = lastPrice;
    stopLoss = Math.max(nearestResistance + atrVal * 0.5, (ema20 || nearestResistance) + atrVal * 0.5);
    takeProfit1 = nearestSupport;
    takeProfit2 = nearestSupport - atrVal;
  } else {
    // Neutro: range trading
    entry = lastPrice;
    stopLoss = nearestSupport - atrVal * 0.5;
    takeProfit1 = nearestResistance;
    takeProfit2 = nearestResistance + atrVal * 0.5;
  }

  return {
    entry,
    stopLoss,
    takeProfit1,
    takeProfit2,
    atr: atrVal,
    nearestSupport,
    nearestResistance,
    ema20,
    ema50,
  };
}

// ── Score Final (0-100) ───────────────────────────────

export async function calculateScore(symbol, klines4h, klines1d) {
  // Scores separados por timeframe
  const structure4h = scoreStructure(klines4h);
  const momentum4h = scoreMomentum(klines4h);
  const volume4h = scoreVolume(klines4h);

  const structure1d = scoreStructure(klines1d);

  // Sentimento (independente de timeframe)
  const sentiment = await analyzeSentiment(symbol);

  // Pesos:
  // 4H structure: 15 pts
  // 4H momentum: 15 pts
  // 4H volume: 10 pts
  // 1D structure: 15 pts
  // Sentiment: 25 pts
  // Confluence bonus: 0-20 pts

  const rawStructure4h = (structure4h.score / 30) * 15;
  const rawMomentum = (momentum4h.score / 25) * 15;
  const rawVolume = (volume4h.score / 20) * 10;
  const rawStructure1d = (structure1d.score / 30) * 15;
  const rawSentiment = ((sentiment.sentimentScore + 25) / 50) * 25; // normaliza de -25..25 para 0..25

  // Arredonda cada raw score para consistência entre barras e total
  const rStructure4h = Math.round(rawStructure4h);
  const rMomentum = Math.round(rawMomentum);
  const rVolume = Math.round(rawVolume);
  const rStructure1d = Math.round(rawStructure1d);
  const rSentiment = Math.round(rawSentiment);

  let total = rStructure4h + rMomentum + rVolume + rStructure1d + rSentiment;

  // Bônus de confluência: se 4H e 1D concordam
  const bothBullish = structure4h.structure.trend.includes('bull') && structure1d.structure.trend.includes('bull');
  const bothBearish = structure4h.structure.trend.includes('bear') && structure1d.structure.trend.includes('bear');

  let confluenceBonus = 0;
  if (bothBullish) {
    confluenceBonus = 10;
  } else if (bothBearish) {
    confluenceBonus = 0; // bearish não ganha bônus, só perde
  } else if (structure4h.structure.trend === 'bullish' || structure4h.structure.trend === 'leaning_bullish') {
    confluenceBonus = 3;
  }

  total = Math.min(100, total + confluenceBonus);

  // Arredonda
  total = Math.round(total);

  // Determina sinal
  let signal, action, emoji;
  if (total >= 75) {
    signal = 'COMPRA FORTE';
    action = 'buy';
    emoji = '🟢';
  } else if (total >= 60) {
    signal = 'COMPRA';
    action = 'buy';
    emoji = '🟡';
  } else if (total >= 50) {
    signal = 'NEUTRO (viés de compra)';
    action = 'watch';
    emoji = '⚪';
  } else if (total >= 40) {
    signal = 'NEUTRO';
    action = 'watch';
    emoji = '⚪';
  } else if (total >= 30) {
    signal = 'NEUTRO (viés de venda)';
    action = 'watch';
    emoji = '⚪';
  } else if (total >= 20) {
    signal = 'VENDA';
    action = 'sell';
    emoji = '🔴';
  } else {
    signal = 'VENDA FORTE';
    action = 'sell';
    emoji = '🔴';
  }

  // Níveis
  const trend = structure4h.structure.trend;
  const levels = calculateLevels(klines4h, trend);

  return {
    score: total,
    signal,
    action,
    emoji,
    breakdown: {
      structure4h: { ...structure4h, rawScore: rStructure4h },
      momentum: { ...momentum4h, rawScore: rMomentum },
      volume: { ...volume4h, rawScore: rVolume },
      structure1d: { ...structure1d, rawScore: rStructure1d },
      sentiment: { ...sentiment, rawScore: rSentiment },
      confluenceBonus,
    },
    levels,
    lastPrice: klines4h[klines4h.length - 1].close,
  };
}
