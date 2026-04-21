// ============================================================
// /public/config.js
// Configuración del cliente — rellena estos valores tras crear
// tu proyecto en Supabase.
// ============================================================

window.LENTE_CONFIG = {
  // Supabase → Project Settings → API
  SUPABASE_URL:      'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_ANON_KEY',

  // Endpoints de la API (relative → mismo dominio que la PWA)
  API: {
    feed:    '/api/feed',
    markets: '/api/markets',
  },
};
