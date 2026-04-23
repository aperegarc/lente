// /api/admin/trigger-generate.js
import { requireAdmin, getDeploymentUrl } from '../_lib/clients.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin only' });

  const url = `${getDeploymentUrl(req)}/api/cron/generate`;
  console.log('[trigger-generate] Llamando a:', url);

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const data = await response.json();
    console.log('[trigger-generate] Respuesta:', data);
    return res.status(200).json({ ok: true, triggered: 'generate', result: data });
  } catch (err) {
    console.error('[trigger-generate] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}