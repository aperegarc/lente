// GET /api/admin/me — sesión admin (mismo criterio que requireAdmin)
import { requireAdmin } from '../_lib/clients.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req);
  if (!admin) {
    return res.status(401).json({ ok: false, is_admin: false, error: 'Admin only' });
  }

  return res.status(200).json({
    ok: true,
    is_admin: true,
    email: admin.email || null,
    id: admin.id,
    plan: admin.profile?.plan || null,
  });
}
