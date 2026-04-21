// ============================================================
// /api/feed.js — feed público del día
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY  // clave pública (respeta RLS)
);

export default async function handler(req, res) {
  // Cache: 5 min en navegador, 10 min en CDN
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const { category } = req.query;

  let query = supabase.from('cards').select('*');

  // Filtro por categoría si se pide
  if (category) {
    query = query.eq('category', category);
  }

  // Siempre mostramos las más recientes
  query = query
    .order('generated_at', { ascending: false, nullsFirst: false })
    .limit(50);

  const { data: cards, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    date: cards?.length > 0 ? cards[0].edition_date : null,
    cards: cards || [],
  });
}
