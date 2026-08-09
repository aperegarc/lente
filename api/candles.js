// ============================================================
// /api/candles.js — velas OHLCV vía API pública Yahoo Finance v8
// GET ?symbol=...&resolution=15|60|D&from=<unix>&to=<unix>
// ============================================================

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** Símbolo estilo TradingView / app → ticker Yahoo */
function resolveYahooSymbol(tvSymbol) {
  const s = String(tvSymbol || '').trim();
  if (!s) return null;

  if (/^BINANCE:/i.test(s) || /^COINBASE:/i.test(s) || /^KRAKEN:/i.test(s) || /^CRYPTO:/i.test(s)) {
    const raw = (s.split(':')[1] || '').trim();
    if (/USDT$/i.test(raw)) {
      const base = raw.replace(/USDT$/i, '');
      return `${base}-USD`;
    }
    if (/-USD$/i.test(raw)) return raw;
    return raw.includes('-') ? raw : `${raw}-USD`;
  }

  const fxMap = {
    'FX:EURUSD': 'EURUSD=X',
    'FX:GBPUSD': 'GBPUSD=X',
    'FX:USDJPY': 'JPY=X',
    'FX:USDCHF': 'CHF=X',
    'FX:AUDUSD': 'AUDUSD=X',
    'FX:USDCAD': 'CAD=X',
  };
  if (fxMap[s]) return fxMap[s];

  const idxMap = {
    'IBEX:IBEX': '^IBEX',
    'FOREXCOM:SPX500': '^GSPC',
    'NASDAQ:CCMP': '^IXIC',
    'STOXX:STOXX50E': '^STOXX50E',
  };
  if (idxMap[s]) return idxMap[s];

  const bme = s.match(/^(BME|XMAD):(.+)$/i);
  if (bme) return `${bme[2].toUpperCase()}.MC`;

  if (s.includes(':')) {
    const tick = s.split(':').pop();
    return tick || s;
  }

  return s;
}

function mapResolutionToYahooInterval(resolution) {
  const r = String(resolution || '60');
  if (r === 'D' || r === '1D') return '1d';
  if (r === '60' || r === '1h') return '1h';
  if (r === '30') return '30m';
  if (r === '15') return '15m';
  if (r === '5') return '5m';
  if (r === '1') return '1m';
  return '15m';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  let symbol = req.query.symbol;
  const resolution = String(req.query.resolution || '60');
  const from = Number(req.query.from);
  const to = Number(req.query.to);

  if (symbol == null || symbol === '') {
    return res.status(400).json({ error: 'Falta symbol' });
  }
  try {
    symbol = decodeURIComponent(String(symbol));
  } catch (_) {
    /* usar tal cual */
  }

  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return res.status(400).json({ error: 'Rango from/to inválido' });
  }

  const yahooSym = resolveYahooSymbol(symbol);
  if (!yahooSym) return res.status(400).json({ error: 'Símbolo inválido' });

  const fromI = Math.floor(from);
  const toI = Math.floor(to);
  const interval = mapResolutionToYahooInterval(resolution);

  const url = `${YAHOO_CHART}/${encodeURIComponent(yahooSym)}?period1=${fromI}&period2=${toI}&interval=${encodeURIComponent(interval)}`;

  let r;
  try {
    r = await fetch(url, {
      headers: { 'User-Agent': 'lente-candles/1.0 (educational; serverless)' },
    });
  } catch (e) {
    return res.status(502).json({ error: 'Red Yahoo Finance', detail: e.message });
  }

  let j;
  try {
    j = await r.json();
  } catch {
    return res.status(502).json({ error: 'Respuesta Yahoo no JSON' });
  }

  if (!r.ok) {
    return res.status(502).json({
      error: 'Yahoo Finance rechazó la petición',
      httpStatus: r.status,
      detail: j?.chart?.error?.description || `HTTP ${r.status}`,
    });
  }

  const result = j.chart?.result?.[0];
  const err = j.chart?.error;
  if (err) {
    return res.status(200).json({
      ok: false,
      status: 'error',
      candles: [],
      symbol: yahooSym,
      source: 'yahoo',
      detail: err.description || String(err),
    });
  }

  if (!result) {
    return res.status(200).json({
      ok: true,
      status: 'no_data',
      candles: [],
      symbol: yahooSym,
      source: 'yahoo',
    });
  }

  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const opens = q.open || [];
  const highs = q.high || [];
  const lows = q.low || [];
  const closes = q.close || [];
  const vols = q.volume || [];

  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (o == null && h == null && l == null && c == null) continue;
    if (c == null && o == null) continue;
    candles.push({
      time: ts[i],
      open: o != null ? +o : +c,
      high: h != null ? +h : Math.max(+(o || c), +(c || o)),
      low: l != null ? +l : Math.min(+(o || c), +(c || o)),
      close: c != null ? +c : +o,
      volume: vols[i] != null && !Number.isNaN(+vols[i]) ? +vols[i] : null,
    });
  }

  if (candles.length === 0) {
    return res.status(200).json({
      ok: true,
      status: 'no_data',
      candles: [],
      symbol: yahooSym,
      source: 'yahoo',
    });
  }

  return res.status(200).json({
    ok: true,
    status: 'ok',
    candles,
    symbol: yahooSym,
    source: 'yahoo',
  });
}
