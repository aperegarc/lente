// Limitador en memoria por instancia serverless (IP + ruta).
// Suficiente para cortar abuso hacia Yahoo / Claude-adyacente.

import { getUserFromToken } from './clients.js';

const buckets = new Map();
let hits = 0;

function clientIp(req) {
  const xf = req.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim().slice(0, 64);
  }
  const real = req.headers?.['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim().slice(0, 64);
  return req.socket?.remoteAddress || 'unknown';
}

function prune(now) {
  for (const [k, v] of buckets) {
    if (now >= v.resetAt) buckets.delete(k);
  }
}

function take(req, name, windowMs) {
  const route = name || String(req.url || '').split('?')[0];
  const key = `${clientIp(req)}|${route}`;
  const now = Date.now();
  if (++hits % 250 === 0 || buckets.size > 8000) prune(now);
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket;
}

function setHeaders(res, bucket, limit) {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
}

function reject(res, bucket) {
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({ error: 'Too many requests', retry_after: retryAfter });
  return false;
}

/**
 * @returns {boolean} true si la petición puede continuar
 */
export function rateLimit(req, res, { max, windowMs = 60_000, name } = {}) {
  const limit = Math.max(1, Number(max) || 30);
  const bucket = take(req, name, windowMs);
  setHeaders(res, bucket, limit);
  if (bucket.count > limit) return reject(res, bucket);
  return true;
}

/**
 * Cupo público y, para admins, uno más holgado. Se cuenta ANTES de validar el token:
 * Supabase Auth solo se consulta cuando el cupo público ya se agotó, y como mucho hasta
 * adminMax veces por ventana, así que tokens falsos no pueden amplificar tráfico hacia Auth.
 */
export async function rateLimitRoute(req, res, { max, adminMax, name, windowMs = 60_000 } = {}) {
  const limit = Math.max(1, Number(max) || 30);
  const hardLimit = Math.max(limit, Number(adminMax) || 0);
  const bucket = take(req, name, windowMs);
  if (bucket.count <= limit) {
    setHeaders(res, bucket, limit);
    return true;
  }
  const auth = req.headers?.authorization;
  if (bucket.count <= hardLimit && typeof auth === 'string' && auth.startsWith('Bearer ')) {
    try {
      const ctx = await getUserFromToken(req);
      if (ctx?.profile?.is_admin) {
        setHeaders(res, bucket, hardLimit);
        return true;
      }
    } catch (_) {
      /* cupo público */
    }
  }
  setHeaders(res, bucket, limit);
  return reject(res, bucket);
}
