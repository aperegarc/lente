// Graba un recorrido por la app (Chromium headless + DevTools Protocol) y monta el vídeo promocional con ffmpeg.
// Requisitos: chromium, ffmpeg y el servidor demo en marcha (node local-demo/server.mjs).
// Uso: node promo/grabar-video.mjs          → promo/lente-promo.mp4 y public/media/lente-recorrido.mp4
//      node promo/grabar-video.mjs --web    → solo el de la web de presentación
//      node promo/grabar-video.mjs --montar → vuelve a montar la última grabación sin grabar

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, sleep } from '../tests/e2e/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, '.build');
const FRAMES = path.join(WORK, 'frames');
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000/';
const DEBUG_PORT = 9333;
const VIEW = { width: 390, height: 844, scale: 2 };
// Zonas seguras de un iPhone 14/15: la app se dibuja debajo de la isla, como en un móvil real.
const SAFE = { top: 47, bottom: 34 };
const WEB = process.argv.includes('--web');
// Chromium headless solo repinta ~4 veces por segundo mientras transmite la captura. Se graba a cámara
// lenta (el tiempo de la página corre TIME_SCALE veces más despacio) y luego se acelera: ~64 fotogramas/s
// de contenido real en cada deslizamiento.
const TIME_SCALE = 8;
const PROMO_FPS = 60;
const SLOW_TIME = `(() => {
  const N = ${TIME_SCALE};
  const rp = performance.now.bind(performance);
  const base = rp();
  const dn = Date.now;
  const dbase = dn();
  performance.now = () => base + (rp() - base) / N;
  Date.now = () => dbase + (dn() - dbase) / N;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf(() => cb(performance.now()));
  const st = window.setTimeout.bind(window);
  const si = window.setInterval.bind(window);
  window.setTimeout = (fn, ms = 0, ...a) => st(fn, ms * N, ...a);
  window.setInterval = (fn, ms = 0, ...a) => si(fn, ms * N, ...a);
})();`;
const MEDIA = path.join(HERE, '..', 'public', 'media');

// Barra de estado y barra de inicio de iPhone, y gestos con la curva de desplazamiento de iOS.
const PHONE_CHROME = `(() => {
  const ink = '#0f2d2e';
  const css = \`
    #__sb{position:fixed;top:0;left:0;right:0;height:${SAFE.top}px;display:flex;align-items:center;justify-content:space-between;
      padding:4px 30px 0 40px;box-sizing:border-box;z-index:2147483646;pointer-events:none;color:\${ink};
      font:700 16px/1 Manrope,system-ui,sans-serif;letter-spacing:-.01em}
    #__sb .ic{display:flex;gap:6px;align-items:center}
    #__hi{position:fixed;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:\${ink};
      opacity:.9;z-index:2147483646;pointer-events:none}\`;
  const add = () => {
    if (document.getElementById('__sb')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const sb = document.createElement('div'); sb.id = '__sb';
    sb.innerHTML = '<span>9:41</span><span class="ic">'
      + '<svg width="18" height="12" viewBox="0 0 18 12" fill="' + ink + '"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>'
      + '<svg width="16" height="12" viewBox="0 0 16 12" fill="' + ink + '"><path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.2A10.6 10.6 0 0 0 8 .5 10.6 10.6 0 0 0 .5 3.5l1.2 1.2A8.9 8.9 0 0 1 8 2.2Zm0 3.4c1.5 0 2.9.6 4 1.6l1.2-1.2A7.3 7.3 0 0 0 8 3.9c-2 0-3.8.8-5.2 2.1L4 7.2a5.6 5.6 0 0 1 4-1.6Zm0 3.4c-.7 0-1.4.3-1.9.8L8 11.7l1.9-1.9A2.7 2.7 0 0 0 8 9Z"/></svg>'
      + '<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="' + ink + '" opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2" fill="' + ink + '"/><path d="M25 4.5v4a2 2 0 0 0 0-4Z" fill="' + ink + '" opacity=".45"/></svg>'
      + '</span>';
    const hi = document.createElement('div'); hi.id = '__hi';
    document.body.append(sb, hi);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // cubic-bezier(.3, 0, .1, 1): arranca con suavidad y frena largo, como un deslizamiento en iOS.
  const bezier = (x1, y1, x2, y2) => {
    const c = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
    return (x) => {
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (c(x1, x2, m) < x) lo = m; else hi = m; }
      return c(y1, y2, (lo + hi) / 2);
    };
  };
  const ease = bezier(.3, 0, .1, 1);
  window.__tap = async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    await wait(50);
    return true;
  };
  // 'top' puede ser { slide, offset }: se recalcula en cada fotograma porque la app recoloca las
  // tarjetas (p. ej. recoge la noticia desplegada) mientras se desliza.
  window.__swipe = async (sel, top, ms) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const target = typeof top === 'number' ? () => top : () => {
      const s = el.querySelectorAll('.feed-slide')[top.slide];
      return el.scrollTop + s.getBoundingClientRect().top - el.getBoundingClientRect().top + (top.offset || 0);
    };
    const from = el.scrollTop;
    if (Math.abs(target() - from) < 2) return true;
    // El feed tiene scroll-behavior: smooth; con él cada paso lanzaría una animación nativa en tiempo real.
    const snap = el.style.scrollSnapType;
    const behavior = el.style.scrollBehavior;
    el.style.scrollSnapType = 'none';
    el.style.scrollBehavior = 'auto';
    await new Promise((done) => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        el.scrollTop = from + (target() - from) * ease(p);
        if (p < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    await wait(60);
    el.style.scrollSnapType = snap;
    el.style.scrollBehavior = behavior;
    return true;
  };
})();`;

