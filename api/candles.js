// ============================================================
// /api/candles.js — velas vía Yahoo Finance v8 (sin API key)
// GET ?symbol=...&resolution=15|60|D&from=<unix>&to=<unix>
// ============================================================

import {
  resolveTvSymbolToYahoo,
  yahooSymbolFallbacks,
  fetchYahooCandles,
} from './_lib/yahoo-chart.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

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

  const yahooPrimary = resolveTvSymbolToYahoo(symbol);
  if (!yahooPrimary) return res.status(400).json({ error: 'Símbolo inválido' });

  const fromI = Math.floor(from);
  const toI = Math.floor(to);
  const candidates = yahooSymbolFallbacks(yahooPrimary);

  let fetched = null;
  let usedSymbol = yahooPrimary;
  for (const cand of candidates) {
    try {
      fetched = await fetchYahooCandles(cand, fromI, toI, resolution);
      if (fetched?.candles?.length) {
        usedSymbol = cand;
        break;
      }
    } catch (e) {
      console.error('[candles] Yahoo', cand, e.message);
    }
  }

  if (!fetched?.candles?.length) {
    return res.status(200).json({
      ok: true,
      status: 'no_data',
      candles: [],
      symbol: usedSymbol,
      source: 'yahoo_v8',
      hint:
        'Sin velas para este activo en el periodo. Prueba otro timeframe o un símbolo del catálogo (índices, acciones, divisas =X, cripto -USD).',
    });
  }

  return res.status(200).json({
    ok: true,
    status: 'ok',
    candles: fetched.candles,
    symbol: usedSymbol,
    source: 'yahoo_v8',
    attribution:
      'Datos orientativos vía Yahoo Finance. No es tiempo real ni asesoramiento financiero.',
  });
}
