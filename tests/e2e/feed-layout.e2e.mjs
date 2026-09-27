// Comprueba en varios dispositivos que cada tarjeta del feed ocupa exactamente su pantalla
// (estilo TikTok) sin cortarse, y que solo crece al pulsar «Leer más».
// Requisitos: chromium y el servidor demo (node local-demo/server.mjs).
// Uso: node tests/e2e/feed-layout.e2e.mjs [--shots]

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000/';
const SHOTS = process.argv.includes('--shots');
const SHOTS_DIR = path.join(HERE, 'capturas');

export const DEVICES = [
  { name: 'iPhone SE (1ª gen)', width: 320, height: 568, scale: 2, mobile: true },
  { name: 'Android pequeño', width: 360, height: 640, scale: 2, mobile: true },
  { name: 'iPhone SE 2/3', width: 375, height: 667, scale: 2, mobile: true },
  { name: 'Galaxy S', width: 360, height: 780, scale: 3, mobile: true },
  { name: 'iPhone 14/15', width: 390, height: 844, scale: 3, mobile: true },
  { name: 'Pixel 7', width: 412, height: 915, scale: 2.6, mobile: true },
  { name: 'iPhone Pro Max', width: 430, height: 932, scale: 3, mobile: true },
  { name: 'Móvil horizontal', width: 844, height: 390, scale: 3, mobile: true },
  { name: 'iPad vertical', width: 768, height: 1024, scale: 2, mobile: true },
  { name: 'iPad horizontal', width: 1024, height: 768, scale: 2, mobile: true },
  { name: 'Portátil 1366×768', width: 1366, height: 768, scale: 1, mobile: false },
  { name: 'Escritorio 1920×1080', width: 1920, height: 1080, scale: 1, mobile: false },
  { name: 'Portátil bajo 1280×620', width: 1280, height: 620, scale: 1, mobile: false },
];

const words = (n, seed) => {
  const base = 'la inflación de la eurozona baja más rápido de lo previsto y el banco central prepara un recorte de tipos que abarataría las hipotecas variables mientras los depósitos remunerados pagarán menos durante los próximos meses según los analistas consultados'.split(' ');
  return Array.from({ length: n }, (_, i) => base[(i + seed) % base.length]).join(' ');
};

/** Tarjeta con la longitud máxima permitida por el prompt de generate.js. */
const WORST_CARD = {
  id: '0d3a0c4d-0000-4000-8000-00000000ffff',
  category: 'Política monetaria',
  headline: words(12, 0),
  deck: `${words(28, 3)}.`,
  body: `${words(80, 5)}.`,
  meaning: `${words(60, 7)}.`,
  sources_text: 'Banco Central Europeo · Expansión · Financial Times · Cinco Días',
  primary_source_url: 'https://example.com/noticia',
  legal_tag: 'Contenido elaborado con asistencia de IA',
  is_ai_generated: true,
  read_time_seconds: 60,
};

const MEASURE = `(() => {
  const fs = document.getElementById('feed-scroll');
  const nav = document.querySelector('.bottom-nav');
  const fr = fs.getBoundingClientRect();
  const nr = nav.getBoundingClientRect();
  const slides = [...fs.querySelectorAll('.feed-slide')].filter((s) => s.querySelector('.card'));
  return {
    feedH: fs.clientHeight,
    feedBottom: Math.round(fr.bottom),
    navTop: Math.round(nr.top),
    docOverflow: document.documentElement.scrollHeight > innerHeight + 1,
    slides: slides.map((s, i) => {
      const c = s.querySelector('.card');
      const cs = getComputedStyle(s);
      const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const footer = c.querySelector('.card-footer');
      const cr = c.getBoundingClientRect();
      const footerOut = footer ? footer.getBoundingClientRect().bottom > cr.bottom + 1 : false;
      const halfLines = [...c.querySelectorAll('.is-clamped')].filter((el) => {
        if (!el.offsetParent) return false;
        const st = getComputedStyle(el);
        const lh = parseFloat(st.lineHeight) || parseFloat(st.fontSize) * 1.2;
        const lines = el.clientHeight / lh;
        return Math.abs(lines - Math.round(lines)) > 0.15 || el.clientHeight < lh - 1;
      }).map((el) => el.className.split(' ')[0]);
      return {
        i,
        kind: c.classList.contains('card-intro') ? 'intro' : c.classList.contains('card-upsell') ? 'upsell' : 'noticia',
        id: c.dataset.id || null,
        slideH: s.offsetHeight,
        cardH: c.offsetHeight,
        cardScrollH: c.scrollHeight,
        padV,
        footerOut,
        halfLines,
      };
    }),
  };
})()`;

