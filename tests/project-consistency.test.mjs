import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

function listJs(dir) {
  const out = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) {
      if (name !== 'vendor') out.push(...listJs(rel));
    } else if (/\.(m?js)$/.test(name)) out.push(rel);
  }
  return out;
}

describe('sintaxis', () => {
  const files = ['api', 'lib', 'public', 'scripts', 'local-demo'].flatMap(listJs);
  for (const f of files) {
    test(`node --check ${f}`, () => {
      execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
    });
  }
});

describe('vercel.json', () => {
  const vercel = JSON.parse(read('vercel.json'));

  test('los destinos estáticos de las rewrites existen', () => {
    for (const r of vercel.rewrites) {
      const dest = r.destination.split('?')[0];
      if (dest.startsWith('/api/')) {
        assert.ok(existsSync(path.join(ROOT, `${dest}.js`)), `${r.source} → ${dest}`);
      } else {
        assert.ok(existsSync(path.join(ROOT, 'public', dest)), `${r.source} → ${dest}`);
      }
    }
  });

  test('los crons apuntan a rutas reescritas', () => {
    const sources = new Set(vercel.rewrites.map((r) => r.source));
    for (const c of vercel.crons) assert.ok(sources.has(c.path), c.path);
  });

  test('máximo 12 funciones serverless (plan Hobby)', { todo: 'hay 14; api/crons.js indica que el límite Hobby es 12' }, () => {
    const fns = listJs('api').filter((f) => !f.includes(`${path.sep}_lib${path.sep}`));
    assert.ok(fns.length <= 12, `hay ${fns.length}: ${fns.join(', ')}`);
  });
});

describe('PWA', () => {
  test('los CORE_ASSETS del service worker existen', () => {
    const sw = read('public/sw.js');
    const assets = JSON.parse(sw.match(/CORE_ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
    for (const a of assets) {
      const p = a === '/' ? 'index.html' : a.slice(1);
      assert.ok(existsSync(path.join(ROOT, 'public', p)), a);
    }
  });

  test('los iconos del manifest existen', () => {
    const manifest = JSON.parse(read('public/manifest.json'));
    assert.ok(manifest.icons?.length);
    for (const i of manifest.icons) assert.ok(existsSync(path.join(ROOT, 'public', i.src)), i.src);
  });
});

describe('coherencia de categorías', () => {
  const allowed = [...read('lib/cron/generate.js').match(/ALLOWED_CATEGORIES = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const topics = [...read('public/app.js').match(/const TOPICS = \[([\s\S]*?)\];/)[1].matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
  const colors = [...read('public/app.js').match(/const CATEGORY_COLORS = \{([\s\S]*?)\};/)[1].matchAll(/'([^']+)':/g)].map((m) => m[1]);

  test('CATEGORY_COLORS cubre todas las categorías generables', () => {
    for (const c of allowed) assert.ok(colors.includes(c), c);
  });

  test('cada categoría generable tiene su Ámbito', { todo: 'faltan Política monetaria, Materias primas y Macro Europa' }, () => {
    for (const c of allowed) assert.ok(topics.includes(c), c);
  });

  test('cada Ámbito puede recibir noticias', { todo: 'Inmobiliario y Laboral nunca se generan' }, () => {
    for (const t of topics) assert.ok(allowed.includes(t), t);
  });
});

describe('configuración', () => {
  test('.env.example declara las variables que exige /api/health', () => {
    const example = read('.env.example');
    for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY', 'CRON_SECRET']) {
      assert.match(example, new RegExp(`^${k}=`, 'm'), k);
    }
  });

  test(
    '/api/health y los crons piden la misma longitud mínima de CRON_SECRET',
    { todo: 'health acepta ≥10 caracteres, isValidCronRequest exige ≥32' },
    () => {
      const health = read('api/health.js').match(/val\.length < (\d+)/)[1];
      const cron = read('api/_lib/clients.js').match(/secret\.length < (\d+)/)[1];
      assert.equal(health, cron);
    },
  );

  test('.env.local está ignorado por git', () => {
    assert.match(read('.gitignore'), /^\.env\.local$/m);
  });
});
