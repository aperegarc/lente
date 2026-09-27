// Una sola función para panel, disparos y diagnóstico.
// Las URLs antiguas (/api/admin/me, /api/health, …) llegan aquí por rewrite.

import { createClient } from '@supabase/supabase-js';
import {
  asCronRequest,
  createJsonRes,
  getStripeSecretKeyDiagnostics,
  getSupabaseAdmin,
  requireAdmin,
} from './_lib/clients.js';
import { clampInt, firstQuery, isIsoDate, isUuid, publicError, QUERY_LIMITS, sanitizeText } from './_lib/validate.js';

const ALLOWED_UPDATE_FIELDS = [
  'headline', 'deck', 'body', 'meaning', 'category', 'sources_text',
  'read_time_seconds', 'primary_source_url', 'legal_tag', 'is_ai_generated',
];

const FIELD_LIMITS = {
  headline: 500,
  deck: 800,
  body: 12000,
  meaning: 4000,
  category: 80,
  sources_text: 500,
  primary_source_url: 2048,
  legal_tag: 300,
};

function opOf(req) {
  const q = firstQuery(req.query?.op).trim();
  if (q) return q;
  const path = String(req.url || '').split('?')[0];
  const admin = path.match(/\/api\/admin\/([^/]+)/);
  if (admin) return admin[1];
  if (path.includes('/health')) return 'health';
  return '';
}

export default async function handler(req, res) {
  switch (opOf(req)) {
    case 'me':
      return handleMe(req, res);
    case 'cards':
      return handleCards(req, res);
    case 'trigger':
      return handleTrigger(req, res);
    case 'clear-cache':
      return handleClearCache(req, res);
    case 'health':
      return handleHealth(req, res);
    default:
      return res.status(404).json({ error: 'Not found' });
  }
}

async function handleMe(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ ok: false, is_admin: false, error: 'Admin only' });
  return res.status(200).json({
    ok: true,
    is_admin: true,
    email: admin.email || null,
    id: admin.id,
    plan: admin.profile?.plan || null,
  });
}

async function handleCards(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return publicError(res, 401, 'Admin only');

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return publicError(res, 500, 'Error interno');
  }

  if (req.method === 'GET') {
    const { status, date, limit: limitRaw } = req.query;
    const limit = clampInt(limitRaw, 1, 200, 200);
    let query = supabase.from('cards').select('*').order('generated_at', { ascending: false });
    if (status && typeof status === 'string') {
      const allowed = ['pending', 'approved', 'rejected', 'published'];
      if (allowed.includes(status)) query = query.eq('status', status);
    }
    if (date && isIsoDate(String(date))) query = query.eq('edition_date', String(date).trim());
    const { data, error } = await query.limit(limit);
    if (error) return publicError(res, 500, 'Error interno');
    return res.status(200).json({ cards: data || [] });
  }

  if (req.method === 'POST') {
    const { action, id, updates } = req.body || {};
    try {
      if (JSON.stringify(req.body || {}).length > QUERY_LIMITS.jsonBodyBytes) {
        return publicError(res, 413, 'Body demasiado grande');
      }
    } catch {
      return publicError(res, 400, 'JSON inválido');
    }
    if (!isUuid(id)) return publicError(res, 400, 'id inválido');

    if (action === 'approve') {
      const { error } = await supabase.from('cards').update({ status: 'approved' }).eq('id', id);
      if (error) return publicError(res, 500, 'Error interno');
      return res.status(200).json({ ok: true });
    }
    if (action === 'reject') {
      const { error } = await supabase.from('cards').update({ status: 'rejected' }).eq('id', id);
      if (error) return publicError(res, 500, 'Error interno');
      return res.status(200).json({ ok: true });
    }
    if (action === 'update') {
      const clean = {};
      for (const k of ALLOWED_UPDATE_FIELDS) {
        if (updates?.[k] === undefined) continue;
        if (k === 'read_time_seconds') clean[k] = clampInt(updates[k], 20, 120, 40);
        else if (k === 'is_ai_generated') clean[k] = Boolean(updates[k]);
        else if (k === 'primary_source_url') {
          const url = sanitizeText(updates[k], FIELD_LIMITS[k]);
          if (url && !/^https?:\/\//i.test(url)) {
            return publicError(res, 400, 'primary_source_url debe ser http(s)');
          }
          clean[k] = url;
        } else if (FIELD_LIMITS[k]) clean[k] = sanitizeText(updates[k], FIELD_LIMITS[k]);
      }
      const { error } = await supabase.from('cards').update(clean).eq('id', id);
      if (error) return publicError(res, 500, 'Error interno');
      return res.status(200).json({ ok: true });
    }
    if (action === 'publish_all') {
      const editionDate =
        typeof req.body?.edition_date === 'string' ? req.body.edition_date.trim().slice(0, 10) : '';
      let q = supabase
        .from('cards')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('status', 'approved');
      if (editionDate && isIsoDate(editionDate)) q = q.eq('edition_date', editionDate);
      const { data, error } = await q.select('id');
      if (error) return publicError(res, 500, 'Error interno');
      return res.status(200).json({ ok: true, published: Array.isArray(data) ? data.length : 0 });
    }
    return publicError(res, 400, 'Unknown action');
  }

  res.setHeader('Allow', 'GET, POST');
  return publicError(res, 405, 'Method not allowed');
}