function evaluate(m, { expanded = false } = {}) {
  const problems = [];
  if (m.feedBottom > m.navTop + 1) problems.push(`el feed queda ${m.feedBottom - m.navTop}px bajo la barra inferior`);
  if (m.docOverflow) problems.push('la página entera hace scroll');
  for (const s of m.slides) {
    const label = `${s.kind}#${s.i}`;
    if (expanded && s.id === WORST_CARD.id) {
      if (s.slideH < m.feedH - 1) problems.push(`${label} expandida más corta que la pantalla`);
      if (s.cardScrollH > s.cardH + 1) problems.push(`${label} expandida cortada (${s.cardScrollH - s.cardH}px ocultos)`);
      continue;
    }
    if (Math.abs(s.slideH - m.feedH) > 1) problems.push(`${label} mide ${s.slideH}px y la pantalla ${m.feedH}px`);
    if (s.cardScrollH > s.cardH + 3) problems.push(`${label} cortada (${s.cardScrollH - s.cardH}px ocultos)`);
    if (s.footerOut) problems.push(`${label} con acciones fuera de la tarjeta`);
    if (s.halfLines.length) problems.push(`${label} con líneas partidas en ${s.halfLines.join(', ')}`);
    if (s.cardH < s.slideH - s.padV - 2) problems.push(`${label} no llena su hueco (${s.cardH}/${Math.round(s.slideH - s.padV)}px)`);
  }
  return problems;
}

async function screenshot(cdp, file) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(file, Buffer.from(data, 'base64'));
}

async function runDevice(cdp, d) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: d.width, height: d.height, deviceScaleFactor: d.scale, mobile: d.mobile,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: d.mobile });
  await cdp.send('Page.navigate', { url: APP_URL });
  await cdp.waitFor("document.querySelector('.card-intro')");
  await cdp.eval('document.fonts.ready.then(() => true)');
  await cdp.eval(`(() => {
    state.feed.cards = [${JSON.stringify(WORST_CARD)}, ...state.feed.cards];
    renderFeed();
    return true;
  })()`);
  await sleep(700);

  const collapsed = await cdp.eval(MEASURE);
  const problems = evaluate(collapsed);

  const slug = d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  if (SHOTS) {
    await cdp.eval(`document.querySelector('[data-id="${WORST_CARD.id}"]').closest('.feed-slide').scrollIntoView({ block: 'start' })`);
    await sleep(400);
    await screenshot(cdp, path.join(SHOTS_DIR, `${slug}-1-tarjeta-larga.png`));
  }

  await cdp.eval(`(() => {
    const card = document.querySelector('[data-id="${WORST_CARD.id}"]');
    card.closest('.feed-slide').scrollIntoView({ block: 'start' });
    card.querySelector('.read-more-btn').click();
    return true;
  })()`);
  await sleep(500);
  const expanded = await cdp.eval(MEASURE);
  const expandedProblems = evaluate(expanded, { expanded: true }).map((p) => `[leer más] ${p}`);
  if (SHOTS) await screenshot(cdp, path.join(SHOTS_DIR, `${slug}-2-leer-mas.png`));

  await cdp.eval(`document.querySelector('[data-id="${WORST_CARD.id}"] .read-more-btn').click()`);
  await sleep(400);
  const recollapsed = await cdp.eval(MEASURE);
  const recollapsedProblems = evaluate(recollapsed).map((p) => `[leer menos] ${p}`);

  return { collapsed, problems: [...problems, ...expandedProblems, ...recollapsedProblems] };
}

