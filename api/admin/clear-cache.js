// POST /api/admin/clear-cache — señal para invalidar caché de clientes (SW)
import { requireAdmin, getSupabaseAdmin } from '../_lib/clients.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin only' });

  const clearedAt = new Date().toISOString();
  const cacheVersion = `lente-${Date.now()}`;

  // Bust opcional en app_meta (si la tabla no existe, se ignora)
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('app_meta').upsert(
      { key: 'client_cache_version', value: cacheVersion, updated_at: clearedAt },
      { onConflict: 'key' },
    );
    if (error) console.warn('[clear-cache] app_meta:', error.message);
  } catch (err) {
    console.warn('[clear-cache] app_meta skip:', err.message);
  }

  return res.status(200).json({
    ok: true,
    cleared_at: clearedAt,
    cache_version: cacheVersion,
    hint: 'Los clientes con service worker recibirán CLEAR_CACHE al recargar; en este navegador se limpia al instante.',
  });
}
