// ============================================================
// /api/markets.js — datos públicos de mercados
// ============================================================

import { getSupabaseAnon } from './_lib/clients.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  let supabase;
  try {
    supabase = getSupabaseAnon();
  } catch (err) {
    return res.status(500).json({ error: err.message });
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
    updated_at: data?.[0]?.updated_at,
    grouped,
    flat: data || [],
  });
}
