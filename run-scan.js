#!/usr/bin/env node

/**
 * Runner script para cron — saída otimizada pra Telegram
 * com recomendação em linguagem clara pra leigos
 * Uso: node run-scan.js BTCUSDT
 */

import { getKlines, getPrice } from './src/binance.js';
import { calculateScore } from './src/scorer.js';

const symbol = process.argv[2] || 'BTCUSDT';

function usd(v) {
  if (v === null || v === undefined) return 'N/A';
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (v < 0.01) return v.toPrecision(4);
  if (v < 1) return '$' + v.toFixed(4);
  return '$' + v.toFixed(2);
}

function pct(v) {
  if (v === null || v === undefined) return 'N/A';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

function scoreEmoji(score) {
  if (score >= 75) return '🟢';
  if (score >= 60) return '🟡';
  if (score >= 40) return '⚪';
  return '🔴';
}

/**
 * Gera recomendação em português claro, sem jargão.
 * Baseada no score, breakdown e níveis de trade.
 */
function generateRecommendation(result, rr, tp1Pct, slPct) {
  const b = result.breakdown;
  const trend4h = b.structure4h?.structure?.trend;
  const trend1d = b.structure1d?.structure?.trend;
  const aligned = b.confluenceBonus > 0;
  const sentimentDesc = b.sentiment?.description || '';
  const moeda = symbol.replace('USDT', '');

  // Extrai o sinal dominante do sentimento
  const sentimentBullish = /bullish|compra|long|positiv/i.test(sentimentDesc);
  const sentimentBearish = /bearish|venda|short|negativ/i.test(sentimentDesc);

  // Razões a favor
  const pros = [];
  if (aligned) pros.push('tendências de 4H e 1D estão alinhadas');
  if (trend4h === 'bullish') pros.push('curto prazo (4H) em tendência de alta');
  if (trend1d === 'bullish') pros.push('médio prazo (1D) em tendência de alta');
  if (rr >= 1.5) pros.push(`boa relação risco-retorno (1:${rr.toFixed(1)})`);
  if (rr >= 2) pros.push(`excelente relação risco-retorno (1:${rr.toFixed(1)})`);
  if (sentimentBullish) pros.push('sentimento do mercado está positivo');

  // Razões contra
  const cons = [];
  if (trend4h === 'bearish') cons.push('curto prazo (4H) em tendência de baixa');
  if (trend1d === 'bearish') cons.push('médio prazo (1D) em tendência de baixa');
  if (rr < 1) cons.push(`risco maior que o retorno (1:${rr.toFixed(1)}, TP menor que o stop)`);
  if (rr < 1.5 && rr >= 1) cons.push(`relação risco-retorno baixa (1:${rr.toFixed(1)})`);
  if (sentimentBearish) cons.push('sentimento do mercado está negativo');

  // Se nada específico, usar descrição genérica
  if (pros.length === 0 && cons.length === 0) {
    if (result.score >= 60) pros.push('score elevado indica força nos indicadores técnicos');
    else if (result.score < 40) cons.push('score baixo indica fraqueza nos indicadores técnicos');
    else {
      pros.push('mercado sem direção clara no momento');
      cons.push('mercado sem direção clara no momento');
    }
  }

  // Gera o veredito
  if (result.score >= 75) {
    const razao = pros.slice(0, 2).join(' e ');
    return `🟢 <b>BOA OPORTUNIDADE em ${moeda}</b>\n` +
      `✅ <b>Por que entrar:</b> ${razao}.\n` +
      `💰 Ganho potencial de <b>+${tp1Pct.toFixed(1)}%</b> com risco de <b>${slPct.toFixed(1)}%</b>.\n` +
      (cons.length ? `⚠️ Atenção: ${cons[0]}.` : `✅ Sem pontos de atenção relevantes.`);
  }

  if (result.score >= 60) {
    const razao = pros.slice(0, 2).join(' e ');
    const cuidado = cons.slice(0, 1).join('; ');
    return `🟡 <b>OPORTUNIDADE MODERADA em ${moeda}</b>\n` +
      `✅ <b>Motivo:</b> ${razao}.\n` +
      (cuidado ? `⚠️ <b>Cuidado:</b> ${cuidado}.` : '') + '\n' +
      `💰 Potencial de <b>+${tp1Pct.toFixed(1)}%</b>, risco de <b>${slPct.toFixed(1)}%</b>.`;
  }

  if (result.score >= 40) {
    const motivos = cons.length ? cons.slice(0, 2).join(' e ') : 'indicadores não mostram força suficiente';
    return `⚪ <b>NEUTRO — ${moeda} não é oportunidade agora</b>\n` +
      `📉 <b>Por que esperar:</b> ${motivos}.\n` +
      (pros.length ? `📈 <b>Ponto positivo:</b> ${pros[0]}. Mas ainda não é suficiente.` : '') + '\n' +
      `⏳ Melhor aguardar o próximo ciclo de análise.`;
  }

  // Score < 40
  const motivos = cons.slice(0, 2).join(' e ');
  return `🔴 <b>EVITAR ${moeda} agora</b>\n` +
    `🚫 <b>Motivo:</b> ${motivos || 'score muito baixo, indicadores todos apontam contra'}.\n` +
    `⚠️ Risco elevado de perda. Não é momento de entrada.`;
}

async function main() {
  try {
    const [klines4h, klines1d, price] = await Promise.all([
      getKlines(symbol, '4h', 100),
      getKlines(symbol, '1d', 100),
      getPrice(symbol),
    ]);

    if (klines4h.length < 50 || klines1d.length < 50) {
      console.log(`❌ ${symbol}: dados insuficientes`);
      process.exit(1);
    }

    const result = await calculateScore(symbol, klines4h, klines1d);
    result.lastPrice = price;

    const l = result.levels;
    const tp1Pct = ((l.takeProfit1 - l.entry) / l.entry * 100);
    const slPct = ((l.stopLoss - l.entry) / l.entry * 100);
    const rr = Math.abs(tp1Pct / slPct);
    const e = scoreEmoji(result.score);

    const recommendation = generateRecommendation(result, rr, tp1Pct, slPct);

    // Saída formatada pra Telegram
    const lines = [
      `${e} <b>${symbol}</b> — Score: <b>${result.score}/100</b>`,
      `💰 Preço: ${usd(result.lastPrice)}`,
      ``,
      `<b>🧭 Recomendação</b>`,
      recommendation,
      ``,
      `<b>🎯 Níveis Técnicos</b>`,
      `Entrada: ${usd(l.entry)}`,
      `Stop: ${usd(l.stopLoss)} (${pct(slPct)})`,
      `Alvo 1: ${usd(l.takeProfit1)} (${pct(tp1Pct)})`,
      `Alvo 2: ${usd(l.takeProfit2)}`,
      `R:R: 1:${rr.toFixed(1)} | Volatilidade (ATR): ${usd(l.atr)}`,
      ``,
      `<b>📊 Detalhes Técnicos</b>`,
      `Tendência 4H: ${result.breakdown.structure4h.structure.trend}`,
      `Tendência 1D: ${result.breakdown.structure1d.structure.trend}`,
      `${result.breakdown.sentiment.description}`,
      ``,
      `<i>⚠️ Não é recomendação financeira. Análise automatizada — sempre confira antes de operar.</i>`,
      `<i>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</i>`,
    ];

    console.log(lines.join('\n'));
    process.exit(0);
  } catch (err) {
    console.log(`❌ ${symbol}: ${err.message}`);
    process.exit(1);
  }
}

main();
