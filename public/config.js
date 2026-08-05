// Fallback local. En producción la app carga /api/public-config (no este archivo).
// NO pongas claves reales aquí — van en .env.local / Vercel.
window.LENTE_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  API: {
    feed: '/api/feed',
    feedHistory: '/api/feed-history',
    cards: '/api/cards',
    markets: '/api/markets',
    candles: '/api/candles',
  },
};

if (!window.LENTE_CONFIG.SUPABASE_URL) {
  console.warn(
    '[lente] config.js vacío: arranca con `npm run dev` (vercel dev) para cargar claves desde .env.local',
  );
}