async function handleTrigger(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin only' });

  let job;
  try {
    const body = await readJson(req);
    job = body?.job;
  } catch {
    job = undefined;
  }
  if (job !== 'ingest' && job !== 'generate') {
    return res.status(400).json({ error: 'Body debe incluir "job": "ingest" | "generate"' });
  }

  try {
    const mod =
      job === 'ingest'
        ? await import('../lib/cron/ingest.js')
        : await import('../lib/cron/generate.js');
    const cronReq = asCronRequest(req, job);
    if (job === 'ingest') {
      cronReq.query = { ...cronReq.query, skipGenerate: '1' };
      cronReq.headers = { ...cronReq.headers, 'x-lente-skip-generate': '1' };
    }
    const { res: cronRes, out } = createJsonRes();
    await mod.default(cronReq, cronRes);
    if (out.statusCode >= 400) {
      return res.status(out.statusCode).json({
        ok: false,
        triggered: job,
        error: out.body?.error || `Job ${job} falló`,
        result: out.body,
      });
    }
    return res.status(200).json({ ok: true, triggered: job, result: out.body });
  } catch (err) {
    console.error(`[trigger] ${job}:`, err.message);
    return res.status(500).json({ error: 'Error interno' });
  }
}

async function readJson(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const { default: getRawBody } = await import('raw-body');
  const buf = await getRawBody(req, { length: req.headers['content-length'], limit: '1mb' });
  const raw = buf.toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function handleClearCache(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Admin only' });

  const clearedAt = new Date().toISOString();
  const cacheVersion = `lente-${Date.now()}`;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('app_meta').upsert(
      { key: 'client_cache_version', value: cacheVersion, updated_at: clearedAt },
      { onConflict: 'key' },
    );
    if (error) console.warn('[clear-cache] app_meta:', error.message);
  } catch (err) {
    console.warn('[clear-cache] app_meta skip:', err.message);
  }
  return res.status(200).json({
    ok: true,
    cleared_at: clearedAt,
    cache_version: cacheVersion,
    hint: 'Los clientes con service worker recibirán CLEAR_CACHE al recargar; en este navegador se limpia al instante.',
  });
}

async function handleHealth(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (process.env.VERCEL === '1') {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(404).json({ error: 'Not found' });
  }

  const checks = {
    environment: process.env.VERCEL ? 'vercel' : 'local',
    vars: {},
    supabase: null,
    tables: {},
    ready: true,
    errors: [],
  };
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY', 'CRON_SECRET']) {
    const val = process.env[name];
    const min = name === 'CRON_SECRET' ? 32 : 10;
    if (!val || val.includes('...') || val === 'changeme' || val.length < min) {
      checks.vars[name] = '❌ missing or placeholder';
      checks.ready = false;
      checks.errors.push(`${name} not configured`);
    } else {
      checks.vars[name] = '✓ configured';
    }
  }
  checks.vars.MARKET_DATA = 'Yahoo Finance v8 · Frankfurter · CoinGecko';
  const stripeDx = getStripeSecretKeyDiagnostics();
  checks.vars.STRIPE = stripeDx.ok ? '✓ configured' : '○ optional / not configured';

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false },
      });
      for (const table of ['sources', 'articles', 'cards', 'profiles', 'markets']) {
        const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
        if (error) {
          checks.tables[table] = 'error';
          checks.errors.push(`Table ${table}: unavailable`);
          checks.ready = false;
        } else {
          checks.tables[table] = count ?? 0;
        }
      }
      const { error: profileErr } = await supabase.from('profiles').select('plan').limit(1);
      checks.supabase = profileErr ? 'schema issue' : 'ok';
      if (profileErr) checks.ready = false;
    } catch {
      checks.supabase = 'connection failed';
      checks.ready = false;
    }
  }
  checks.deployment = { env: process.env.VERCEL_ENV || 'local' };
  return res.status(checks.ready ? 200 : 503).json(checks);
}
