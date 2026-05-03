// ============================================================
// GET /api/feed-history — fechas de edición con tarjetas (solo Premium)
// ============================================================

import { getSupabaseAnon, getUserFromToken } from './_lib/clients.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');

  const userCtx = await getUserFromToken(req);
  if (!userCtx || userCtx.profile?.plan !== 'premium') {
    return res.status(403).json({
      error: 'premium_required',
      message: 'El histórico de ediciones es solo para suscriptores Premium.',
    });
  }

  let supabase;
  try {
    supabase = getSupabaseAnon();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const limitRaw = req.query.limit;
  const limit = Math.min(90, Math.max(1, parseInt(String(limitRaw || '40'), 10) || 40));

  const { data: rows, error } = await supabase
    .from('cards')
    .select('edition_date')
    .eq('status', 'published');

  if (error) return res.status(500).json({ error: error.message });

  const counts = {};
  for (const r of rows || []) {
    const d = r.edition_date;
    if (!d) continue;
    counts[d] = (counts[d] || 0) + 1;
  }

  const editions = Object.entries(counts)
    .map(([edition_date, card_count]) => ({ edition_date, card_count }))
    .sort((a, b) => String(b.edition_date).localeCompare(String(a.edition_date)))
    .slice(0, limit);

  return res.status(200).json({ editions });
}
