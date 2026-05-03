// ============================================================
// /api/_lib/clients.js
// ============================================================

import { createClient } from '@supabase/supabase-js';

function requireEnv(name, hint = '') {
  const value = process.env[name];
  if (!value || value.includes('...') || value === 'changeme') {
    const msg = `❌ Falta la variable de entorno ${name}.${hint ? ' ' + hint : ''}`;
    console.error(msg);
    throw new Error(msg);
  }
  return value.trim();
}

function normalizeStripeSecretInput() {
  let s = process.env.STRIPE_SECRET_KEY;
  if (s == null || s === '') return { value: null, reason: 'unset' };
  s = String(s).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (!s) return { value: null, reason: 'unset' };
  if (s.includes('...') || s === 'changeme') return { value: null, reason: 'placeholder' };
  if (!s.startsWith('sk_')) return { value: null, reason: 'bad_prefix' };
  if (s.length < 20) return { value: null, reason: 'too_short' };
  return { value: s, reason: null };
}

/** Secret key de Stripe (`sk_test_…` / `sk_live_`). Quita comillas si se pegaron por error. */
export function getStripeSecretKey() {
  return normalizeStripeSecretInput().value;
}

/** Para `/api/health`: por qué falla Stripe sin exponer la clave. */
export function getStripeSecretKeyDiagnostics() {
  const { value, reason } = normalizeStripeSecretInput();
  if (value) return { ok: true, reason: null };
  return { ok: false, reason };
}

export function getSupabaseAdmin() {
  const url = requireEnv('SUPABASE_URL', 'Debe empezar por https://...supabase.co');
  const key = requireEnv('SUPABASE_SERVICE_KEY', 'Se encuentra en Supabase → Project Settings → API Keys');
  if (!url.startsWith('https://')) throw new Error(`❌ SUPABASE_URL debe empezar por https://`);
  if (url.includes('localhost')) throw new Error(`❌ SUPABASE_URL apunta a localhost.`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getSupabaseAnon() {
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_ANON_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isValidCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === 'changeme' || secret.length < 16) {
    console.error('❌ CRON_SECRET no está configurado o es demasiado corto');
    return false;
  }
  return (req.headers.authorization || '') === `Bearer ${secret}`;
}

/** Fuerza http:// para loopback (vercel dev no sirve TLS en tu máquina). */
function coerceLoopbackToHttp(baseUrl) {
  try {
    const u = new URL(baseUrl);
    const hn = u.hostname.replace(/^\[|\]$/g, '');
    if (hn === 'localhost' || hn === '127.0.0.1' || hn === '::1') {
      u.protocol = 'http:';
      return u.origin;
    }
  } catch (_) {
    /* ignore */
  }
  return baseUrl.replace(/\/$/, '');
}

/** Origen HTTP(S) para llamadas server→server (triggers → cron). */
export function getDeploymentUrl(req) {
  let base;

  if (process.env.VERCEL_URL) {
    const hostPart = process.env.VERCEL_URL.replace(/^https?:\/\//, '').split('/')[0];
    base = `https://${hostPart}`;
  } else if (process.env.DEPLOYMENT_URL) {
    base = process.env.DEPLOYMENT_URL.replace(/\/$/, '');
  } else if (req?.headers?.host) {
    const host = String(req.headers.host).trim();
    const forwarded = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const isSecureHeader = proto === 'https' || proto === 'http';
    const useHttp =
      /^localhost(?::\d+)?$/i.test(host) ||
      /^127\.0\.0\.1(?::\d+)?$/.test(host) ||
      /^\[::1\](?::\d+)?$/i.test(host);
    const scheme = useHttp ? 'http' : (isSecureHeader ? proto : 'https');
    base = `${scheme}://${host}`;
  } else {
    base = 'http://localhost:3000';
  }

  return coerceLoopbackToHttp(base);
}

// ============================================================
// requireAdmin — CORREGIDO: verifica is_admin=true en profiles
// ============================================================
export async function requireAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  let supabase;
  try { supabase = getSupabaseAnon(); } catch { return null; }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    console.log('[requireAdmin] Token inválido');
    return null;
  }

  // Verificar is_admin con cliente admin (bypasea RLS)
  let adminClient;
  try { adminClient = getSupabaseAdmin(); } catch { return null; }

  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('is_admin, plan')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile?.is_admin) {
    console.log(`[requireAdmin] ${user.email} no es admin`);
    return null;
  }

  console.log(`[requireAdmin] Admin verificado: ${user.email}`);
  return { ...user, profile };
}

// ============================================================
// getUserFromToken — devuelve user + profile con plan
// Para endpoints que restringen contenido por plan
// ============================================================
export async function getUserFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  let supabase;
  try { supabase = getSupabaseAnon(); } catch { return null; }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  let adminClient;
  try { adminClient = getSupabaseAdmin(); } catch { return null; }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('plan, plan_expires_at, is_admin')
    .eq('id', user.id)
    .single();

  // Si el plan premium ha expirado, degradar a free automáticamente
  const now = new Date();
  let effectivePlan = profile?.plan || 'free';
  if (effectivePlan === 'premium' && profile?.plan_expires_at) {
    if (new Date(profile.plan_expires_at) < now) {
      effectivePlan = 'free';
      // Actualizar en BD de forma silenciosa
      adminClient.from('profiles')
        .update({ plan: 'free' })
        .eq('id', user.id)
        .then(() => {});
    }
  }

  return {
    ...user,
    profile: {
      plan: effectivePlan,
      plan_expires_at: profile?.plan_expires_at || null,
      is_admin: profile?.is_admin || false,
    },
  };
}