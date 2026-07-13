/**
 * Chart Manager — Lightweight Charts (TradingView library)
 */

class ChartManager {
  constructor() {
    this.chart = null;
    this.candleSeries = null;
    this.volumeSeries = null;
    this.ema20Series = null;
    this.ema50Series = null;
    this.upperBand = null;
    this.lowerBand = null;
    this.entryLine = null;
    this.stopLine = null;
    this.tp1Line = null;
    this.tp2Line = null;
    this.supportLines = [];
    this.resistanceLines = [];
  }

  init(container) {
    if (this.chart) {
      this.chart.remove();
    }

    this.chart = LightweightCharts.createChart(container, {
      layout: {
        background: { color: '#1c2128' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#30363d',
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    // Candlestick series
    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: '#3fb950',
      downColor: '#f85149',
      borderUpColor: '#3fb950',
      borderDownColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    });

    // Volume (separate pane)
    this.volumeSeries = this.chart.addHistogramSeries({
      color: '#30363d',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    this.chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // EMA 20
    this.ema20Series = this.chart.addLineSeries({
      color: '#58a6ff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // EMA 50
    this.ema50Series = this.chart.addLineSeries({
      color: '#a371f7',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Bollinger Bands
    this.upperBand = this.chart.addLineSeries({
      color: 'rgba(210, 153, 29, 0.4)',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    this.lowerBand = this.chart.addLineSeries({
      color: 'rgba(210, 153, 29, 0.4)',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    window.addEventListener('resize', () => {
      if (this.chart) {
        this.chart.resize(container.clientWidth, container.clientHeight);
      }
    });
  }

  async loadData(symbol, interval = '4h') {
    const klines = await scannerService.getKlines(symbol, interval, 200);
    if (!klines || klines.length === 0) return;

    const candleData = klines.map(k => ({
      time: k.time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    const volumeData = klines.map(k => ({
      time: k.time,
      value: k.volume,
      color: k.close >= k.open ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)',
    }));

    this.candleSeries.setData(candleData);
    this.volumeSeries.setData(volumeData);

    // Calculate and plot EMAs
    const closes = klines.map(k => k.close);
    const ema20 = this._calcEMA(closes, 20);
    const ema50 = this._calcEMA(closes, 50);

    this.ema20Series.setData(
      klines.slice(19).map((k, i) => ({ time: k.time, value: ema20[i] }))
    );
    this.ema50Series.setData(
      klines.slice(49).map((k, i) => ({ time: k.time, value: ema50[i] }))
    );

    // Bollinger Bands (20,2)
    const bb = this._calcBB(closes, 20, 2);
    const bbStart = klines.slice(19);
    this.upperBand.setData(bbStart.map((k, i) => ({ time: k.time, value: bb.upper[i] })));
    this.lowerBand.setData(bbStart.map((k, i) => ({ time: k.time, value: bb.lower[i] })));

    this.chart.timeScale().fitContent();
  }

  drawLevels(levels) {
    this._clearLevels();

    if (levels.entry) {
      this.entryLine = this.chart.addLineSeries({
        color: '#d2991d',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      this._fillLine(this.entryLine, levels.entry, 'Entry');
    }

    if (levels.stopLoss) {
      this.stopLine = this.chart.addLineSeries({
        color: '#f85149',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      this._fillLine(this.stopLine, levels.stopLoss, 'Stop');
    }

    if (levels.takeProfit1) {
      this.tp1Line = this.chart.addLineSeries({
        color: '#3fb950',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      this._fillLine(this.tp1Line, levels.takeProfit1, 'TP1');
    }

    if (levels.takeProfit2) {
      this.tp2Line = this.chart.addLineSeries({
        color: '#3fb950',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      this._fillLine(this.tp2Line, levels.takeProfit2, 'TP2');
    }

    if (levels.nearestSupport) {
      this.supportLines.push(this._addPriceLine(levels.nearestSupport, '#3fb950', 'Suporte'));
    }
    if (levels.nearestResistance) {
      this.resistanceLines.push(this._addPriceLine(levels.nearestResistance, '#f85149', 'Resistência'));
    }
  }

  _addPriceLine(price, color, text) {
    const series = this.chart.addLineSeries({
      color: color,
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    this._fillLine(series, price, text);
    return series;
  }

  _fillLine(series, price, label) {
    if (!this.chart) return;
    const visRange = this.chart.timeScale().getVisibleLogicalRange();
    if (!visRange) return;
    const from = this.candleSeries.dataByIndex(visRange.from, LightweightCharts.Logical);
    const to = this.candleSeries.dataByIndex(visRange.to, LightweightCharts.Logical);
    if (!from || !to) return;
    series.setData([
      { time: from.time, value: price },
      { time: to.time, value: price },
    ]);
  }

  _clearLevels() {
    const toRemove = [
      this.entryLine, this.stopLine, this.tp1Line, this.tp2Line,
      ...this.supportLines, ...this.resistanceLines,
    ].filter(Boolean);

    toRemove.forEach(s => {
      try { this.chart?.removeSeries(s); } catch (e) { /* ok */ }
    });

    this.entryLine = null;
    this.stopLine = null;
    this.tp1Line = null;
    this.tp2Line = null;
    this.supportLines = [];
    this.resistanceLines = [];
  }

  resize() {
    if (!this.chart) return;
    const container = document.getElementById('detail-chart');
    if (container) {
      this.chart.resize(container.clientWidth, container.clientHeight);
    }
  }

  // ── Indicator calculators ──────────────────────────

  _calcEMA(data, period) {
    const k = 2 / (period + 1);
    const result = [];
    // SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    result.push(sum / period);

    for (let i = period; i < data.length; i++) {
      result.push(data[i] * k + result[result.length - 1] * (1 - k));
    }
    return result;
  }

  _calcBB(data, period, multiplier) {
    const sma = [];
    const upper = [];
    const lower = [];

    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      sma.push(mean);
      upper.push(mean + multiplier * std);
      lower.push(mean - multiplier * std);
    }

    return { sma, upper, lower };
  }
}

const chartManager = new ChartManager();
