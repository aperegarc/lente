// ============================================================
// /api/admin/cards.js — CRUD admin de tarjetas
// ============================================================

import { getSupabaseAdmin, requireAdmin } from '../_lib/clients.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return res.status(401).json({
      error: 'Admin only',
      hint: 'Asegúrate de que tu usuario tiene is_admin=true en la tabla profiles',
    });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // ===== GET =====
  if (req.method === 'GET') {
    const { status, date, limit = 200 } = req.query;

    let query = supabase.from('cards').select('*').order('generated_at', { ascending: false });
    if (status) query = query.eq('status', status);
    if (date)   query = query.eq('edition_date', date);

    const { data, error } = await query.limit(parseInt(limit));
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ cards: data || [] });
  }

  // ===== POST =====
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
      const allowed = ['headline', 'deck', 'body', 'meaning', 'category', 'sources_text', 'read_time_seconds'];
      const clean = {};
      for (const k of allowed) {
        if (updates?.[k] !== undefined) clean[k] = updates[k];
      }
      const { error } = await supabase.from('cards').update(clean).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === 'publish_all') {
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('cards')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('status', 'approved')
        .eq('edition_date', today);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action', received: action });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
