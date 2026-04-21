// ============================================================
// /api/admin/cards.js — gestión admin de tarjetas
// GET  → lista tarjetas (con filtros)
// POST → acción (approve, reject, publish, update)
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Middleware: verifica que el usuario es admin
async function requireAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return profile?.is_admin ? user : null;
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin only' });

  // ===== GET: listar tarjetas =====
  if (req.method === 'GET') {
    const { status, date } = req.query;

    let query = supabase.from('cards').select('*').order('generated_at', { ascending: false });
    if (status) query = query.eq('status', status);
    if (date)   query = query.eq('edition_date', date);

    const { data, error } = await query.limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ cards: data });
  }

  // ===== POST: acciones =====
  if (req.method === 'POST') {
    const { action, id, updates } = req.body || {};

    if (action === 'approve') {
      const { error } = await supabase.from('cards').update({ status: 'approved' }).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'reject') {
      const { error } = await supabase.from('cards').update({ status: 'rejected' }).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'update') {
      const allowed = ['headline','deck','body','meaning','category','sources_text','read_time_seconds'];
      const clean = {};
      for (const k of allowed) {
        if (updates[k] !== undefined) clean[k] = updates[k];
      }
      const { error } = await supabase.from('cards').update(clean).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'publish_all') {
      // Publica todas las aprobadas de la última edición disponible
      const { data: latestApproved, error: latestErr } = await supabase
        .from('cards')
        .select('edition_date')
        .eq('status', 'approved')
        .order('edition_date', { ascending: false })
        .limit(1);

      if (latestErr) return res.status(500).json({ error: latestErr.message });
      if (!latestApproved || latestApproved.length === 0) {
        return res.status(200).json({ ok: true, published: 0, reason: 'no_approved_cards' });
      }

      const latestEditionDate = latestApproved[0].edition_date;
      const { error } = await supabase
        .from('cards')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('status', 'approved')
        .eq('edition_date', latestEditionDate);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, published_edition_date: latestEditionDate });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
