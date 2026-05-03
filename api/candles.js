// ============================================================
// /api/candles.js — velas solo desde Finnhub (clave en servidor)
// GET ?symbol=...&resolution=60&from=<unix>&to=<unix>
// Endpoints Finnhub: /stock/candle | /crypto/candle | /forex/candle
// ============================================================

const FINNHUB = 'https://finnhub.io/api/v1';

/** Símbolo de URL (p. ej. BINANCE:BTCUSDT, NASDAQ:AAPL) → tipo + símbolo Finnhub */
function resolveSymbol(symbol) {
  const s = String(symbol || '').trim();
  if (!s) return null;

  if (/^BINANCE:/i.test(s) || /^COINBASE:/i.test(s) || /^KRAKEN:/i.test(s) || /^CRYPTO:/i.test(s)) {
    return { type: 'crypto', finnhubSymbol: s };
  }

  const fxMap = {
    'FX:EURUSD': 'OANDA:EUR_USD',
    'FX:GBPUSD': 'OANDA:GBP_USD',
    'FX:USDJPY': 'OANDA:USD_JPY',
    'FX:USDCHF': 'OANDA:USD_CHF',
    'FX:AUDUSD': 'OANDA:AUD_USD',
    'FX:USDCAD': 'OANDA:USD_CAD',
  };
  if (fxMap[s]) return { type: 'forex', finnhubSymbol: fxMap[s] };

  const idxMap = {
    'IBEX:IBEX': '^IBEX',
    'FOREXCOM:SPX500': '^GSPC',
    'NASDAQ:CCMP': '^IXIC',
    'STOXX:STOXX50E': '^STOXX50E',
  };
  if (idxMap[s]) return { type: 'stock', finnhubSymbol: idxMap[s] };

  const bme = s.match(/^(BME|XMAD):(.+)$/i);
  if (bme) return { type: 'stock', finnhubSymbol: `${bme[2].toUpperCase()}.MC` };

  if (s.includes(':')) {
    const tick = s.split(':').pop();
    return { type: 'stock', finnhubSymbol: tick || s };
  }

  return { type: 'stock', finnhubSymbol: s };
}

function finnhubCandlePath(type) {
  if (type === 'crypto') return '/crypto/candle';
  if (type === 'forex') return '/forex/candle';
  return '/stock/candle';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const key = (process.env.FINNHUB_API_KEY || '').trim();
  if (!key) {
    return res.status(503).json({ error: 'Finnhub no configurado (FINNHUB_API_KEY)' });
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

  const resolved = resolveSymbol(symbol);
  if (!resolved) return res.status(400).json({ error: 'Símbolo inválido' });

  const fromI = Math.floor(from);
  const toI = Math.floor(to);
  const path = finnhubCandlePath(resolved.type);
  const url = `${FINNHUB}${path}?symbol=${encodeURIComponent(resolved.finnhubSymbol)}&resolution=${encodeURIComponent(resolution)}&from=${fromI}&to=${toI}&token=${key}`;

  let r;
  try {
    r = await fetch(url);
  } catch (e) {
    return res.status(502).json({ error: 'Red Finnhub', detail: e.message });
  }

  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!r.ok) {
    const finMsg = data?.error || text?.slice(0, 280) || '';
    const accessDenied = r.status === 403 || r.status === 401;
    let hint;
    if (accessDenied) {
      if (resolved.type === 'crypto') {
        hint =
          'Finnhub: el endpoint /crypto/candle no está incluido en tu plan (mensaje típico en gratuito). Activa el add-on Crypto o un plan que lo cubra; mientras tanto prueba un gráfico de acción o índice (/stock/candle).';
      } else {
        hint =
          'Revisa que FINNHUB_API_KEY sea la de tu cuenta y que el plan incluya velas para este tipo de activo (stock/forex).';
      }
    }
    return res.status(502).json({
      error: 'Finnhub rechazó la petición',
      httpStatus: r.status,
      detail: finMsg || `HTTP ${r.status}`,
      hint,
    });
  }

  if (data.s === 'no_data' || !Array.isArray(data.t) || data.t.length === 0) {
    return res.status(200).json({
      ok: true,
      status: 'no_data',
      candles: [],
      type: resolved.type,
      symbol: resolved.finnhubSymbol,
    });
  }

  if (data.s !== 'ok') {
    return res.status(200).json({
      ok: false,
      status: data.s || 'error',
      candles: [],
      type: resolved.type,
      symbol: resolved.finnhubSymbol,
    });
  }

  const candles = data.t.map((t, i) => ({
    time: t,
    open: data.o[i],
    high: data.h[i],
    low: data.l[i],
    close: data.c[i],
    volume: Array.isArray(data.v) && data.v[i] != null ? data.v[i] : null,
  }));

  return res.status(200).json({
    ok: true,
    status: 'ok',
    candles,
    type: resolved.type,
    symbol: resolved.finnhubSymbol,
    source: 'finnhub',
  });
}
