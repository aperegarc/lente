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

  // Buscar la última edición con tarjetas publicadas
  const { data: latest, error: latestErr } = await supabase
    .from('cards')
    .select('edition_date, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(1);

  if (latestErr) return res.status(500).json({ error: latestErr.message });

  if (!latest || latest.length === 0) {
    return res.status(200).json({ date: null, cards: [] });
  }

  const editionDate = latest[0].edition_date || null;
  let query = supabase.from('cards').select('*').eq('status', 'published');

  // Caso normal: edición con fecha.
  // Fallback: si la fecha viene null, mostramos las publicadas más recientes.
  if (editionDate) {
    query = query
      .eq('edition_date', editionDate)
      .order('order_index', { ascending: true });
  } else {
    query = query
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(30);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const { data: cards, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    date: editionDate,
    cards: cards || [],
  });
}
