// ============================================================
// /public/config.js
// Configuración del cliente — rellena estos valores tras crear
// tu proyecto en Supabase.
// ============================================================

window.LENTE_CONFIG = {
  // Supabase → Project Settings → API
  SUPABASE_URL:      'https://eijmaggyxscpbnsbqrwu.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpam1hZ2d5eHNjcGJuc2Jxcnd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NzIzMzUsImV4cCI6MjA5MjM0ODMzNX0.WGRSRs84tuD1m3vP7mWRsaEVbWbAIC82GteVFilvCyQ',
  IEX_API_KEY: '69edd891614886.20624499',

  // Endpoints de la API (relative → mismo dominio que la PWA)
  API: {
    feed:         '/api/feed',
    feedHistory:  '/api/feed-history',
    markets:      '/api/markets',
    candles:      '/api/candles',
  },
};
