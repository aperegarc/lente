// ============================================================
// lib/cron/markets-update.js — vía /api/crons?job=markets-update
// Actualiza filas de `markets` con Yahoo Finance (sin Finnhub).
// ============================================================

import yahooFinance from 'yahoo-finance2';
import { getSupabaseAdmin, isValidCronRequest } from '../../api/_lib/clients.js';

export default async function handler(req, res) {
  if (!isValidCronRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized — falta o es inválido el Bearer token' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ error: 'Config error', details: err.message });
  }

  const { data: markets, error } = await supabase.from('markets').select('*');
  if (error) return res.status(500).json({ error: error.message });

  const updated = [];
  const errors = [];

  for (const m of markets || []) {
    try {
      const q = await yahooFinance.quote(m.symbol);
      let sparkline = [];
      try {
        const chart = await yahooFinance.chart(m.symbol, {
          period1: new Date(Date.now() - 24 * 3600 * 1000),
          interval: '1h',
        });
        sparkline = (chart.quotes?.map((p) => p.close).filter(Boolean) || []).slice(-12);
      } catch (_) {
        /* sparkline opcional */
      }

      await supabase
        .from('markets')
        .update({
          price: q.regularMarketPrice,
          change_pct: q.regularMarketChangePercent,
          change_abs: q.regularMarketChange,
          sparkline,
          updated_at: new Date().toISOString(),
        })
        .eq('symbol', m.symbol);

      updated.push(m.symbol);
    } catch (err) {
      console.error(`[markets-update] ✗ ${m.symbol}:`, err.message);
      errors.push({ symbol: m.symbol, error: err.message });
    }
  }

  return res.status(200).json({
    ok: true,
    source: 'yahoo_finance',
    updated: updated.length,
    symbols: updated,
    errors: errors.length,
    error_details: errors,
  });
}
