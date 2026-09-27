import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3000 + Math.floor(Math.random() * 1000) + 1000;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'local-demo/server.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/health`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('El servidor demo no arrancó');
});

after(() => server?.kill());

describe('servidor demo local', () => {
  for (const [url, type] of [
    ['/', 'text/html'],
    ['/admin', 'text/html'],
    ['/chart/%5EIBEX', 'text/html'],
    ['/privacidad', 'text/html'],
    ['/transparencia-ia', 'text/html'],
    ['/config.js', 'application/javascript'],
    ['/manifest.json', 'application/json'],
    ['/vendor/echarts.min.js', 'application/javascript'],
  ]) {
    test(`GET ${url}`, async () => {
      const r = await fetch(BASE + url);
      assert.equal(r.status, 200);
      assert.ok(r.headers.get('content-type').startsWith(type));
    });
  }

  test('no permite salir de /public', async () => {
    const r = await fetch(`${BASE}/..%2Fpackage.json`);
    assert.notEqual(r.status, 200);
  });

  test('/api/feed respeta el límite gratuito', async () => {
    const d = await (await fetch(`${BASE}/api/feed`)).json();
    assert.equal(d.plan_tier, 'free');
    assert.equal(d.cards.length, d.free_limit);
    assert.equal(d.locked_count, d.total_in_edition - d.free_limit);
    for (const c of d.cards) {
      for (const k of ['id', 'category', 'headline', 'deck', 'body', 'meaning']) assert.ok(c[k], k);
    }
  });

  test('/api/markets agrupa por categoría', async () => {
    const d = await (await fetch(`${BASE}/api/markets?view=universe`)).json();
    assert.ok(d.flat.length > 40);
    assert.deepEqual(Object.keys(d.grouped).sort(), ['acciones', 'cripto', 'divisas', 'indices', 'materias']);
  });

  test('/api/candles devuelve OHLC coherente', async () => {
    const to = Math.floor(Date.now() / 1000);
    const d = await (await fetch(`${BASE}/api/candles?symbol=BTC-USD&resolution=D&from=${to - 86400 * 30}&to=${to}`)).json();
    assert.equal(d.status, 'ok');
    assert.ok(d.candles.length >= 20);
    for (const c of d.candles) {
      assert.ok(c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close));
    }
  });

  test('/api/candles valida parámetros', async () => {
    assert.equal((await fetch(`${BASE}/api/candles`)).status, 400);
    assert.equal((await fetch(`${BASE}/api/candles?symbol=X&from=10&to=5`)).status, 400);
  });

  describe('/api/session (cookie de sesión persistente)', () => {
    const TOKEN = 'rt_AbC123-xyz.789';
    const post = (body, headers = {}) => fetch(`${BASE}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE, ...headers },
      body: JSON.stringify(body),
    });

    test('POST guarda el token en una cookie HttpOnly de larga duración', async () => {
      const r = await post({ refresh_token: TOKEN });
      assert.equal(r.status, 200);
      const cookie = r.headers.get('set-cookie');
      assert.match(cookie, /^lente_session=rt_AbC123-xyz\.789;/);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Path=\/api\/session/);
      const maxAge = Number(cookie.match(/Max-Age=(\d+)/)[1]);
      assert.ok(maxAge >= 365 * 24 * 3600, `Max-Age ${maxAge}`);
      assert.equal(r.headers.get('cache-control'), 'no-store');
    });

    test('GET devuelve el token guardado', async () => {
      const r = await fetch(`${BASE}/api/session`, { headers: { Cookie: `lente_session=${TOKEN}` } });
      assert.deepEqual(await r.json(), { refresh_token: TOKEN });
    });

    test('GET sin cookie devuelve null', async () => {
      const r = await fetch(`${BASE}/api/session`);
      assert.deepEqual(await r.json(), { refresh_token: null });
    });

    test('rechaza peticiones desde otro origen', async () => {
      assert.equal((await post({ refresh_token: TOKEN }, { Origin: 'https://evil.example' })).status, 403);
      const r = await fetch(`${BASE}/api/session`, {
        headers: { Cookie: `lente_session=${TOKEN}`, 'Sec-Fetch-Site': 'cross-site' },
      });
      assert.equal(r.status, 403);
    });

    test('valida el token', async () => {
      assert.equal((await post({ refresh_token: 'x' })).status, 400);
      assert.equal((await post({ refresh_token: 'a b; Path=/' })).status, 400);
      assert.equal((await post({})).status, 400);
    });

    test('DELETE borra la cookie', async () => {
      const r = await fetch(`${BASE}/api/session`, { method: 'DELETE', headers: { Origin: BASE } });
      assert.equal(r.status, 200);
      assert.match(r.headers.get('set-cookie'), /^lente_session=; .*Max-Age=0/);
    });
  });

  test('las rutas que necesitan servicios reales responden 501', async () => {
    assert.equal((await fetch(`${BASE}/api/admin/me`)).status, 501);
    assert.equal((await fetch(`${BASE}/api/cron/ingest`)).status, 501);
  });
});
