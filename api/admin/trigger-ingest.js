// /api/admin/trigger-ingest.js
import { requireAdmin, getDeploymentUrl } from '../_lib/clients.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin only' });

  const url = `${getDeploymentUrl(req)}/api/cron/ingest`;
  console.log('[trigger-ingest] Llamando a:', url);

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const data = await response.json();
    console.log(`[trigger-ingest] Respuesta (${response.status}):`, data);
    return res.status(200).json({ ok: true, triggered: 'ingest', result: data });
  } catch (err) {
    console.error('[trigger-ingest] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}