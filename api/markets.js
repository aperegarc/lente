// ============================================================
// /api/markets.js — datos públicos de mercados
// ?view=universe — catálogo amplio (Frankfurter ECB + CoinGecko + Supabase)
// ============================================================

import { getSupabaseAnon } from './_lib/clients.js';
import {
  MARKETS_UNIVERSE,
  UNIVERSE_DISCLAIMER,
} from './_lib/markets-universe.js';

/**
 * Histórico vía API pública de gráficos Yahoo (v8). Mismo tipo de dato que usan muchas apps;
 * el parámetro `range` aproxima el periodo (7d, 1mo, 3mo, 1y).
 */
async function fetchYahooV8ChartSeries(symbol, days) {
  const d = Math.min(730, Math.max(7, days));
  let range;
  if (d <= 7) range = '7d';
  else if (d <= 30) range = '1mo';
  else if (d <= 90) range = '3mo';
  else if (d <= 180) range = '6mo';
  else range = '1y';

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'lente-markets/1.0 (educational reference)' },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const result = j.chart?.result?.[0];
    if (!result) return [];
    const ts = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const out = [];
    for (let i = 0; i < ts.length; i++) {
      const v = closes[i];
      if (v != null && !Number.isNaN(+v)) {
        out.push({ t: new Date(ts[i] * 1000).toISOString(), v: +v });
      }
    }
    return out;
  } catch (e) {
    console.error('[yahoo v8 chart]', symbol, e.message);
    return [];
  }
}

async function fetchFrankfurterBatched() {
  const targets = [
    ...new Set(MARKETS_UNIVERSE.map((u) => u.frankfurterTo).filter(Boolean)),
  ];
  if (targets.length === 0) return { latest: null, prev: null };
  const q = targets.join(',');
  let latest = null;
  try {
    const r = await fetch(
      `https://api.frankfurter.app/latest?from=EUR&to=${q}`,
      { headers: { Accept: 'application/json' } },
    );
    if (r.ok) latest = await r.json();
  } catch (_) {
    /* red opcional */
  }
  let prev = null;
  for (let d = 1; d <= 7; d++) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() - d);
    const ds = dt.toISOString().slice(0, 10);
    try {
      const r = await fetch(
        `https://api.frankfurter.app/${ds}?from=EUR&to=${q}`,
        { headers: { Accept: 'application/json' } },
      );
      if (r.ok) {
        prev = await r.json();
        break;
      }
    } catch (_) {
      /* siguiente día */
    }
  }
  return { latest, prev };
}

async function fetchCoinGeckoBatch() {
  const ids = [
    ...new Set(MARKETS_UNIVERSE.map((u) => u.coingeckoId).filter(Boolean)),
  ];
  if (ids.length === 0) return {};
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=eur&include_24hr_change=true`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) return {};
    return await r.json();
  } catch (_) {
    return {};
  }
}

function mergeUniverseRow(def, dbMap, frank, cg) {
  const db = dbMap[def.symbol];
  if (db != null && db.price != null && !Number.isNaN(Number(db.price))) {
    return {
      symbol: def.symbol,
      name: def.name,
      description: def.description,
      category: def.category,
      tv: def.tv,
      price: db.price,
      change_pct: db.change_pct,
      change_abs: db.change_abs,
      sparkline: db.sparkline,
      updated_at: db.updated_at,
      price_source: 'supabase',
    };
  }
  if (def.coingeckoId && cg[def.coingeckoId]) {
    const c = cg[def.coingeckoId];
    return {
      symbol: def.symbol,
      name: def.name,
      description: def.description,
      category: def.category,
      tv: def.tv,
      price: c.eur,
      change_pct: c.eur_24h_change ?? null,
      change_abs: null,
      sparkline: null,
      updated_at: new Date().toISOString(),
      price_source: 'coingecko',
    };
  }
  if (
    def.frankfurterTo &&
    frank.latest?.rates &&
    frank.latest.rates[def.frankfurterTo] != null
  ) {
    const t = def.frankfurterTo;
    const today = frank.latest.rates[t];
    const yest = frank.prev?.rates?.[t];
    let change_pct = null;
    if (yest != null && today != null && yest !== 0) {
      change_pct = ((today - yest) / yest) * 100;
    }
    return {
      symbol: def.symbol,
      name: def.name,
      description: def.description,
      category: def.category,
      tv: def.tv,
      price: today,
      change_pct,
      change_abs: null,
      sparkline: null,
      updated_at: frank.latest.date
        ? `${frank.latest.date}T12:00:00.000Z`
        : new Date().toISOString(),
      price_source: 'frankfurter',
    };
  }
  return {
    symbol: def.symbol,
    name: def.name,
    description: def.description,
    category: def.category,
    tv: def.tv,
    price: null,
    change_pct: null,
    change_abs: null,
    sparkline: null,
    updated_at: null,
    price_source: 'none',
  };
}

function utcDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/** Serie diaria Frankfurter (ECB): EUR → divisa */
async function fetchFrankfurterSeries(frankfurterTo, days) {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - Math.min(730, Math.max(7, days)));
  const url = `https://api.frankfurter.app/${utcDateStr(start)}..${utcDateStr(end)}?from=EUR&to=${frankfurterTo}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return [];
  const j = await r.json();
  const rates = j.rates || {};
  const out = [];
  for (const date of Object.keys(rates).sort()) {
    const v = rates[date]?.[frankfurterTo];
    if (v != null && !Number.isNaN(+v)) {
      out.push({ t: `${date}T12:00:00.000Z`, v: +v });
    }
  }
  return out;
}

