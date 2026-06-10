// Fallback solo para desarrollo local sin API (vercel dev usa /api/public-config vía rewrite).
// NO pongas claves reales aquí — van en .env.local y el servidor las sirve en /config.js
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
