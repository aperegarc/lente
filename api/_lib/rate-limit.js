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

/**
 * @returns {boolean} true si la petición puede continuar
 */
export function rateLimit(req, res, { max, windowMs = 60_000, name } = {}) {
  const limit = Math.max(1, Number(max) || 30);
  const ip = clientIp(req);
  const route = name || String(req.url || '').split('?')[0];
  const key = `${ip}|${route}`;
  const now = Date.now();

  if (++hits % 250 === 0 || buckets.size > 8000) prune(now);

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  const remaining = Math.max(0, limit - bucket.count);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > limit) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Too many requests',
      retry_after: retryAfter,
    });
    return false;
  }
  return true;
}

/** Igual que rateLimit, con cupo más holgado si hay Bearer de admin. */
export async function rateLimitRoute(req, res, { max, adminMax, name, windowMs } = {}) {
  let limit = max;
  const auth = req.headers?.authorization;
  if (adminMax && typeof auth === 'string' && auth.startsWith('Bearer ')) {
    try {
      const ctx = await getUserFromToken(req);
      if (ctx?.profile?.is_admin) limit = adminMax;
    } catch (_) {
      /* cupo público */
    }
  }
  return rateLimit(req, res, { max: limit, windowMs, name });
}
