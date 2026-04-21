// ============================================================
// /api/cron/markets.js
// Actualiza cotizaciones desde Yahoo Finance cada 15 min
// ============================================================

import yahooFinance from 'yahoo-finance2';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Cargar los mercados configurados
  const { data: markets, error } = await supabase.from('markets').select('*');
  if (error) return res.status(500).json({ error: error.message });

  const updated = [];
  const errors = [];

  for (const m of markets) {
    try {
      const q = await yahooFinance.quote(m.symbol);

      // Para el sparkline: precios intradía de las últimas 24h aprox
      const chart = await yahooFinance.chart(m.symbol, {
        period1: new Date(Date.now() - 24 * 3600 * 1000),
        interval: '1h',
      });

      const sparkline = chart.quotes?.map(p => p.close).filter(Boolean) || [];

      await supabase
        .from('markets')
        .update({
          price: q.regularMarketPrice,
          change_pct: q.regularMarketChangePercent,
          change_abs: q.regularMarketChange,
          sparkline: sparkline.slice(-12), // últimos 12 puntos
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
    updated: updated.length,
    errors,
  });
}
