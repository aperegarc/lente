// ============================================================
// /api/health.js
// Diagnóstico rápido: comprueba que todo está configurado.
// Abre http://localhost:3000/api/health en el navegador para verlo.
// ============================================================

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const checks = {
    environment: process.env.VERCEL ? 'vercel' : 'local',
    vars: {},
    supabase: null,
    ready: true,
    errors: [],
  };

  // ===== Variables de entorno =====
  const required = {
    SUPABASE_URL: 'https://...supabase.co',
    SUPABASE_ANON_KEY: 'eyJ... o sb_publishable_...',
    SUPABASE_SERVICE_KEY: 'eyJ... o sb_secret_...',
    ANTHROPIC_API_KEY: 'sk-ant-api03-...',
    OPENAI_API_KEY: 'sk-proj-...',
    CRON_SECRET: 'cadena aleatoria 32+ chars',
  };

  for (const [name, expected] of Object.entries(required)) {
    const val = process.env[name];
    if (!val) {
      checks.vars[name] = `❌ VACÍA — se espera: ${expected}`;
      checks.ready = false;
      checks.errors.push(`${name} no está definida`);
    } else if (val.includes('...') || val === 'changeme' || val.length < 10) {
      checks.vars[name] = `⚠️  PLACEHOLDER — se espera: ${expected}`;
      checks.ready = false;
      checks.errors.push(`${name} parece un placeholder, no una key real`);
    } else if (val.endsWith('`') || val.startsWith('`')) {
      checks.vars[name] = `⚠️  BACKTICK al inicio o final — revisa copia/pega`;
      checks.ready = false;
      checks.errors.push(`${name} tiene backticks pegados`);
    } else {
      // Mostrar primeros y últimos caracteres para confirmar que es correcta
      checks.vars[name] = `✓ ${val.slice(0, 10)}...${val.slice(-4)} (${val.length} chars)`;
    }
  }

  // ===== Validaciones específicas =====
  if (process.env.SUPABASE_URL) {
    if (!process.env.SUPABASE_URL.startsWith('https://')) {
      checks.errors.push('SUPABASE_URL debe empezar por https://');
      checks.ready = false;
    }
    if (process.env.SUPABASE_URL.includes('localhost')) {
      checks.errors.push('SUPABASE_URL apunta a localhost — debe ser la URL de tu proyecto en supabase.co');
      checks.ready = false;
    }
  }

  // ===== Ping a Supabase =====
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        { auth: { persistSession: false } }
      );
      const { count, error } = await supabase
        .from('sources')
        .select('*', { count: 'exact', head: true });

      if (error) {
        checks.supabase = `❌ Error: ${error.message}`;
        checks.errors.push('Supabase responde pero la consulta falla. ¿Has ejecutado schema.sql?');
        checks.ready = false;
      } else {
        checks.supabase = `✓ OK — ${count} fuentes en la tabla 'sources'`;
      }
    } catch (err) {
      checks.supabase = `❌ No conecta: ${err.message}`;
      checks.ready = false;
    }
  }

  // ===== Deployment URL info =====
  checks.deployment = {
    VERCEL_URL: process.env.VERCEL_URL || '(no definida — normal en local)',
    DEPLOYMENT_URL: process.env.DEPLOYMENT_URL || '(no definida)',
    request_host: req.headers.host,
    detected: process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://${req.headers.host || 'localhost:3000'}`,
  };

  res.status(checks.ready ? 200 : 503).json(checks);
}
