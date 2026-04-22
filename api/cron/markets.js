// ============================================================
// /api/cron/markets.js
// Cotizaciones de Yahoo Finance
// ============================================================

import yahooFinance from 'yahoo-finance2';
import { getSupabaseAdmin, isValidCronRequest } from '../_lib/clients.js';

export default async function handler(req, res) {
  if (!isValidCronRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
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

  for (const m of markets) {
    try {
      const q = await yahooFinance.quote(m.symbol);
      let sparkline = [];
      try {
        const chart = await yahooFinance.chart(m.symbol, {
          period1: new Date(Date.now() - 24 * 3600 * 1000),
          interval: '1h',
        });
        sparkline = (chart.quotes?.map(p => p.close).filter(Boolean) || []).slice(-12);
      } catch (_) {
        // Si falla el chart, nos quedamos sin sparkline pero guardamos el resto
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
      console.error(`[markets] ✗ ${m.symbol}:`, err.message);
      errors.push({ symbol: m.symbol, error: err.message });
    }
  }

  return res.status(200).json({
    ok: true,
    updated: updated.length,
    errors: errors.length,
    error_details: errors,
  });
}
