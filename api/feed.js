// ============================================================
// /api/feed.js — feed del día (freemium: free = 5 tarjetas)
// ============================================================

import { getSupabaseAnon, getUserFromToken } from './_lib/clients.js';

const FREE_CARD_LIMIT = 5;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate');
  res.setHeader('Vary', 'Authorization');

  let supabase;
  try {
    supabase = getSupabaseAnon();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const userCtx = await getUserFromToken(req);
  const premium = userCtx?.profile?.plan === 'premium';

  const { category, edition_date: editionDateRaw } = req.query;
  const editionDateParam = typeof editionDateRaw === 'string' ? editionDateRaw.trim() : '';

  const { data: latestRows } = await supabase
    .from('cards')
    .select('edition_date')
    .eq('status', 'published')
    .order('edition_date', { ascending: false })
    .limit(1);

  if (!latestRows?.length) {
    return res.status(200).json({
      date: null,
      cards: [],
      plan_tier: premium ? 'premium' : 'free',
      free_limit: FREE_CARD_LIMIT,
      total_in_edition: 0,
      locked_count: 0,
      edition_complete: true,
    });
  }

  const latestEdition = latestRows[0].edition_date;

  let targetEdition = latestEdition;
  if (editionDateParam) {
    if (!premium && editionDateParam !== latestEdition) {
      return res.status(403).json({
        error: 'premium_required',
        message: 'Ver ediciones anteriores requiere Premium.',
      });
    }
    targetEdition = editionDateParam;
  }

  const { data: fullList, error } = await supabase
    .from('cards')
    .select('*')
    .eq('status', 'published')
    .eq('edition_date', targetEdition)
    .order('order_index', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const pool = fullList || [];
  const totalInEdition = pool.length;

  let visible = premium ? [...pool] : pool.slice(0, FREE_CARD_LIMIT);
  if (category) {
    visible = visible.filter((c) => c.category === category);
  }

  const lockedCount = premium ? 0 : Math.max(0, totalInEdition - FREE_CARD_LIMIT);
  const editionComplete = premium || totalInEdition <= FREE_CARD_LIMIT;

  return res.status(200).json({
    date: targetEdition,
    cards: visible,
    plan_tier: premium ? 'premium' : 'free',
    free_limit: FREE_CARD_LIMIT,
    total_in_edition: totalInEdition,
    locked_count: lockedCount,
    edition_complete: editionComplete,
    is_latest_edition: targetEdition === latestEdition,
    category_filter: category || null,
  });
}
