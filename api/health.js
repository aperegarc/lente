// ============================================================
// /api/health.js — diagnóstico (protegido en producción)
// ============================================================

import { createClient } from '@supabase/supabase-js';
import {
  getStripeSecretKey,
  getStripeSecretKeyDiagnostics,
  requireAdmin,
} from './_lib/clients.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isProd = process.env.VERCEL_ENV === 'production';
  if (isProd) {
    const admin = await requireAdmin(req);
    if (!admin) {
      return res.status(404).json({ error: 'Not found' });
    }
  }

  const checks = {
    environment: process.env.VERCEL ? 'vercel' : 'local',
    vars: {},
    supabase: null,
    tables: {},
    ready: true,
    errors: [],
  };

  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_KEY',
    'ANTHROPIC_API_KEY',
    'CRON_SECRET',
  ];

  for (const name of required) {
    const val = process.env[name];
    if (!val || val.includes('...') || val === 'changeme' || val.length < 10) {
      checks.vars[name] = '❌ missing or placeholder';
      checks.ready = false;
      checks.errors.push(`${name} not configured`);
    } else {
      checks.vars[name] = '✓ configured';
    }
  }

  checks.vars.MARKET_DATA =
    'Yahoo Finance v8 · Frankfurter · CoinGecko';

  const stripeDx = getStripeSecretKeyDiagnostics();
  checks.vars.STRIPE = stripeDx.ok ? '✓ configured' : '○ optional / not configured';

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        { auth: { persistSession: false } },
      );

      const tables = ['sources', 'articles', 'cards', 'profiles', 'markets'];
      for (const table of tables) {
        const { count, error } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true });
        if (error) {
          checks.tables[table] = 'error';
          checks.errors.push(`Table ${table}: unavailable`);
          checks.ready = false;
        } else {
          checks.tables[table] = count ?? 0;
        }
      }

      const { error: profileErr } = await supabase
        .from('profiles')
        .select('plan')
        .limit(1);

      checks.supabase = profileErr ? 'schema issue' : 'ok';
      if (profileErr) checks.ready = false;
    } catch {
      checks.supabase = 'connection failed';
      checks.ready = false;
    }
  }

  checks.deployment = {
    env: process.env.VERCEL_ENV || 'local',
  };

  res.status(checks.ready ? 200 : 503).json(checks);
}
