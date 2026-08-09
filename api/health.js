// ============================================================
// /api/health.js — diagnóstico del sistema
// ============================================================

import { createClient } from '@supabase/supabase-js';
import {
  getStripeSecretKey,
  getStripeSecretKeyDiagnostics,
} from './_lib/clients.js';

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

  checks.vars.FINNHUB_API_KEY =
    '○ no usada (Finnhub retirado; velas Yahoo, mercados Yahoo/RSS sources)';

  const sk = getStripeSecretKey();
  const stripeDx = getStripeSecretKeyDiagnostics();
  if (sk) {
    checks.vars.STRIPE = `○ pagos (${sk.slice(0, 7)}...)`;
  } else {
    const hints = {
      unset:
        'STRIPE_SECRET_KEY no está en este deployment. En Vercel: edita la variable y marca Production + Preview (o Development), guarda y Redeploy. Las URLs de preview no usan solo Production.',
      placeholder:
        'Valor tipo placeholder (… o changeme). Pega la Secret key completa desde Stripe → Developers → API keys.',
      bad_prefix:
        'Debe ser la Secret key (sk_test_… / sk_live_…), no la publishable (pk_…).',
      too_short: 'Key demasiado corta (copia incompleta).',
    };
    const reason = stripeDx.reason || 'invalid';
    checks.vars.STRIPE = `○ suscripciones desactivadas — ${hints[reason] || reason}`;
  }
  checks.stripe_key_status = stripeDx.ok
    ? { ok: true }
    : {
        ok: false,
        reason: stripeDx.reason,
        vercel_env_hint:
          process.env.VERCEL_ENV === 'preview'
            ? 'Este request es un deployment Preview: la variable debe existir para entorno "Preview".'
            : process.env.VERCEL_ENV === 'production'
              ? 'Deployment Production: la variable debe existir para entorno "Production".'
              : null,
      };

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