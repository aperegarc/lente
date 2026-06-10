// GET /api/public-config — config del cliente (solo URL + anon key, desde env del servidor)
// En producción, vercel.json reescribe /config.js → aquí.

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  const url = (process.env.SUPABASE_URL || '').trim();
  const anon = (process.env.SUPABASE_ANON_KEY || '').trim();

  if (!url || !anon || url.includes('YOUR-PROJECT') || anon.includes('your-anon')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return res.status(503).send(
      'console.error("[lente] Falta SUPABASE_URL o SUPABASE_ANON_KEY en el servidor");' +
        'window.LENTE_CONFIG = { SUPABASE_URL: "", SUPABASE_ANON_KEY: "", API: {} };',
    );
  }

  const config = {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anon,
    API: {
      feed: '/api/feed',
      feedHistory: '/api/feed-history',
      cards: '/api/cards',
      markets: '/api/markets',
      candles: '/api/candles',
    },
  };

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.status(200).send(`window.LENTE_CONFIG = ${JSON.stringify(config)};`);
}
