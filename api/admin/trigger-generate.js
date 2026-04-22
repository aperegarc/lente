// ============================================================
// /api/admin/trigger-generate.js
// ============================================================

import { requireAdmin, getDeploymentUrl } from '../_lib/clients.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin only' });

  const url = `${getDeploymentUrl(req)}/api/cron/generate`;

  fetch(url, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(err => console.error('[trigger-generate]', err));

  return res.status(200).json({ ok: true, triggered: 'generate', url });
}
