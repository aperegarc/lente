// ============================================================
// GET /api/feed-history — fechas de edición con tarjetas (solo Premium)
// ============================================================

import { getSupabaseAnon, getUserFromToken } from './_lib/clients.js';
import { rateLimitRoute } from './_lib/rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');

  if (!(await rateLimitRoute(req, res, { max: 60, adminMax: 180, name: 'feed-history' }))) return;
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
    return res.status(500).json({ error: 'Error interno' });
  }

  const limitRaw = req.query.limit;
  const limit = Math.min(90, Math.max(1, parseInt(String(limitRaw || '40'), 10) || 40));

  const maxRows = Math.min(1000, limit * 40);
  const { data: rows, error } = await supabase
    .from('cards')
    .select('edition_date')
    .eq('status', 'published')
    .order('edition_date', { ascending: false })
    .limit(maxRows);

  if (error) return res.status(500).json({ error: 'Error interno' });

  const counts = {};
  for (const r of rows || []) {
    const d = r.edition_date;
    if (!d) continue;
    counts[d] = (counts[d] || 0) + 1;
  }
  // Si se llegó al tope, la edición más antigua puede estar incompleta: no se muestra un recuento falso.
  if ((rows || []).length === maxRows && rows.length) delete counts[rows[rows.length - 1].edition_date];

  const editions = Object.entries(counts)
    .map(([edition_date, card_count]) => ({ edition_date, card_count }))
    .sort((a, b) => String(b.edition_date).localeCompare(String(a.edition_date)))
    .slice(0, limit);

  return res.status(200).json({ editions });
}
