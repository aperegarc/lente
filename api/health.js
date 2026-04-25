// ============================================================
// /api/health.js — diagnóstico del sistema
// ============================================================

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const checks = {
    environment: process.env.VERCEL ? 'vercel' : 'local',
    vars: {},
    supabase: null,
    tables: {},
    ready: true,
    errors: [],
  };

  // Variables requeridas (sin OPENAI_API_KEY — ya no se usa)
  const required = {
    SUPABASE_URL:         'https://...supabase.co',
    SUPABASE_ANON_KEY:    'eyJ...',
    SUPABASE_SERVICE_KEY: 'eyJ...',
    ANTHROPIC_API_KEY:    'sk-ant-api03-...',
    VOYAGE_API_KEY:       'pa-...',
    CRON_SECRET:          'cadena aleatoria 32+ chars',
  };

  for (const [name, expected] of Object.entries(required)) {
    const val = process.env[name];
    if (!val) {
      checks.vars[name] = `❌ VACÍA — se espera: ${expected}`;
      checks.ready = false;
      checks.errors.push(`${name} no está definida`);
    } else if (val.includes('...') || val === 'changeme' || val.length < 10) {
      checks.vars[name] = `⚠️  PLACEHOLDER`;
      checks.ready = false;
      checks.errors.push(`${name} parece un placeholder`);
    } else {
      checks.vars[name] = `✓ ${val.slice(0, 8)}...${val.slice(-4)} (${val.length} chars)`;
    }
  }

  // Ping a Supabase + verificar tablas
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        { auth: { persistSession: false } }
      );

      // Verificar tablas clave
      const tables = ['sources', 'articles', 'cards', 'profiles', 'markets'];
      for (const table of tables) {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        if (error) {
          checks.tables[table] = `❌ ${error.message}`;
          checks.errors.push(`Tabla '${table}': ${error.message}`);
          checks.ready = false;
        } else {
          checks.tables[table] = `✓ ${count} filas`;
        }
      }

      // Verificar columnas de plan en profiles
      const { data: profileSample } = await supabase
        .from('profiles')
        .select('plan, plan_expires_at, stripe_customer_id')
        .limit(1);

      checks.supabase = profileSample !== null
        ? '✓ OK — columnas de plan presentes'
        : '⚠️  Ejecuta schema-update.sql para añadir columnas de plan';

    } catch (err) {
      checks.supabase = `❌ No conecta: ${err.message}`;
      checks.ready = false;
    }
  }

  checks.deployment = {
    VERCEL_URL: process.env.VERCEL_URL || '(local)',
    host: req.headers.host,
  };

  res.status(checks.ready ? 200 : 503).json(checks);
}