/** CoinGecko: precios vs EUR (uso acorde a sus términos; endpoint público). */
async function fetchCoinGeckoSeries(coingeckoId, days) {
  const d = Math.min(365, Math.max(1, days));
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coingeckoId)}/market_chart?vs_currency=eur&days=${d}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return [];
  const j = await r.json();
  const prices = j.prices || [];
  return prices.map(([ms, v]) => ({
    t: new Date(ms).toISOString(),
    v: +v,
  }));
}

/** Finnhub velas diarias (opcional; requiere FINNHUB_API_KEY en servidor). */
async function fetchFinnhubDailySeries(symbol, days) {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (!token) return null;
  let sym = symbol.replace(/\^/, '').replace(/=F$/i, '');
  if (/-USD$/i.test(symbol) && symbol.split('-')[0]?.length <= 5) {
    sym = symbol.replace(/-USD$/i, '');
  }
  if (!sym || sym.length > 12) return null;
  const to = Math.floor(Date.now() / 1000);
  const from = to - Math.min(730, Math.max(7, days)) * 86400;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=D&from=${from}&to=${to}&token=${token}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  const j = await r.json();
  if (j.s !== 'ok' || !Array.isArray(j.t) || !j.t.length) return null;
  return j.t.map((ts, i) => ({
    t: new Date(ts * 1000).toISOString(),
    v: j.c[i] != null ? +j.c[i] : null,
  })).filter((p) => p.v != null && !Number.isNaN(p.v));
}

function pctChangeFromSeries(series) {
  if (!series?.length || series.length < 2) return null;
  const a = series[0].v;
  const b = series[series.length - 1].v;
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / a) * 100;
}

/**
 * GET ?series=1&symbol=...&days=30
 * Fuentes: Frankfurter (divisas), CoinGecko (cripto), opcional Finnhub (acciones/índices si hay API key).
 */
