#!/usr/bin/env node

/**
 * Crypto Scanner — Scanner multi-fator para trading
 * Uso: node index.js [--symbol BTCUSDT] [--tf 4h] [--simple]
 *
 * Analisa estrutura de mercado + momentum + volume + sentimento
 * e gera sinal de trade com níveis de entrada/stop/alvo.
 */

import { getKlines, getPrice } from './src/binance.js';
import { calculateScore } from './src/scorer.js';
import { EMA, RSI, MACD, BollingerBands, ATR } from './src/indicators.js';

// ── CLI ───────────────────────────────────────────────

const args = process.argv.slice(2);
const params = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
    params[key] = val;
    if (val !== true) i++;
  } else if (args[i].startsWith('-')) {
    const key = args[i].slice(1);
    const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
    params[key] = val;
    if (val !== true) i++;
  }
}

const symbol = params.symbol || params.s || 'BTCUSDT';
const simpleOutput = params.simple || params.q || false;
const watchMode = params.watch || params.w || false;

// ── Colors ────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
};

// ── Formatters ────────────────────────────────────────

function pct(v) {
  if (v === null || v === undefined) return 'N/A';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

function usd(v) {
  if (v === null || v === undefined) return 'N/A';
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (v < 0.01) return '$' + v.toPrecision(4);
  if (v < 1) return '$' + v.toFixed(4);
  return '$' + v.toFixed(2);
}

function bar(value, max, width = 20) {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  let color = C.green;
  if (value / max < 0.4) color = C.red;
  else if (value / max < 0.6) color = C.yellow;
  return color + '█'.repeat(filled) + C.dim + '░'.repeat(empty) + C.reset;
}

// ── Render ────────────────────────────────────────────

function renderSimple(result) {
  console.log(`${result.emoji} ${symbol} | Score: ${result.score}/100 | ${result.signal}`);
  console.log(`   Preço: ${usd(result.lastPrice)}`);
  console.log(`   Entrada: ${usd(result.levels.entry)} | Stop: ${usd(result.levels.stopLoss)} | TP1: ${usd(result.levels.takeProfit1)}`);
}

function renderFull(result) {
  const b = result.breakdown;
  const l = result.levels;
  const tp1Pct = ((l.takeProfit1 - l.entry) / l.entry * 100);
  const slPct = ((l.stopLoss - l.entry) / l.entry * 100);
  const rr = Math.abs(tp1Pct / slPct);

  console.log('');
  console.log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║${C.reset}  ${C.bold}CRYPTO SCANNER — ${symbol}${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log('');

  // Score principal
  const scoreColor = result.score >= 60 ? C.green : result.score >= 40 ? C.yellow : C.red;
  const scoreBg = result.score >= 75 ? C.bgGreen : result.score >= 60 ? C.bgYellow : result.score < 30 ? C.bgRed : '';
  console.log(`  ${scoreBg}${C.bold}  SCORE: ${result.score}/100  ${C.reset}  ${scoreColor}${result.signal}${C.reset}`);
  console.log(`  Preço atual: ${C.bold}${usd(result.lastPrice)}${C.reset}`);
  console.log('');

  // Barras de breakdown
  console.log(`  ${C.dim}─── Breakdown ───────────────────────────────────────${C.reset}`);
  console.log(`  Estrutura 4H  ${bar(b.structure4h.rawScore, 15)} ${b.structure4h.rawScore}/15`);
  console.log(`  Momentum 4H   ${bar(b.momentum.rawScore, 15)} ${b.momentum.rawScore}/15`);
  console.log(`  Volume 4H     ${bar(b.volume.rawScore, 10)} ${b.volume.rawScore}/10`);
  console.log(`  Estrutura 1D  ${bar(b.structure1d.rawScore, 15)} ${b.structure1d.rawScore}/15`);
  console.log(`  Sentimento    ${bar(b.sentiment.rawScore, 25)} ${b.sentiment.rawScore}/25`);
  if (b.confluenceBonus > 0) {
    console.log(`  Confluência   ${C.green}+${b.confluenceBonus} pts${C.reset} (4H e 1D alinhados)`);
  }
  console.log('');

  // Detalhes por categoria
  console.log(`  ${C.bold}📊 Estrutura de Mercado${C.reset}`);
  console.log(`     Tendência 4H: ${b.structure4h.structure.trend} | Δ preço: ${pct(b.structure4h.structure.priceChangePercent)}`);
  for (const d of b.structure4h.details) {
    console.log(`     ${C.dim}→${C.reset} ${d}`);
  }
  console.log(`     Tendência 1D: ${b.structure1d.structure.trend} | Δ preço: ${pct(b.structure1d.structure.priceChangePercent)}`);
  for (const d of b.structure1d.details) {
    console.log(`     ${C.dim}→${C.reset} ${d}`);
  }
  console.log('');

  console.log(`  ${C.bold}📈 Momentum${C.reset}`);
  for (const d of b.momentum.details) {
    console.log(`     ${C.dim}→${C.reset} ${d}`);
  }
  console.log('');

  console.log(`  ${C.bold}📊 Volume${C.reset}`);
  for (const d of b.volume.details) {
    console.log(`     ${C.dim}→${C.reset} ${d}`);
  }
  console.log('');

  console.log(`  ${C.bold}🧠 Sentimento (Futures)${C.reset}`);
  console.log(`     ${b.sentiment.description}`);
  console.log('');

  // Níveis de trade
  console.log(`  ${C.bold}🎯 Níveis de Trade${C.reset}`);
  console.log(`     Entrada:     ${C.cyan}${usd(l.entry)}${C.reset}`);
  console.log(`     Stop Loss:   ${C.red}${usd(l.stopLoss)}${C.reset} (${pct(slPct)})`);
  console.log(`     Take Profit: ${C.green}${usd(l.takeProfit1)}${C.reset} (${pct(tp1Pct)})`);
  console.log(`     TP Extendido:${C.green}${usd(l.takeProfit2)}${C.reset}`);
  console.log(`     R:R (TP1):   ${C.bold}${rr >= 1.5 ? C.green : C.yellow}1:${rr.toFixed(1)}${C.reset}`);
  console.log(`     ATR(14):    ${usd(l.atr)}`);
  console.log(`     Suporte:    ${usd(l.nearestSupport)} | Resistência: ${usd(l.nearestResistance)}`);
  console.log(`     EMA20:      ${usd(l.ema20)} | EMA50: ${usd(l.ema50)}`);
  console.log('');

  // Disclaimer
  console.log(`  ${C.dim}⚠️  Isto NÃO é recomendação financeira. Faça sua própria análise.${C.reset}`);
  console.log(`  ${C.dim}   Gerado em ${new Date().toISOString()}${C.reset}`);
  console.log('');
}

// ── Main ──────────────────────────────────────────────

async function main() {
  console.log(`${C.dim}🔍 Buscando dados da Binance para ${symbol}...${C.reset}`);

  try {
    // Busca dados paralelos
    const [klines4h, klines1d, price] = await Promise.all([
      getKlines(symbol, '4h', 100),
      getKlines(symbol, '1d', 100),
      getPrice(symbol),
    ]);

    if (klines4h.length < 50 || klines1d.length < 50) {
      console.error(`${C.red}❌ Dados insuficientes da Binance${C.reset}`);
      process.exit(1);
    }

    const result = await calculateScore(symbol, klines4h, klines1d);
    result.lastPrice = price;

    if (simpleOutput) {
      renderSimple(result);
    } else {
      renderFull(result);
    }

    // Retorna score como exit code pra scripting
    if (result.score >= 60) process.exit(0);
    else if (result.score >= 40) process.exit(1);
    else process.exit(2);

  } catch (err) {
    console.error(`${C.red}❌ Erro: ${err.message}${C.reset}`);
    process.exit(3);
  }
}

main();
