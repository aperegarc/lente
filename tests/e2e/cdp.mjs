// Cliente mínimo de Chrome DevTools Protocol + arranque de Chromium headless (sin dependencias npm).
import { spawn } from 'node:child_process';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.json();
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error(`No responde ${url}`);
}

export class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.handlers.get(msg.method)?.(msg.params);
      }
    };
  }
  open() {
    return new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) { this.handlers.set(method, fn); }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
    return r.result.value;
  }
  async waitFor(expression, timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await this.eval(`!!(${expression})`)) return;
      await sleep(150);
    }
    throw new Error(`Timeout esperando: ${expression}`);
  }
  close() { this.ws.close(); }
}

/** Arranca Chromium headless y devuelve { cdp, kill }. */
export async function launchChromium({ port = 9333, profileDir, width = 390, height = 844, scale = 1 }) {
  const chrome = spawn('chromium', [
    '--headless=new',
    `--force-device-scale-factor=${scale}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const pages = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const page = pages.find((p) => p.type === 'page');
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    return { cdp, kill: () => chrome.kill('SIGTERM') };
  } catch (err) {
    chrome.kill('SIGTERM');
    throw err;
  }
}
