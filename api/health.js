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

  // Variables requeridas (la generación de tarjetas ya no usa OpenAI)
  const required = {
    SUPABASE_URL: 'https://...supabase.co',
    SUPABASE_ANON_KEY: 'eyJ...',
    SUPABASE_SERVICE_KEY: 'eyJ...',
    ANTHROPIC_API_KEY: 'sk-ant-api03-...',
    CRON_SECRET: 'cadena aleatoria 32+ chars',
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

  const openai = process.env.OPENAI_API_KEY;
  if (openai && !openai.includes('...') && openai.length >= 10) {
    checks.vars.OPENAI_API_KEY = `○ opcional legada (${openai.slice(0, 8)}...)`;
  } else {
    checks.vars.OPENAI_API_KEY = '○ no usada por generate.js (solo Claude)';
  }

  const fh = process.env.FINNHUB_API_KEY;
  if (fh && !fh.includes('...') && fh.length >= 8) {
    checks.vars.FINNHUB_API_KEY = `○ ingest (${fh.slice(0, 6)}...)`;
  } else {
    checks.vars.FINNHUB_API_KEY = '○ sin configurar (solo RSS)';
  }

  const sk = process.env.STRIPE_SECRET_KEY;
  if (sk && !sk.includes('...') && sk.length > 20) {
    checks.vars.STRIPE = `○ pagos (${sk.slice(0, 7)}...)`;
  } else {
    checks.vars.STRIPE = '○ suscripciones desactivadas (faltan claves Stripe)';
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