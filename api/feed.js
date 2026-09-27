// ============================================================
// /api/feed.js — feed del día (freemium: free = 5 tarjetas)
// ============================================================

import { getSupabaseAdmin, getUserFromToken } from './_lib/clients.js';
import { isIsoDate, firstQuery, sanitizeText, QUERY_LIMITS } from './_lib/validate.js';
import { rateLimitRoute } from './_lib/rate-limit.js';

const FREE_CARD_LIMIT = 5;

const PUBLIC_CARD_FIELDS =
  'id, category, headline, deck, body, meaning, sources_text, primary_source_url, legal_tag, is_ai_generated, read_time_seconds, edition_date, order_index, published_at';

export default async function handler(req, res) {
  // Sin sesión el feed es idéntico para todos: la CDN lo sirve 60 s y absorbe los picos.
  // Con sesión la app llama con ?auth=1 (otra clave de caché) y la respuesta nunca se guarda,
  // así que nadie puede envenenar la caché que reciben los usuarios Premium.
  const anonymous = !req.headers.authorization && firstQuery(req.query.auth) === '';
  const cacheOk = () => {
    if (anonymous) res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  };
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate');
  res.setHeader('Vary', 'Authorization');

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ error: 'Error interno' });
  }

  if (!(await rateLimitRoute(req, res, { max: 60, adminMax: 180, name: 'feed' }))) return;
  const userCtx = await getUserFromToken(req);
  const premium = userCtx?.profile?.plan === 'premium';

  const category = sanitizeText(firstQuery(req.query.category), QUERY_LIMITS.category) || '';
  const editionDateParam = firstQuery(req.query.edition_date).trim();

  const { data: latestRows, error: latestError } = await supabase
    .from('cards')
    .select('edition_date')
    .eq('status', 'published')
    .order('edition_date', { ascending: false })
    .limit(1);

  if (latestError) return res.status(500).json({ error: 'Error interno' });
  if (!latestRows?.length) {
    cacheOk();
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
    if (!isIsoDate(editionDateParam)) {
      return res.status(400).json({ error: 'edition_date inválida' });
    }
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
    .select(PUBLIC_CARD_FIELDS)
    .eq('status', 'published')
    .eq('edition_date', targetEdition)
    .order('order_index', { ascending: true });

  if (error) return res.status(500).json({ error: 'Error interno' });

  const pool = fullList || [];
  const totalInEdition = pool.length;

  let visible = premium ? [...pool] : pool.slice(0, FREE_CARD_LIMIT);
  if (category) {
    visible = visible.filter((c) => c.category === category);
  }

  const lockedCount = premium ? 0 : Math.max(0, totalInEdition - FREE_CARD_LIMIT);
  const editionComplete = premium || totalInEdition <= FREE_CARD_LIMIT;

  cacheOk();
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