async function record() {
  await rm(WORK, { recursive: true, force: true });
  await mkdir(FRAMES, { recursive: true });

  const { cdp, kill } = await launchChromium({
    port: DEBUG_PORT, profileDir: path.join(WORK, 'profile'), width: VIEW.width, height: VIEW.height, scale: VIEW.scale,
  });

  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.scale, mobile: true,
    });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: SAFE });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "try{localStorage.setItem('lente.cookies-ack','1');localStorage.setItem('lente.dismiss-install',String(Date.now()));}catch(e){}",
    });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PHONE_CHROME });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SLOW_TIME });
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / TIME_SCALE });

    await cdp.send('Page.navigate', { url: APP_URL });
    await cdp.waitFor("document.querySelector('.card-intro')", 60000);
    await cdp.eval('document.fonts.ready.then(() => true)');
    await cdp.waitFor("document.querySelectorAll('#markets-list .market-item').length > 0 || true");
    const headerTop = await cdp.eval("parseFloat(getComputedStyle(document.querySelector('.app-header')).paddingTop)");
    if (headerTop < SAFE.top) throw new Error(`La app no respeta la zona segura (padding-top ${headerTop}px)`);
    await sleep(1200);

    const frames = [];
    const marks = [];
    let t0 = null;
    cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      if (t0 == null) t0 = metadata.timestamp;
      const file = path.join(FRAMES, `f${String(frames.length).padStart(5, '0')}.jpg`);
      frames.push({ file, t: (metadata.timestamp - t0) / TIME_SCALE });
      await writeFile(file, Buffer.from(data, 'base64'));
    });
    const mark = (id) => marks.push({ id, frame: frames.length });

    await cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 90, maxWidth: VIEW.width * VIEW.scale, maxHeight: VIEW.height * VIEW.scale, everyNthFrame: 1,
    });
    const hold = (ms) => sleep(ms * TIME_SCALE);
    const tap = (sel) => cdp.eval(`window.__tap(${JSON.stringify(sel)})`);
    const swipe = (sel, top, ms = 1100) => cdp.eval(`window.__swipe(${JSON.stringify(sel)}, ${JSON.stringify(top)}, ${ms})`);
    const toSlide = (i, ms, offset = 0) => swipe('#feed-scroll', { slide: i, offset }, ms);
    const settled = (i) => cdp.waitFor(`(() => {
      const feed = document.getElementById('feed-scroll');
      const s = feed.querySelectorAll('.feed-slide')[${i}];
      if (!s) return false;
      return Math.abs(s.getBoundingClientRect().top - feed.getBoundingClientRect().top) < 4;
    })()`, 20000);

    // Recorrido limpio: sin cursor, solo la app. Cada deslizamiento termina en una pantalla completa.
    mark('intro');
    await hold(3200);

    mark('card');
    await toSlide(2, 1400);
    await settled(2);
    await hold(2800);
    await tap('.feed-slide:nth-child(3) .read-more-btn');
    await hold(2200);
    mark('meaning');
    await toSlide(2, 1600, 220);
    await hold(3600);

    mark('more');
    await toSlide(3, 1300);
    await settled(3);
    await hold(2400);

    mark('markets');
    await tap('.nav-item[data-screen="markets"]');
    await cdp.waitFor("document.querySelectorAll('#markets-list .market-item').length > 10", 60000);
    await hold(2200);
    await swipe('#screen-markets', 640, 2200);
    await hold(1600);
    await swipe('#screen-markets', 0, 1800);
    await hold(1000);

    mark('favs');
    await tap('#markets-list .market-item[data-chart="BTC-USD"] .market-fav-btn');
    await hold(1100);
    await tap('#markets-list .market-section:not(.market-section--favs) .market-item .market-fav-btn:not(.on)');
    await hold(1200);
    await tap('.market-tab--favs');
    await cdp.eval("document.querySelector('#screen-markets').scrollTo({ top: 0, behavior: 'auto' })");
    await hold(2600);

    mark('chart');
    await tap('#markets-list .market-item[data-chart="BTC-USD"]');
    await cdp.waitFor("document.querySelector('.chart-echarts-root canvas')", 60000);
    await hold(2600);
    await tap('.chart-tf-btn[data-tf="1M"]');
    await cdp.waitFor("document.querySelector('.chart-echarts-root canvas')", 60000);
    await hold(2800);

    await tap('#chart-page-back');
    await hold(800);
    mark('topics');
    await tap('.nav-item[data-screen="topics"]');
    await hold(2400);
    await tap('.ambito-card:nth-child(2)');
    await hold(2800);

    mark('login');
    await tap('#profile-btn');
    await hold(3000);

    mark('end');
    await sleep(500 * TIME_SCALE);
    await cdp.send('Page.stopScreencast');
    await sleep(400);
    cdp.close();

    const lastT = frames.at(-1)?.t ?? 0;
    return {
      frames,
      marks: marks.map((m) => ({
        id: m.id,
        t: m.frame < frames.length ? frames[m.frame].t : lastT + 0.5,
      })),
    };
  } finally {
    kill();
  }
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

