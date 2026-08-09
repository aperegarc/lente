// ============================================================
// /api/admin/cards.js — CRUD admin de tarjetas
// ============================================================

import { getSupabaseAdmin, requireAdmin } from '../_lib/clients.js';
import { isUuid, clampInt, sanitizeText, isIsoDate, publicError } from '../_lib/validate.js';

const ALLOWED_UPDATE_FIELDS = [
  'headline',
  'deck',
  'body',
  'meaning',
  'category',
  'sources_text',
  'read_time_seconds',
  'primary_source_url',
  'legal_tag',
  'is_ai_generated',
];

const FIELD_LIMITS = {
  headline: 500,
  deck: 800,
  body: 12000,
  meaning: 4000,
  category: 80,
  sources_text: 500,
  primary_source_url: 2048,
  legal_tag: 300,
};

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return publicError(res, 401, 'Admin only');
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return publicError(res, 500, 'Error interno');
  }

  if (req.method === 'GET') {
    const { status, date, limit: limitRaw } = req.query;
    const limit = clampInt(limitRaw, 1, 200, 200);

    let query = supabase
      .from('cards')
      .select('*')
      .order('generated_at', { ascending: false });

    if (status && typeof status === 'string') {
      const allowed = ['pending', 'approved', 'rejected', 'published'];
      if (allowed.includes(status)) query = query.eq('status', status);
    }
    if (date && isIsoDate(String(date))) query = query.eq('edition_date', String(date).trim());

    const { data, error } = await query.limit(limit);
    if (error) return publicError(res, 500, 'Error interno');
    return res.status(200).json({ cards: data || [] });
  }

  if (req.method === 'POST') {
    const { action, id, updates } = req.body || {};

    if (!isUuid(id)) {
      return publicError(res, 400, 'id inválido');
    }

    if (action === 'approve') {
      const { error } = await supabase.from('cards').update({ status: 'approved' }).eq('id', id);
      if (error) return publicError(res, 500, 'Error interno');
      return res.status(200).json({ ok: true });
    }

    if (action === 'reject') {
      const { error } = await supabase.from('cards').update({ status: 'rejected' }).eq('id', id);
      if (error) return publicError(res, 500, 'Error interno');
      return res.status(200).json({ ok: true });
    }

    if (action === 'update') {
      const clean = {};
      for (const k of ALLOWED_UPDATE_FIELDS) {
        if (updates?.[k] === undefined) continue;
        if (k === 'read_time_seconds') {
          clean[k] = clampInt(updates[k], 20, 120, 40);
        } else if (k === 'is_ai_generated') {
          clean[k] = Boolean(updates[k]);
        } else if (k === 'primary_source_url') {
          const url = sanitizeText(updates[k], FIELD_LIMITS[k]);
          if (url && !/^https?:\/\//i.test(url)) {
            return publicError(res, 400, 'primary_source_url debe ser http(s)');
          }
          clean[k] = url;
        } else if (FIELD_LIMITS[k]) {
          clean[k] = sanitizeText(updates[k], FIELD_LIMITS[k]);
        }
      }
      const { error } = await supabase.from('cards').update(clean).eq('id', id);
      if (error) return publicError(res, 500, 'Error interno');
      return res.status(200).json({ ok: true });
    }

    if (action === 'publish_all') {
      const editionDate =
        typeof req.body?.edition_date === 'string'
          ? req.body.edition_date.trim().slice(0, 10)
          : '';
      let q = supabase
        .from('cards')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('status', 'approved');
      if (editionDate && isIsoDate(editionDate)) {
        q = q.eq('edition_date', editionDate);
      }
      const { data, error } = await q.select('id');
      if (error) return publicError(res, 500, 'Error interno');
      const published = Array.isArray(data) ? data.length : 0;
      return res.status(200).json({ ok: true, published });
    }

    return publicError(res, 400, 'Unknown action');
  }

  res.setHeader('Allow', 'GET, POST');
  return publicError(res, 405, 'Method not allowed');
}
