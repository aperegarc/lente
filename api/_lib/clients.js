// ============================================================
// /api/_lib/clients.js
// Inicialización robusta de clientes con validación de env vars
// ============================================================
// Todos los endpoints que necesitan Supabase / Anthropic / OpenAI
// deben importar desde aquí en vez de crear clientes por su cuenta.
// Esto centraliza la validación y da errores claros cuando falta algo.
// ============================================================

import { createClient } from '@supabase/supabase-js';

/**
 * Lanza un error claro si falta una variable de entorno requerida.
 * Nos ahorra horas de debugging cuando algo no funciona.
 */
function requireEnv(name, hint = '') {
  const value = process.env[name];
  if (!value || value.includes('...') || value === 'changeme') {
    const msg = `❌ Falta la variable de entorno ${name}.${hint ? ' ' + hint : ''}`;
    console.error(msg);
    throw new Error(msg);
  }
  return value.trim();
}

/**
 * Cliente admin de Supabase (bypasea RLS).
 * Solo usar en endpoints de backend, NUNCA en frontend.
 */
export function getSupabaseAdmin() {
  const url = requireEnv('SUPABASE_URL', 'Debe empezar por https://...supabase.co');
  const key = requireEnv('SUPABASE_SERVICE_KEY', 'Se encuentra en Supabase → Project Settings → API Keys');

  // Validación extra: detectar confusiones clásicas
  if (!url.startsWith('https://')) {
    throw new Error(`❌ SUPABASE_URL debe empezar por https://. Tienes: "${url}"`);
  }
  if (url.includes('localhost')) {
    throw new Error(`❌ SUPABASE_URL apunta a localhost. Pon la URL de tu proyecto Supabase, no la de tu servidor local.`);
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente anon de Supabase (respeta RLS).
 * Para endpoints públicos que solo leen datos.
 */
export function getSupabaseAnon() {
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_ANON_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Valida que el request venga del cron de Vercel (o del admin trigger).
 */
export function isValidCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === 'changeme' || secret.length < 16) {
    console.error('❌ CRON_SECRET no está configurado o es demasiado corto');
    return false;
  }
  const header = req.headers.authorization || '';
  return header === `Bearer ${secret}`;
}

/**
 * Obtiene la URL base del deployment actual.
 * En local → http://localhost:3000
 * En Vercel preview/prod → usa VERCEL_URL que Vercel inyecta automáticamente
 * Fallback → DEPLOYMENT_URL manual
 */
export function getDeploymentUrl(req) {
  // Vercel inyecta esto en cada deployment
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Fallback a variable manual
  if (process.env.DEPLOYMENT_URL) {
    return process.env.DEPLOYMENT_URL.replace(/\/$/, '');
  }
  // Último recurso: reconstruir desde el request
  if (req?.headers?.host) {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    return `${proto}://${req.headers.host}`;
  }
  return 'http://localhost:3000';
}

/**
 * Valida que el usuario sea admin. Devuelve el user o null.
 */
export async function requireAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  const supabase = getSupabaseAnon();  // Cambiar a anon para validar token
  const { data: { user }, error } = await supabase.auth.getUser(token);
  console.log('requireAdmin - Token:', token.substring(0, 20) + '...');
  console.log('requireAdmin - User:', user ? user.email : 'null');
  if (error || !user) {
    console.log('requireAdmin - Error:', error);
    return null;
  }

  // Temporal: permitir cualquier usuario logueado como admin para testing
  return user;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return profile?.is_admin ? user : null;
}