// Secuencia a fps constante con el fotograma capturado que toca en cada instante. No se usa el demuxer
// concat de ffmpeg: redondea las imágenes a 1/25 s y convierte cualquier captura en un vídeo a 25 fps.
async function resample(frames, fps, end, name) {
  const dir = path.join(WORK, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const total = Math.ceil(end * fps);
  let k = 0;
  for (let n = 0; n < total; n++) {
    const t = n / fps;
    while (k + 1 < frames.length && frames[k + 1].t <= t) k++;
    await symlink(frames[k].file, path.join(dir, `${String(n).padStart(6, '0')}.jpg`));
  }
  return path.join(dir, '%06d.jpg');
}

async function buildScreenClip({ frames, marks }) {
  const end = marks.find((m) => m.id === 'end')?.t ?? frames.at(-1).t + 1;
  const seq = await resample(frames, PROMO_FPS, end, `seq${PROMO_FPS}`);
  const out = path.join(WORK, 'screen.mp4');
  ffmpeg(['-framerate', String(PROMO_FPS), '-i', seq, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out]);
  return { file: out, duration: end };
}

const FONT_BOLD = '/usr/share/fonts/noto/NotoSans-Bold.ttf';
const FONT_REG = '/usr/share/fonts/noto/NotoSans-Regular.ttf';
const FONT_SERIF_IT = '/usr/share/fonts/noto/NotoSerif-Italic.ttf';

const CAPTIONS = {
  intro: ['Las noticias económicas del día', 'en 5 minutos'],
  card: ['Cada noticia, en lenguaje llano', 'sin jerga financiera'],
  meaning: ['¿Qué significa para ti?', 'el impacto en tu bolsillo'],
  more: ['Una edición diaria', 'revisada por personas'],
  markets: ['Mercados de un vistazo', 'índices, divisas, cripto y acciones'],
  favs: ['Marca tus favoritos', 'siempre a primera vista'],
  chart: ['Gráficos claros', 'de 1 día a 1 año'],
  topics: ['Sigue solo lo que te interesa', 'por ámbitos'],
  login: ['Tu cuenta, tus guardados', 'Premium: todo el archivo'],
};

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019").replace(/%/g, '\\%').replace(/,/g, '\\,');
}

