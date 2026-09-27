// Servidor local sin dependencias npm: sirve /public con las rewrites de vercel.json
// y responde a las APIs públicas con datos de demostración.
// Uso: node local-demo/server.mjs   (PORT=3000 por defecto)

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedPayload, allCards, marketsPayload, candlesPayload } from './demo-data.mjs';
import { handleSessionCookie } from '../api/_lib/session-cookie.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const vercel = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function rewrite(pathname) {
  for (const r of vercel.rewrites || []) {
    const src = r.source.replace(/:path\*/, '(.*)');
    const m = pathname.match(new RegExp(`^${src}$`));
    if (m) return r.destination;
  }
  return pathname;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function publicConfig(origin) {
  const config = {
    SUPABASE_URL: `${origin}/__demo-supabase`,
    SUPABASE_ANON_KEY: 'demo-anon-key',
    DEMO: true,
    API: {
      feed: '/api/feed',
      feedHistory: '/api/feed-history',
      cards: '/api/cards',
      markets: '/api/markets',
      candles: '/api/candles',
    },
  };
  return `window.LENTE_CONFIG = ${JSON.stringify(config)};`;
}

/** Añade req.query, res.status() y res.json() como en las funciones de Vercel. */
function vercelShim(req, res, query) {
  req.query = Object.fromEntries(query);
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
}

function handleApi(route, query, req, res) {
  const origin = `http://${req.headers.host || `localhost:${PORT}`}`;
  switch (route) {
    case '/api/public-config':
      if (query.get('op') === 'session') {
        vercelShim(req, res, query);
        return handleSessionCookie(req, res);
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(publicConfig(origin));
    case '/api/health':
      return sendJson(res, 200, {
        environment: 'local-demo',
        ready: true,
        mode: 'demo',
        note: 'Servidor de demostración: sin Supabase, Anthropic ni Stripe. Datos simulados.',
        errors: [],
      });
    case '/api/feed':
      return sendJson(res, 200, feedPayload({
        premium: query.get('premium') === '1',
        category: query.get('category') || '',
      }));
    case '/api/feed-history':
      return sendJson(res, 403, { error: 'premium_required', message: 'El histórico requiere Premium.' });
    case '/api/cards': {
      const ids = new Set((query.get('ids') || '').split(',').filter(Boolean));
      return sendJson(res, 200, { cards: allCards().filter((c) => ids.has(c.id)) });
    }
    case '/api/markets':
      return sendJson(res, 200, marketsPayload());
    case '/api/candles': {
      const symbol = query.get('symbol');
      const from = Number(query.get('from'));
      const to = Number(query.get('to'));
      if (!symbol) return sendJson(res, 400, { error: 'Falta symbol' });
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
        return sendJson(res, 400, { error: 'Rango from/to inválido' });
      }
      return sendJson(res, 200, candlesPayload(symbol, query.get('resolution') || '60', from, to));
    }
    default:
      return sendJson(res, 501, {
        error: 'No disponible en modo demo',
        detail: `${route} necesita Supabase/Anthropic/Stripe (usa \`npm run dev\` con .env.local).`,
      });
  }
}

async function serveStatic(pathname, res, range) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const st = await stat(file).catch(() => null);
    if (!st && vercel.cleanUrls && !path.extname(file)) file += '.html';
    const body = await readFile(file);
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' };
    for (const h of vercel.headers || []) {
      if (h.source === '/(.*)') for (const { key, value } of h.headers) headers[key] = value;
    }
    if (pathname === '/sw.js') headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    headers['Accept-Ranges'] = 'bytes';
    // El vídeo que avanza con el scroll necesita respuestas parciales para poder saltar.
    const m = /^bytes=(\d*)-(\d*)$/.exec(range || '');
    if (m && (m[1] || m[2])) {
      const size = body.length;
      let start = m[1] ? Number(m[1]) : size - Number(m[2]);
      let end = m[1] && m[2] ? Number(m[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(end, size - 1);
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      return res.end(body.subarray(start, end + 1));
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 · No encontrado');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/__demo-supabase')) {
    return sendJson(res, 503, { error: 'Supabase no disponible en modo demo' });
  }
  const target = new URL(rewrite(url.pathname), url.origin);
  for (const [k, v] of target.searchParams) url.searchParams.set(k, v);

  if (target.pathname.startsWith('/api/')) {
    try {
      return await handleApi(target.pathname.replace(/\/$/, ''), url.searchParams, req, res);
    } catch (err) {
      console.error('[demo]', err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Error interno' });
      return;
    }
  }
  return serveStatic(target.pathname, res, req.headers.range);
});

server.listen(PORT, HOST, () => {
  console.log(`lente · modo demo local en http://localhost:${PORT}`);
  console.log('  Datos simulados: sin Supabase, Anthropic ni Stripe.');
});
