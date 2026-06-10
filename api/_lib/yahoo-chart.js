// Símbolos estilo TradingView / catálogo → Yahoo Finance (gráficos v8)

const FX_MAP = {
  'FX:EURUSD': 'EURUSD=X',
  'FX:EURGBP': 'EURGBP=X',
  'FX:EURJPY': 'EURJPY=X',
  'FX:EURCHF': 'EURCHF=X',
  'FX:EURCAD': 'EURCAD=X',
  'FX:EURAUD': 'EURAUD=X',
  'FX:GBPUSD': 'GBPUSD=X',
  'FX:USDJPY': 'USDJPY=X',
  'FX:USDCHF': 'USDCHF=X',
  'FX:AUDUSD': 'AUDUSD=X',
  'FX:USDCAD': 'USDCAD=X',
};

const IDX_MAP = {
  'IBEX:IBEX': '^IBEX',
  'FOREXCOM:SPX500': '^GSPC',
  'FOREXCOM:UK100': '^FTSE',
  'NASDAQ:NDX': '^NDX',
  'NASDAQ:CCMP': '^IXIC',
  'DJ:DJI': '^DJI',
  'STOXX:STOXX50E': '^STOXX50E',
  'INDEX:NKY': '^N225',
  'HSI:HSI': '^HSI',
  'CBOE:VIX': '^VIX',
  'FOREXCOM:RUS2000': '^RUT',
  'FOREXCOM:XAUUSD': 'GC=F',
  'NYMEX:CL1!': 'CL=F',
  'NYMEX:NG1!': 'NG=F',
  'COMEX:SI1!': 'SI=F',
};

/** Símbolo de ruta /chart o catálogo → ticker Yahoo */
export function resolveTvSymbolToYahoo(symbol) {
  const s = String(symbol || '').trim();
  if (!s) return null;

  if (FX_MAP[s]) return FX_MAP[s];
  if (IDX_MAP[s]) return IDX_MAP[s];

  if (/^BINANCE:/i.test(s) || /^COINBASE:/i.test(s) || /^KRAKEN:/i.test(s)) {
    const pair = (s.split(':')[1] || '').toUpperCase();
    if (pair.endsWith('USDT')) return `${pair.slice(0, -4)}-USD`;
    if (pair.endsWith('EUR')) return `${pair.slice(0, -3)}-EUR`;
    return pair.includes('-') ? pair : `${pair}-USD`;
  }

  const bme = s.match(/^(BME|XMAD):(.+)$/i);
  if (bme) return `${bme[2].toUpperCase()}.MC`;

  if (s.includes(':')) {
    const tick = s.split(':').pop();
    if (tick && /^[A-Z0-9.-]{1,12}$/i.test(tick)) return tick.toUpperCase();
  }

  if (s.startsWith('^') || /=X$/i.test(s) || /-USD$/i.test(s) || /=F$/i.test(s)) {
    return s;
  }

  return s;
}

/** Candidatos alternativos si el primario no devuelve datos (BME, etc.) */
export function yahooSymbolFallbacks(yahooSymbol) {
  const out = [yahooSymbol];
  if (yahooSymbol && !yahooSymbol.endsWith('.MC') && /^[A-Z]{2,6}$/.test(yahooSymbol)) {
    out.push(`${yahooSymbol}.MC`);
  }
  return [...new Set(out)];
}

export function resolutionToYahooInterval(resolution) {
  const r = String(resolution || 'D').toUpperCase();
  if (r === 'D' || r === '1D') return '1d';
  if (r === '60' || r === '1H') return '1h';
  if (r === '15' || r === '15M') return '15m';
  if (r === '5' || r === '5M') return '5m';
  return '1d';
}

/**
 * OHLC desde Yahoo Finance v8 (period1/period2 en segundos UNIX).
 * @returns {{ candles: object[], yahooSymbol: string } | null}
 */
export async function fetchYahooCandles(yahooSymbol, fromUnix, toUnix, resolution) {
  const interval = resolutionToYahooInterval(resolution);
  const period1 = Math.floor(fromUnix);
  const period2 = Math.floor(toUnix);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
    `?period1=${period1}&period2=${period2}&interval=${encodeURIComponent(interval)}`;

  const r = await fetch(url, {
    headers: { 'User-Agent': 'lente-markets/1.0 (educational reference)' },
  });
  if (!r.ok) return null;

  let j;
  try {
    j = await r.json();
  } catch {
    return null;
  }

  const result = j.chart?.result?.[0];
  if (!result) return null;

  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const opens = q.open || [];
  const highs = q.high || [];
  const lows = q.low || [];
  const closes = q.close || [];
  const volumes = q.volume || [];

  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (close == null || Number.isNaN(+close)) continue;
    candles.push({
      time: ts[i],
      open: opens[i] != null ? +opens[i] : +close,
      high: highs[i] != null ? +highs[i] : +close,
      low: lows[i] != null ? +lows[i] : +close,
      close: +close,
      volume: volumes[i] != null ? +volumes[i] : null,
    });
  }

  if (!candles.length) return null;
  return { candles, yahooSymbol };
}