async function buildPromo(screen, marks) {
  const W = 1080, H = 1920;
  const phoneW = 640, phoneH = Math.round(phoneW * VIEW.height / VIEW.width) & ~1;
  const phoneX = Math.round((W - phoneW) / 2), phoneY = 380;
  const INTRO = 3.2, OUTRO = 4.2;

  const intro = path.join(WORK, 'intro.mp4');
  const outro = path.join(WORK, 'outro.mp4');
  const body = path.join(WORK, 'body.mp4');
  const bg = '0xF8F9FA';
  const ink = '0x0F2D2E';
  const accent = '0x2B6769';

  const title = (text, y, size, font, color = ink, extra = '') =>
    `drawtext=fontfile=${font}:text='${esc(text)}':fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}${extra}`;

  ffmpeg([
    '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:d=${INTRO}:r=${PROMO_FPS}`,
    '-vf', [
      `drawbox=x=${W / 2 - 16}:y=700:w=32:h=32:color=${accent}:t=fill`,
      title('lente', 760, 190, FONT_BOLD, ink, `:alpha='min(1,t/0.6)'`),
      title('Noticias económicas explicadas', 1010, 54, FONT_SERIF_IT, accent, `:alpha='min(1,max(0,(t-0.5)/0.6))'`),
      title('para inversores que no viven pegados al mercado', 1100, 38, FONT_REG, '0x414848', `:alpha='min(1,max(0,(t-0.9)/0.6))'`),
      'format=yuv420p',
    ].join(','),
    '-c:v', 'libx264', '-crf', '18', intro,
  ]);

  const captionFilters = [];
  const ordered = marks.filter((m) => CAPTIONS[m.id]);
  ordered.forEach((m, i) => {
    const start = m.t;
    const stop = i + 1 < ordered.length ? ordered[i + 1].t : screen.duration;
    const [a, b] = CAPTIONS[m.id];
    const fade = `if(lt(t,${start + 0.35}),(t-${start})/0.35,if(gt(t,${stop - 0.3}),(${stop}-t)/0.3,1))`;
    const en = `:enable='between(t,${start.toFixed(2)},${stop.toFixed(2)})':alpha='max(0,min(1,${fade}))'`;
    captionFilters.push(title(a, 150, 64, FONT_BOLD, ink, en));
    captionFilters.push(title(b, 250, 46, FONT_SERIF_IT, accent, en));
  });

  // Proporciones de un iPhone 14/15 (pantalla de 390 pt): esquinas de ~47 pt, isla de 125×37 pt a 11 pt del borde.
  const k = phoneW / VIEW.width;
  const radius = Math.round(47 * k);
  const bezel = 16;
  const islandW = Math.round(125 * k) & ~1, islandH = Math.round(37 * k) & ~1;
  const islandX = phoneX + (phoneW - islandW) / 2, islandY = phoneY + Math.round(11 * k);
  const rounded = (r) =>
    `if(gt(abs(W/2-X),W/2-${r})*gt(abs(H/2-Y),H/2-${r}),if(lte(hypot(${r}-(W/2-abs(W/2-X)),${r}-(H/2-abs(H/2-Y))),${r}),255,0),255)`;
  const maskPng = path.join(WORK, 'mask.png');
  const bezelPng = path.join(WORK, 'bezel.png');
  const islandPng = path.join(WORK, 'island.png');
  ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${islandW}x${islandH}:d=1`, '-frames:v', '1',
    '-vf', `format=rgba,geq=r=8:g=22:b=23:a='${rounded(islandH / 2)}'`, islandPng]);
  ffmpeg(['-f', 'lavfi', '-i', `color=c=white:s=${phoneW}x${phoneH}:d=1`, '-frames:v', '1',
    '-vf', `format=gray,geq=lum='${rounded(radius)}'`, maskPng]);
  ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${phoneW + bezel * 2}x${phoneH + bezel * 2}:d=1`, '-frames:v', '1',
    '-vf', `format=rgba,geq=r=15:g=45:b=46:a='${rounded(radius + bezel)}'`, bezelPng]);

  ffmpeg([
    '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:d=${screen.duration}:r=${PROMO_FPS}`,
    '-i', screen.file,
    '-loop', '1', '-i', maskPng,
    '-loop', '1', '-i', bezelPng,
    '-loop', '1', '-i', islandPng,
    '-filter_complex', [
      `[1:v]scale=${phoneW}:${phoneH},format=rgba[scr]`,
      `[2:v]format=gray[m]`,
      `[scr][m]alphamerge[phone]`,
      `[0:v]${captionFilters.join(',')}[bgc]`,
      `[bgc][3:v]overlay=${phoneX - bezel}:${phoneY - bezel}:shortest=1[bgb]`,
      `[bgb][phone]overlay=${phoneX}:${phoneY}:shortest=1[bgp]`,
      `[bgp][4:v]overlay=${islandX}:${islandY}:shortest=1,format=yuv420p[v]`,
    ].join(';'),
    '-map', '[v]', '-t', screen.duration.toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', String(PROMO_FPS), body,
  ]);

  ffmpeg([
    '-f', 'lavfi', '-i', `color=c=${ink}:s=${W}x${H}:d=${OUTRO}:r=${PROMO_FPS}`,
    '-vf', [
      title('lente', 640, 170, FONT_BOLD, '0xF8F9FA', `:alpha='min(1,t/0.5)'`),
      title('Entiende la economía', 880, 64, FONT_SERIF_IT, '0xB1EDEF', `:alpha='min(1,max(0,(t-0.4)/0.5))'`),
      title('sin perder el tiempo.', 965, 64, FONT_SERIF_IT, '0xB1EDEF', `:alpha='min(1,max(0,(t-0.4)/0.5))'`),
      title('5 noticias gratis cada día', 1160, 44, FONT_REG, '0xF8F9FA', `:alpha='min(1,max(0,(t-1)/0.5))'`),
      title('Premium · 5 € al mes o 20 € al año', 1230, 44, FONT_REG, '0xF8F9FA', `:alpha='min(1,max(0,(t-1.3)/0.5))'`),
      title('Instálala gratis en tu móvil', 1420, 50, FONT_BOLD, '0xF8F9FA', `:alpha='min(1,max(0,(t-1.8)/0.5))'`),
      title('Información, no asesoramiento financiero. Contenido elaborado con asistencia de IA.', 1800, 26, FONT_REG, '0x9FB3B3'),
      'format=yuv420p',
    ].join(','),
    '-c:v', 'libx264', '-crf', '18', outro,
  ]);

  const final = path.join(HERE, 'lente-promo.mp4');
  const d1 = INTRO - 0.5;
  const d2 = d1 + screen.duration - 0.5;
  ffmpeg([
    '-i', intro, '-i', body, '-i', outro,
    '-filter_complex',
    `[0:v][1:v]xfade=transition=fade:duration=0.5:offset=${d1.toFixed(2)}[a];[a][2:v]xfade=transition=fade:duration=0.5:offset=${d2.toFixed(2)},format=yuv420p[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', final,
  ]);

  const poster = path.join(HERE, 'lente-promo-portada.jpg');
  ffmpeg(['-ss', String((INTRO + 2.5).toFixed(2)), '-i', final, '-frames:v', '1', '-q:v', '3', poster]);
  return final;
}

/** Clip para la web: solo la pantalla, con keyframes frecuentes para poder avanzarlo con el scroll sin tirones. */
async function buildWebClip(screen, marks, frames) {
  await mkdir(MEDIA, { recursive: true });
  const out = path.join(MEDIA, 'lente-recorrido.mp4');
  const seq = await resample(frames, 30, screen.duration, 'seq30');
  ffmpeg([
    '-framerate', '30', '-i', seq, '-an',
    // 640 px basta para el marco del móvil (≈320 px CSS a 2x) y deja el vídeo en ~6 MB.
    '-vf', 'scale=640:-2:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '32', '-profile:v', 'high',
    '-g', '10', '-keyint_min', '10', '-sc_threshold', '0', '-bf', '0',
    '-movflags', '+faststart', out,
  ]);
  ffmpeg(['-i', out, '-frames:v', '1', '-q:v', '3', path.join(MEDIA, 'lente-recorrido.jpg')]);
  const scenes = marks.filter((m) => m.id !== 'end').map((m) => ({ id: m.id, t: Number(m.t.toFixed(2)) }));
  await writeFile(path.join(MEDIA, 'lente-recorrido.json'), `${JSON.stringify({ duration: Number(screen.duration.toFixed(2)), scenes }, null, 2)}\n`);
  return out;
}

// --montar: rehace los vídeos con la última grabación, sin volver a grabar.
const REC_FILE = path.join(WORK, 'grabacion.json');
let rec;
if (process.argv.includes('--montar')) {
  rec = JSON.parse(await readFile(REC_FILE, 'utf8'));
} else {
  rec = await record();
  await writeFile(REC_FILE, JSON.stringify(rec));
}
console.log(`Fotogramas capturados: ${rec.frames.length}`);
console.log('Escenas:', rec.marks.map((m) => `${m.id}@${m.t.toFixed(1)}s`).join(' '));
const screen = await buildScreenClip(rec);
const gaps = rec.frames.slice(1).map((f, i) => f.t - rec.frames[i].t);
const busy = gaps.filter((g) => g < 0.25);
console.log(`Captura: ${(busy.length / busy.reduce((a, b) => a + b, 0)).toFixed(1)} fotogramas/s en movimiento`);
console.log(`Vídeo web: ${await buildWebClip(screen, rec.marks, rec.frames)}`);
if (!WEB) console.log(`Vídeo promocional: ${await buildPromo(screen, rec.marks)}`);
