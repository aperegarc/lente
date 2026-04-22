// ============================================================
// /api/admin/trigger-ingest.js
// ============================================================

import { requireAdmin, getDeploymentUrl } from '../_lib/clients.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin only' });

  const url = `${getDeploymentUrl(req)}/api/cron/ingest`;

  fetch(url, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(err => console.error('[trigger-ingest]', err));

  return res.status(200).json({ ok: true, triggered: 'ingest', url });
}
