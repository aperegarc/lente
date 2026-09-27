// Web de presentación (/presentacion): el vídeo del inicio avanza con el scroll, cambia de escena,
// no hay bloqueos de CSP ni scroll horizontal, en escritorio y en móvil.
// Requisitos: chromium y el servidor demo (node local-demo/server.mjs).
// Uso: node tests/e2e/presentacion.e2e.mjs [--shots]

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL_ = (process.env.APP_URL || 'http://127.0.0.1:3000/').replace(/\/$/, '') + '/presentacion';
const SHOTS = process.argv.includes('--shots');
const SHOTS_DIR = path.join(HERE, 'capturas');

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900, scale: 1, mobile: false },
  { name: 'movil', width: 390, height: 844, scale: 2, mobile: true },
];

async function shot(cdp, file) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  await writeFile(file, Buffer.from(data, 'base64'));
}

async function runViewport(cdp, vp) {
  const problems = [];
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.scale, mobile: vp.mobile });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>__csp.push(e.violatedDirective+' '+e.blockedURI));",
  });
  await cdp.send('Page.navigate', { url: URL_ });
  await cdp.waitFor("document.getElementById('screen')?.classList.contains('ready')", 30000);
  await sleep(400);
  if (SHOTS) await shot(cdp, path.join(SHOTS_DIR, `presentacion-${vp.name}-0-inicio.jpg`));

  const fonts = await cdp.eval(
    "document.fonts.ready.then(() => [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/\"/g, '')))])",
  );
  for (const fam of ['Newsreader', 'Manrope']) {
    if (!fonts.includes(fam)) problems.push(`no se cargó la fuente ${fam} (servida desde /fonts)`);
  }

  const n = await cdp.eval("document.querySelectorAll('.scene').length");
  const scenes = await cdp.eval("fetch('/media/lente-recorrido.json').then(r=>r.json())");
  let lastTime = -1;
  for (let i = 0; i < n; i++) {
    await cdp.eval(`(() => {
      const s = document.getElementById('inicio');
      const total = s.offsetHeight - innerHeight;
      document.documentElement.style.scrollBehavior = 'auto';
      scrollTo(0, s.offsetTop + total * ((${i} + 0.5) / ${n}));
      return true;
    })()`);
    await sleep(1400);
    const st = await cdp.eval(`(() => ({
      scene: document.querySelector('.scene.on')?.dataset.scene,
      t: document.getElementById('tour').currentTime,
    }))()`);
    const want = await cdp.eval(`document.querySelectorAll('.scene')[${i}].dataset.scene`);
    if (st.scene !== want) problems.push(`escena ${i + 1}: se ve «${st.scene}» y debería verse «${want}»`);
    const sc = scenes.scenes.find((s) => s.id === want);
    const next = scenes.scenes[scenes.scenes.indexOf(sc) + 1]?.t ?? scenes.duration;
    if (!(st.t >= sc.t - 0.1 && st.t <= next + 0.1)) problems.push(`escena ${want}: el vídeo está en ${st.t.toFixed(2)}s (esperado entre ${sc.t} y ${next})`);
    if (st.t <= lastTime) problems.push(`escena ${want}: el vídeo no avanza (${st.t.toFixed(2)}s ≤ ${lastTime.toFixed(2)}s)`);
    lastTime = st.t;
    if (SHOTS && (i === 2 || i === 5)) await shot(cdp, path.join(SHOTS_DIR, `presentacion-${vp.name}-${i}-${want}.jpg`));
  }

  const layout = await cdp.eval(`(() => ({
    hOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    csp: window.__csp,
    brokenImgs: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
  }))()`);
  if (layout.hOverflow) problems.push('la página tiene scroll horizontal');
  if (layout.csp.length) problems.push(`CSP bloquea: ${layout.csp.join(', ')}`);
  if (layout.brokenImgs.length) problems.push(`imágenes rotas: ${layout.brokenImgs.join(', ')}`);

  if (SHOTS) {
    for (const id of ['antes-despues', 'por-que', 'noticia', 'precios', 'preguntas']) {
      await cdp.eval(`(() => { document.getElementById('${id}').scrollIntoView(); document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')); return true; })()`);
      await sleep(900);
      await shot(cdp, path.join(SHOTS_DIR, `presentacion-${vp.name}-${id}.jpg`));
    }
  }
  return problems;
}

async function main() {
  if (SHOTS) await mkdir(SHOTS_DIR, { recursive: true });
  const profileDir = await mkdtemp(path.join(tmpdir(), 'lente-e2e-'));
  const { cdp, kill } = await launchChromium({ port: 9336, profileDir, width: 1440, height: 900 });
  let failed = 0;
  try {
    for (const vp of VIEWPORTS) {
      const problems = await runViewport(cdp, vp);
      if (problems.length) failed++;
      console.log(`${problems.length ? '✖' : '✔'} presentación en ${vp.name} (${vp.width}×${vp.height})`);
      for (const p of problems) console.log(`    - ${p}`);
    }
  } finally {
    cdp.close();
    kill();
    await sleep(500);
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
  console.log(`\n${VIEWPORTS.length - failed}/${VIEWPORTS.length} comprobaciones sin problemas`);
  process.exitCode = failed ? 1 : 0;
}

await main();
