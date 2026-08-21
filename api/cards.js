// GET /api/cards?ids=uuid,uuid — tarjetas publicadas (solo Premium + ids guardados del usuario)

import { getSupabaseAdmin, getUserFromToken } from './_lib/clients.js';
import { isUuid, publicError } from './_lib/validate.js';
import { rateLimit } from './_lib/rate-limit.js';

const PUBLIC_CARD_FIELDS =
  'id, category, headline, deck, body, meaning, sources_text, primary_source_url, legal_tag, is_ai_generated, read_time_seconds, edition_date, order_index, published_at';

const MAX_IDS = 50;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return publicError(res, 405, 'Method not allowed');
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');

  const userCtx = await getUserFromToken(req);
  const isAdmin = userCtx?.profile?.is_admin === true;
  if (!rateLimit(req, res, { max: isAdmin ? 80 : 20, name: 'cards' })) return;

  if (!userCtx?.id) {
    return publicError(res, 401, 'Inicia sesión');
  }
  if (userCtx.profile?.plan !== 'premium') {
    return publicError(res, 403, 'Requiere Premium');
  }

  const raw = String(req.query.ids || '').trim();
  if (!raw) return publicError(res, 400, 'Falta ids');

  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0 || ids.length > MAX_IDS) {
    return publicError(res, 400, 'ids inválidos');
  }
  if (!ids.every(isUuid)) return publicError(res, 400, 'ids inválidos');

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return publicError(res, 500, 'Error interno');
  }

  const { data: savedRows, error: savedErr } = await admin
    .from('saved_cards')
    .select('card_id')
    .eq('user_id', userCtx.id)
    .in('card_id', ids);

  if (savedErr) return publicError(res, 500, 'Error interno');

  const allowed = new Set((savedRows || []).map((r) => r.card_id));
  const allowedIds = ids.filter((id) => allowed.has(id));
  if (allowedIds.length === 0) {
    return res.status(200).json({ cards: [] });
  }

  const { data: cards, error } = await admin
    .from('cards')
    .select(PUBLIC_CARD_FIELDS)
    .in('id', allowedIds)
    .eq('status', 'published');

  if (error) return publicError(res, 500, 'Error interno');

  return res.status(200).json({ cards: cards || [] });
}
