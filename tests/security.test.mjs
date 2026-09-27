import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Doble de @supabase/supabase-js: el repo no instala dependencias para los tests.
const STUB = `
export function createClient() {
  const sb = globalThis.__sb;
  const builder = (table) => {
    const ops = [];
    const b = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (ok, ko) => Promise.resolve(sb.query(table, ops)).then(ok, ko);
        }
        return (...args) => { ops.push([prop, ...args]); return b; };
      },
    });
    return b;
  };
  return {
    auth: { getUser: async (token) => { sb.authCalls += 1; return sb.getUser(token); } },
    from: builder,
  };
}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@supabase/supabase-js') {
      return { url: 'data:text/javascript,' + encodeURIComponent(STUB), shortCircuit: true };
    }
    return next(specifier, context);
  },
});

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key-for-tests-0000';
process.env.SUPABASE_SERVICE_KEY = 'service-key-for-tests-0000';

const sb = (globalThis.__sb = {
  authCalls: 0,
  admin: false,
  getUser: async (token) =>
    token === 'good' ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'bad' } },
  query: (table) => {
    if (table === 'profiles') return { data: { plan: 'free', is_admin: sb.admin }, error: null };
    return { data: [], error: null };
  },
});

const { rateLimitRoute, rateLimit } = await import('../api/_lib/rate-limit.js');
const { isValidCronRequest } = await import('../api/_lib/clients.js');
const { default: feed } = await import('../api/feed.js');

let ipSeq = 0;
function fakeReq({ ip, auth, url = '/api/x', query = {} } = {}) {
  const headers = { 'x-forwarded-for': ip };
  if (auth) headers.authorization = auth;
  return { headers, url, query, method: 'GET' };
}
function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
  };
}

describe('rate limit antes de validar tokens', () => {
  beforeEach(() => { sb.authCalls = 0; sb.admin = false; });

  test('tokens falsos no generan llamadas a Supabase Auth dentro del cupo público', async () => {
    const ip = `10.0.0.${++ipSeq}`;
    for (let i = 0; i < 60; i++) {
      assert.equal(await rateLimitRoute(fakeReq({ ip, auth: 'Bearer basura' }), fakeRes(), { max: 60, adminMax: 180, name: 't1' }), true);
    }
    assert.equal(sb.authCalls, 0);
  });

  test('tras el cupo público solo pasa un admin y como mucho hasta adminMax', async () => {
    const ip = `10.0.0.${++ipSeq}`;
    for (let i = 0; i < 5; i++) await rateLimitRoute(fakeReq({ ip }), fakeRes(), { max: 5, adminMax: 8, name: 't2' });

    const anon = fakeRes();
    assert.equal(await rateLimitRoute(fakeReq({ ip, auth: 'Bearer good' }), anon, { max: 5, adminMax: 8, name: 't2' }), false);
    assert.equal(anon.statusCode, 429);

    sb.admin = true;
    assert.equal(await rateLimitRoute(fakeReq({ ip, auth: 'Bearer good' }), fakeRes(), { max: 5, adminMax: 8, name: 't2' }), true);
    await rateLimitRoute(fakeReq({ ip, auth: 'Bearer good' }), fakeRes(), { max: 5, adminMax: 8, name: 't2' });
    const calls = sb.authCalls;
    const over = fakeRes();
    assert.equal(await rateLimitRoute(fakeReq({ ip, auth: 'Bearer good' }), over, { max: 5, adminMax: 8, name: 't2' }), false);
    assert.equal(over.statusCode, 429);
    assert.equal(sb.authCalls, calls, 'por encima de adminMax ya no se consulta Auth');
  });

  test('rateLimit responde 429 con Retry-After', () => {
    const ip = `10.0.0.${++ipSeq}`;
    rateLimit(fakeReq({ ip }), fakeRes(), { max: 1, name: 't3' });
    const res = fakeRes();
    assert.equal(rateLimit(fakeReq({ ip }), res, { max: 1, name: 't3' }), false);
    assert.equal(res.statusCode, 429);
    assert.ok(Number(res.headers['retry-after']) >= 1);
  });
});

describe('secreto del cron', () => {
  const secret = 'x'.repeat(40);
  test('acepta solo el Bearer exacto', () => {
    process.env.CRON_SECRET = secret;
    assert.equal(isValidCronRequest(fakeReq({ auth: `Bearer ${secret}` })), true);
    assert.equal(isValidCronRequest(fakeReq({ auth: `Bearer ${secret.slice(1)}y` })), false);
    assert.equal(isValidCronRequest(fakeReq({ auth: `Bearer ${secret}extra` })), false);
    assert.equal(isValidCronRequest(fakeReq({})), false);
  });
});

describe('caché del feed', () => {
  test('anónimo sin ?auth → cacheable en la CDN', async () => {
    const res = fakeRes();
    await feed(fakeReq({ ip: `10.1.0.${++ipSeq}`, url: '/api/feed' }), res);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['cache-control'], /s-maxage=60/);
  });

  test('?auth=1 sin cabecera nunca se guarda (no se puede envenenar la caché)', async () => {
    const res = fakeRes();
    await feed(fakeReq({ ip: `10.1.0.${++ipSeq}`, url: '/api/feed?auth=1', query: { auth: '1' } }), res);
    assert.match(res.headers['cache-control'], /no-store/);
  });

  test('con sesión nunca se guarda', async () => {
    const res = fakeRes();
    await feed(fakeReq({ ip: `10.1.0.${++ipSeq}`, auth: 'Bearer good', query: { auth: '1' } }), res);
    assert.match(res.headers['cache-control'], /no-store/);
  });

  test('un 429 no se cachea', async () => {
    const ip = `10.1.0.${++ipSeq}`;
    let res;
    for (let i = 0; i < 61; i++) {
      res = fakeRes();
      await feed(fakeReq({ ip, url: '/api/feed' }), res);
    }
    assert.equal(res.statusCode, 429);
    assert.match(res.headers['cache-control'], /no-store/);
  });
});

describe('revisión estática de la API', () => {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) files.push(p);
    }
  })(path.join(ROOT, 'api'));

  test('las rutas públicas no devuelven mensajes internos de error', () => {
    for (const f of files) {
      if (f.includes(`${path.sep}admin${path.sep}`)) continue;
      const src = readFileSync(f, 'utf8');
      assert.doesNotMatch(src, /json\(\{\s*error:\s*(err|e|error)\.message/, path.relative(ROOT, f));
      assert.doesNotMatch(src, /send\(`[^`]*\$\{(err|e)\.message/, path.relative(ROOT, f));
    }
  });

  test('feed, historial y tarjetas limitan antes de validar el token', () => {
    for (const name of ['feed.js', 'feed-history.js', 'cards.js']) {
      const src = readFileSync(path.join(ROOT, 'api', name), 'utf8');
      const rl = src.indexOf('rateLimitRoute(req');
      const auth = src.indexOf('getUserFromToken(req)');
      assert.ok(rl > 0 && rl < auth, name);
    }
  });

  test('todas las llamadas externas tienen timeout', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const fetches = [...src.matchAll(/await fetch\(/g)].length;
      if (!fetches || !/https:\/\/(query1|api\.frankfurter|api\.coingecko)/.test(src)) continue;
      const timeouts = [...src.matchAll(/AbortSignal\.timeout\(/g)].length;
      assert.ok(timeouts >= fetches, `${path.relative(ROOT, f)}: ${fetches} fetch, ${timeouts} timeouts`);
    }
  });
});
