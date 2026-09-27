// Prueba en Chromium: mercados favoritos y cookie de sesión persistente.
// Requisitos: chromium y el servidor demo (node local-demo/server.mjs).
// Uso: node tests/e2e/app-features.e2e.mjs

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launchChromium, sleep } from './cdp.mjs';

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000/';
const results = [];

async function step(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`✔ ${name}`);
  } catch (err) {
    results.push(false);
    console.log(`✖ ${name}\n    ${err.message}`);
  }
}

const profileDir = await mkdtemp(path.join(tmpdir(), 'lente-e2e-'));
const { cdp, kill } = await launchChromium({ port: 9335, profileDir });

try {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{localStorage.setItem('lente.cookies-ack','1');localStorage.setItem('lente.dismiss-install',String(Date.now()));}catch(e){}",
  });
  const open = async () => {
    await cdp.send('Page.navigate', { url: APP_URL });
    await cdp.waitFor("document.querySelector('.card-intro')");
  };
  const goMarkets = async () => {
    await cdp.eval(`document.querySelector('.nav-item[data-screen="markets"]').click()`);
    await cdp.waitFor("document.querySelectorAll('#markets-list .market-item').length > 10");
  };
  const favSection = () => cdp.eval(`[...document.querySelectorAll('.market-section[data-cat="favs"] .market-item-name')].map((e) => e.textContent)`);

  await open();
  await cdp.eval("localStorage.removeItem('lente.market-favs')");
  await open();
  await goMarkets();

  await step('sin favoritos se muestra la sección vacía arriba del todo con la explicación', async () => {
    const first = await cdp.eval("document.querySelector('#markets-list .market-section').dataset.cat");
    assert.equal(first, 'favs');
    assert.ok(await cdp.eval("!!document.querySelector('.market-favs-empty')"));
  });

  await step('cada mercado tiene su botón de estrella', async () => {
    const [items, stars] = await cdp.eval(`[document.querySelectorAll('#markets-list .market-item').length, document.querySelectorAll('#markets-list .market-item .market-fav-btn').length]`);
    assert.equal(items, stars);
  });

  await step('tocar la estrella añade a favoritos sin abrir el gráfico', async () => {
    await cdp.eval(`document.querySelector('.market-section[data-cat="cripto"] .market-fav-btn[data-fav="BTC-USD"]').click()`);
    await cdp.eval(`document.querySelector('.market-section[data-cat="indices"] .market-fav-btn[data-fav="^IBEX"]').click()`);
    await sleep(200);
    assert.ok(!(await cdp.eval("location.pathname.startsWith('/chart/')")), 'no debe navegar al gráfico');
    assert.deepEqual(await favSection(), ['Bitcoin', 'IBEX 35']);
  });

  await step('la estrella queda marcada en todas las apariciones del mercado', async () => {
    const pressed = await cdp.eval(`[...document.querySelectorAll('.market-fav-btn[data-fav="BTC-USD"]')].map((b) => b.getAttribute('aria-pressed'))`);
    assert.ok(pressed.length >= 2);
    assert.ok(pressed.every((p) => p === 'true'));
  });

  await step('la pestaña Favoritos muestra el contador y solo los favoritos', async () => {
    const label = await cdp.eval("document.querySelector('.market-tab--favs').textContent");
    assert.match(label, /Favoritos · 2/);
    await cdp.eval("document.querySelector('.market-tab--favs').click()");
    const cats = await cdp.eval("[...document.querySelectorAll('#markets-list .market-section')].map((s) => s.dataset.cat)");
    assert.deepEqual(cats, ['favs']);
    await cdp.eval("setMarketTab('all')");
  });

  await step('los favoritos se mantienen al recargar y encabezan el ticker de Hoy', async () => {
    await open();
    await goMarkets();
    assert.deepEqual(await favSection(), ['Bitcoin', 'IBEX 35']);
    const ticker = await cdp.eval("[...document.querySelectorAll('#ticker .ticker-name')].slice(0, 2).map((e) => e.textContent)");
    assert.deepEqual(ticker, ['Bitcoin', 'IBEX 35']);
  });

  await step('la estrella del gráfico refleja y cambia el favorito', async () => {
    await cdp.eval(`document.querySelector('.market-section[data-cat="cripto"] .market-item[data-chart="BTC-USD"]').click()`);
    await cdp.waitFor("document.getElementById('screen-chart').classList.contains('active')");
    assert.equal(await cdp.eval("document.getElementById('chart-fav-btn').getAttribute('aria-pressed')"), 'true');
    await cdp.eval("document.getElementById('chart-fav-btn').click()");
    assert.equal(await cdp.eval("document.getElementById('chart-fav-btn').getAttribute('aria-pressed')"), 'false');
    await cdp.eval("document.getElementById('chart-page-back').click()");
    await sleep(300);
    assert.deepEqual(await favSection(), ['IBEX 35']);
  });

  await step('quitar el favorito desde su sección lo elimina', async () => {
    await cdp.eval(`document.querySelector('.market-section[data-cat="favs"] .market-fav-btn[data-fav="^IBEX"]').click()`);
    assert.deepEqual(await favSection(), []);
    assert.ok(await cdp.eval("!!document.querySelector('.market-favs-empty')"));
  });

  await step('la cookie de sesión es HttpOnly: el JavaScript de la página no puede leerla', async () => {
    await cdp.eval(`fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: 'e2e_token_12345' }) }).then((r) => r.status)`);
    assert.ok(!(await cdp.eval("document.cookie.includes('lente_session')")));
    const { cookies } = await cdp.send('Network.getCookies', { urls: [new URL('/api/session', APP_URL).href] });
    const c = cookies.find((x) => x.name === 'lente_session');
    assert.ok(c, 'cookie creada');
    assert.equal(c.httpOnly, true);
    assert.ok(c.expires * 1000 - Date.now() > 360 * 24 * 3600 * 1000, 'caduca en más de un año');
  });

  await step('la cookie sobrevive a borrar el localStorage y el servidor devuelve el token', async () => {
    await cdp.eval('localStorage.clear()');
    await open();
    const token = await cdp.eval("fetch('/api/session').then((r) => r.json()).then((d) => d.refresh_token)");
    assert.equal(token, 'e2e_token_12345');
  });

  await step('cerrar sesión borra la cookie', async () => {
    await cdp.eval("fetch('/api/session', { method: 'DELETE' }).then((r) => r.status)");
    const token = await cdp.eval("fetch('/api/session').then((r) => r.json()).then((d) => d.refresh_token)");
    assert.equal(token, null);
  });
} finally {
  cdp.close();
  kill();
  await sleep(500);
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} comprobaciones correctas`);
process.exitCode = ok === results.length ? 0 : 1;
