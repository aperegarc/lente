// ============================================================
// /api/admin/trigger-generate.js
// Permite al admin disparar el clustering+generación manualmente
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

  const url = `${process.env.DEPLOYMENT_URL || `https://${req.headers.host}`}/api/cron/generate`;

  fetch(url, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {});

  return res.status(200).json({ ok: true, triggered: 'generate' });
}