async function buildMarketSeries(symbol, days) {
  const def = MARKETS_UNIVERSE.find((u) => u.symbol === symbol);
  const range = Math.min(730, Math.max(7, days));

  if (!def) {
    return {
      symbol,
      name: symbol,
      category: null,
      series: [],
      change_pct: null,
      last_v: null,
      source: 'none',
      attribution:
        'Símbolo no reconocido en el catálogo. Los históricos cubren divisas (Frankfurter/ECB) y cripto (CoinGecko).',
      range_days: range,
    };
  }

  let series = [];
  let source = 'none';
  let attribution =
    'Datos orientativos. Divisas: Frankfurter (tipos ECB). Cripto: CoinGecko.';

  if (def.frankfurterTo) {
    series = await fetchFrankfurterSeries(def.frankfurterTo, range);
    source = 'frankfurter';
    attribution =
      'Tipo de cambio de referencia (EUR → divisa) vía Frankfurter (datos tipo ECB).';
  } else if (def.coingeckoId) {
    series = await fetchCoinGeckoSeries(def.coingeckoId, range);
    source = 'coingecko';
    attribution =
      'Precios en EUR vía CoinGecko API (uso según términos de CoinGecko).';
  } else {
    const fh = await fetchFinnhubDailySeries(def.symbol, range);
    if (fh?.length) {
      series = fh;
      source = 'finnhub';
      attribution =
        'Velas diarias vía Finnhub (opcional; FINNHUB_API_KEY en servidor).';
    }
    if (!series.length) {
      series = await fetchYahooV8ChartSeries(def.symbol, range);
      if (series.length) {
        source = 'yahoo_v8';
        attribution =
          'Histórico diario vía API pública de gráficos Yahoo Finance (rango aproximado al periodo); uso orientativo.';
      }
    }
    if (!series.length && def.category === 'acciones') {
      const mc = `${def.symbol.replace(/\./g, '-')}.MC`;
      series = await fetchYahooV8ChartSeries(mc, range);
      if (series.length) {
        source = 'yahoo_v8';
        attribution =
          'Histórico Yahoo Finance (Bolsa Madrid · sufijo .MC). Orientativo.';
      }
    }
  }

  const change_pct = pctChangeFromSeries(series);
  const last_v =
    series.length && series[series.length - 1].v != null
      ? series[series.length - 1].v
      : null;

  return {
    symbol: def.symbol,
    name: def.name,
    category: def.category,
    series,
    change_pct,
    last_v,
    source,
    attribution,
    range_days: range,
    currency_label: def.coingeckoId ? 'EUR' : def.frankfurterTo ? def.frankfurterTo : '—',
  };
}

async function buildUniverseResponse(supabase) {
  const { data: dbRows } = await supabase.from('markets').select('*');
  const dbMap = Object.fromEntries((dbRows || []).map((r) => [r.symbol, r]));

  const [frank, cg] = await Promise.all([
    fetchFrankfurterBatched(),
    fetchCoinGeckoBatch(),
  ]);

  const flat = MARKETS_UNIVERSE.map((def) =>
    mergeUniverseRow(def, dbMap, frank, cg),
  );

  const grouped = {};
  for (const m of flat) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  return {
    view: 'universe',
    disclaimer: UNIVERSE_DISCLAIMER,
    updated_at: new Date().toISOString(),
    grouped,
    flat,
  };
}

export default async function handler(req, res) {
  if (req.query.series === '1') {
    const symbol =
      typeof req.query.symbol === 'string' ? req.query.symbol.trim() : '';
    const days = parseInt(String(req.query.days || '30'), 10) || 30;
    if (!symbol) {
      return res.status(400).json({ error: 'Falta query symbol' });
    }
    res.setHeader(
      'Cache-Control',
      's-maxage=300, stale-while-revalidate=120',
    );
    try {
      const body = await buildMarketSeries(symbol, days);
      return res.status(200).json(body);
    } catch (err) {
      console.error('[markets series]', err);
      return res.status(500).json({ error: err.message || 'series failed' });
    }
  }

  const universe = req.query.view === 'universe';

  if (universe) {
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
  } else {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  }

  let supabase;
  try {
    supabase = getSupabaseAnon();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (universe) {
    try {
      const body = await buildUniverseResponse(supabase);
      return res.status(200).json(body);
    } catch (err) {
      console.error('[markets universe]', err);
      return res.status(500).json({ error: err.message || 'universe failed' });
    }
  }

  const { category } = req.query;

  let query = supabase.from('markets').select('*');
  if (category) query = query.eq('category', category);

  const { data, error } = await query.order('category').order('name');
  if (error) return res.status(500).json({ error: error.message });

  const grouped = {};
  for (const m of data || []) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  return res.status(200).json({
    view: 'summary',
    updated_at: data?.[0]?.updated_at,
    grouped,
    flat: data || [],
  });
}
