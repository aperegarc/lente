// /api/session — cookie HttpOnly con el refresh token de Supabase para que la sesión
// sobreviva a borrados de localStorage (Safari ITP, PWA reinstalada, limpieza del navegador).
// GET: devuelve el token guardado · POST { refresh_token }: lo guarda · DELETE: lo borra.

export const SESSION_COOKIE = 'lente_session';
const COOKIE_PATH = '/api/session';
// Chrome limita la caducidad de las cookies a 400 días; se renueva en cada refresco de token.
const MAX_AGE_S = 400 * 24 * 60 * 60;
const TOKEN_RE = /^[A-Za-z0-9._-]{8,512}$/;
const MAX_BODY_BYTES = 4096;

function readCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function isHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https' || process.env.VERCEL === '1';
}

function cookieHeader(req, value, maxAge) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

/** Solo peticiones del propio sitio (evita que otra web fije o lea la sesión). */
function isSameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readJsonBody(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export async function handleSessionCookie(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');

  if (!isSameOrigin(req)) return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token || !TOKEN_RE.test(token)) return res.status(200).json({ refresh_token: null });
    return res.status(200).json({ refresh_token: token });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return res.status(400).json({ error: 'JSON inválido' });
    }
    const token = typeof body?.refresh_token === 'string' ? body.refresh_token.trim() : '';
    if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'refresh_token inválido' });
    res.setHeader('Set-Cookie', cookieHeader(req, token, MAX_AGE_S));
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
