// ============================================================
// /api/markets.js — datos públicos de mercados
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Cache: 1 min
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const { category } = req.query;

  let query = supabase.from('markets').select('*');
  if (category) query = query.eq('category', category);

  const { data, error } = await query.order('category').order('name');
  if (error) return res.status(500).json({ error: error.message });

  // Agrupar por categoría
  const grouped = {};
  for (const m of data) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  return res.status(200).json({
    updated_at: data[0]?.updated_at,
    grouped,
    flat: data,
  });
}
