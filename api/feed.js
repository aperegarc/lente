// ============================================================
// /api/feed.js — feed público del día
// ============================================================

import { getSupabaseAnon } from './_lib/clients.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=150');

  let supabase;
  try {
    supabase = getSupabaseAnon();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const { category } = req.query;

  // Última edición con tarjetas publicadas
  const { data: latest } = await supabase
    .from('cards')
    .select('edition_date')
    .eq('status', 'published')
    .order('edition_date', { ascending: false })
    .limit(1);

  if (!latest || latest.length === 0) {
    return res.status(200).json({ date: null, cards: [] });
  }

  const editionDate = latest[0].edition_date;

  let query = supabase
    .from('cards')
    .select('*')
    .eq('status', 'published')
    .eq('edition_date', editionDate)
    .order('order_index', { ascending: true });

  if (category) query = query.eq('category', category);

  const { data: cards, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    date: editionDate,
    cards: cards || [],
  });
}