const VISIBLE_SLIDE = `(() => {
  const fs = document.getElementById('feed-scroll');
  const top = fs.getBoundingClientRect().top;
  const slides = [...fs.querySelectorAll('.feed-slide')];
  const i = slides.findIndex((s) => Math.abs(s.getBoundingClientRect().top - top) < 2);
  return { i, id: slides[i]?.querySelector('.card')?.dataset.id || null };
})()`;

async function rotationKeepsCard(cdp) {
  const portrait = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };
  await cdp.send('Emulation.setDeviceMetricsOverride', portrait);
  await cdp.send('Page.navigate', { url: APP_URL });
  await cdp.waitFor("document.querySelector('.card-intro')");
  await cdp.eval('document.fonts.ready.then(() => true)');
  const settled = async (want) => {
    let v;
    for (let t = 0; t < 30; t++) {
      await sleep(150);
      v = await cdp.eval(VISIBLE_SLIDE);
      if (v.i >= 0 && (want == null || v.i === want)) break;
    }
    return v;
  };
  await sleep(1500);
  const opening = await settled();
  await sleep(800);
  let before;
  for (let t = 0; t < 3 && before?.i !== 4; t++) {
    await cdp.eval("document.querySelectorAll('#feed-scroll .feed-slide')[4].scrollIntoView({ block: 'start', behavior: 'instant' })");
    before = await settled(4);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...portrait, width: 844, height: 390 });
  const rotated = await settled();
  await cdp.send('Emulation.setDeviceMetricsOverride', portrait);
  const back = await settled();
  const ok = before.i === 4 && rotated.id === before.id && back.id === before.id;
  return {
    opensAtStart: opening.i === 0,
    openingDetail: `se ve la diapositiva ${opening.i + 1}`,
    ok,
    detail: `tarjeta ${before.i + 1} → horizontal ${rotated.i + 1} → vertical ${back.i + 1}`,
  };
}

async function main() {
  if (SHOTS) {
    await rm(SHOTS_DIR, { recursive: true, force: true });
    await mkdir(SHOTS_DIR, { recursive: true });
  }
  const profileDir = await mkdtemp(path.join(tmpdir(), 'lente-e2e-'));
  const { cdp, kill } = await launchChromium({ port: 9334, profileDir });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{localStorage.setItem('lente.cookies-ack','1');localStorage.setItem('lente.dismiss-install',String(Date.now()));}catch(e){}",
  });
  let failed = 0;
  let checks = DEVICES.length;
  try {
    for (const d of process.argv.includes('--solo-giro') ? [] : DEVICES) {
      const { collapsed, problems } = await runDevice(cdp, d);
      const status = problems.length ? '✖' : '✔';
      if (problems.length) failed++;
      console.log(`${status} ${d.name} (${d.width}×${d.height}) · pantalla de tarjeta ${collapsed.feedH}px`);
      for (const p of problems) console.log(`    - ${p}`);
    }
    checks++;
    const kept = await rotationKeepsCard(cdp);
    checks++;
    if (!kept.opensAtStart) failed++;
    console.log(`${kept.opensAtStart ? '✔' : '✖'} al abrir la app se ve el resumen del día (${kept.openingDetail})`);
    if (!kept.ok) failed++;
    console.log(`${kept.ok ? '✔' : '✖'} girar el móvil mantiene la tarjeta a la vista (${kept.detail})`);
  } finally {
    cdp.close();
    kill();
    await sleep(500);
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
  console.log(`\n${checks - failed}/${checks} comprobaciones sin problemas`);
  process.exitCode = failed ? 1 : 0;
}

await main();
