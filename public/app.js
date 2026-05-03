// ============================================================
// /public/app.js — VERSIÓN v26 FINAL
// Ticker simple + gráficas TradingView
// Números y % en vivo, click abre gráfica completa
// ============================================================

const { SUPABASE_URL, SUPABASE_ANON_KEY, API } = window.LENTE_CONFIG;

const TRADINGVIEW_MAP = {
  '^IBEX': 'IBEX:IBEX',
  '^GSPC': 'FOREXCOM:SPX500',
  '^NDX': 'NASDAQ:CCMP',
  '^STOXX50E': 'STOXX:STOXX50E',
  'AAPL': 'NASDAQ:AAPL',
  'MSFT': 'NASDAQ:MSFT',
  'GOOGL': 'NASDAQ:GOOGL',
  'GOOG': 'NASDAQ:GOOG',
  'AMZN': 'NASDAQ:AMZN',
  'NVDA': 'NASDAQ:NVDA',
  'META': 'NASDAQ:META',
  'TSLA': 'NASDAQ:TSLA',
  'NFLX': 'NASDAQ:NFLX',
  'UBER': 'NYSE:UBER',
  'JPM': 'NYSE:JPM',
  'BAC': 'NYSE:BAC',
  'GS': 'NYSE:GS',
  'WFC': 'NYSE:WFC',
  'BA': 'NYSE:BA',
  'CAT': 'NYSE:CAT',
  'GE': 'NYSE:GE',
  'XOM': 'NYSE:XOM',
  'CVX': 'NYSE:CVX',
  'MPC': 'NYSE:MPC',
  'JNJ': 'NYSE:JNJ',
  'UNH': 'NYSE:UNH',
  'PFE': 'NYSE:PFE',
  'ABBV': 'NYSE:ABBV',
  'WMT': 'NYSE:WMT',
  'KO': 'NYSE:KO',
  'MCD': 'NYSE:MCD',
  'SAN': 'BME:SAN',
  'IBE': 'BME:IBE',
  'BBVA': 'BME:BBVA',
  'REP': 'BME:REP',
  'ELE': 'BME:ELE',
  'ACS': 'BME:ACS',
  'AENA': 'BME:AENA',
  'INGA': 'BME:INGA',
  'BTC-USD': 'BINANCE:BTCUSDT',
  'ETH-USD': 'BINANCE:ETHUSDT',
  'XRP-USD': 'BINANCE:XRPUSDT',
  'ADA-USD': 'BINANCE:ADAUSDT',
  'SOL-USD': 'BINANCE:SOLUSDT',
  'DOGE-USD': 'BINANCE:DOGEUSDT',
  'LINK-USD': 'BINANCE:LINKUSDT',
  'MATIC-USD': 'BINANCE:MATICUSDT',
  'EURUSD=X': 'FX:EURUSD',
  'GBPUSD=X': 'FX:GBPUSD',
  'JPYUSD=X': 'FX:USDJPY',
  'CHFUSD=X': 'FX:USDCHF',
  'AUDUSD=X': 'FX:AUDUSD',
  'CADUSD=X': 'FX:USDCAD',
  'GC=F': 'FOREXCOM:XAUUSD',
  'BZ=F': 'NYMEX:CL1!',
  'TTF=F': 'EUREX:FGBL1',
  'SI=F': 'COMEX:SI1!',
};

let supabaseClient = null;
let supabaseReady = false;
let authListenerInitialized = false;
let appReady = false;
let deferredPrompt = null;

const ua = navigator.userAgent.toLowerCase();
const uaRaw = navigator.userAgent;
/** iPad con iPadOS puede declararse como Mac + táctil */
const isIPadOSDevice =
  /ipad/.test(ua) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIOSDevice = /iphone|ipod/.test(ua) || isIPadOSDevice;
const isMacDesktop =
  /macintosh|mac os x/i.test(uaRaw) && !isIOSDevice && !/android/i.test(uaRaw);

/** Safari de escritorio en Mac (no Chrome/Edge/Firefox) */
function isDesktopSafari() {
  return (
    /^((?!chrome|crios|fxios|edg|opr\/).)*safari/i.test(uaRaw) && isMacDesktop
  );
}

const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
const isAndroid = /android/.test(ua);
const isChrome = /chrome|chromium|crios/.test(ua);
const isEdge = /edg/.test(ua);
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: window-controls-overlay)').matches ||
  window.navigator.standalone === true;

function initSupabase() {
  if (window.supabase && !supabaseClient) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      supabaseReady = true;
    } catch (err) {
      setTimeout(initSupabase, 100);
    }
  } else if (!window.supabase) {
    setTimeout(initSupabase, 100);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}

async function waitForSupabase() {
  let retries = 0;
  while (!supabaseReady && retries < 100) {
    await new Promise(r => setTimeout(r, 50));
    retries++;
  }
  if (!supabaseReady) throw new Error('Supabase no se pudo inicializar');
  return supabaseClient;
}

/** Etiquetas en español para pestañas de mercados (vista catálogo / categorías DB) */
const MARKET_CATEGORY_LABELS = {
  indices: 'Índices',
  divisas: 'Divisas',
  materias: 'Materias primas',
  cripto: 'Cripto',
  acciones: 'Acciones',
};

const MARKET_CATEGORY_ORDER = ['indices', 'divisas', 'materias', 'cripto', 'acciones'];

function marketCategorySortKey(cat) {
  const i = MARKET_CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? 100 + cat.charCodeAt(0) : i;
}

const state = {
  session: null,
  profile: null,
  feed: { date: null, cards: [] },
  feedMeta: {
    plan_tier: 'free',
    free_limit: 5,
    total_in_edition: 0,
    locked_count: 0,
    edition_complete: true,
  },
  markets: { grouped: {}, flat: [], updated_at: null },
  marketsDisclaimer: null,
  savedIds: new Set(),
  currentScreen: 'today',
  currentMarketTab: 'all',
  /** null = todas las categorías en Hoy */
  activeTopicFilter: null,
};

function isPremium() {
  if (!state.session) return false;
  const plan = state.profile?.plan;
  const expires = state.profile?.plan_expires_at;
  if (plan !== 'premium') return false;
  if (expires && new Date(expires) < new Date()) return false;
  return true;
}

function isLoggedIn() {
  return !!state.session;
}

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

function fmtDate(iso) {
  if (!iso) return 'Hoy';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).replace(/^\w/, c => c.toUpperCase());
}

function fmtNum(n, digits = 2) {
  if (n == null || Number.isNaN(+n)) return '–';
  return (+n).toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(n) {
  if (n == null) return '–';
  const sign = n > 0 ? '+' : (n < 0 ? '−' : '±');
  return `${sign}${Math.abs(n).toFixed(2)}%`;
}

function switchScreen(name) {
  state.currentScreen = name;
  $$('.screen').forEach(s => s.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  $(`screen-${name}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-screen="${name}"]`)?.classList.add('active');
  if (name === 'markets' && state.markets.flat.length === 0) loadMarkets();
  if (name === 'today' && state.markets.flat.length === 0) loadMarkets();
  if (name === 'saved') void renderSaved();
  if (name === 'profile') renderProfilePage();
}

$$('.nav-item').forEach(n => {
  n.addEventListener('click', () => switchScreen(n.dataset.screen));
});

async function loadFeed() {
  const feedList = $('feed-list');
  if (!feedList) return;
  feedList.innerHTML = `<div class="loading">Cargando...</div>`;
  try {
    await waitForSupabase();
    const url = API.feed + '?_t=' + Date.now();
    const headers = {};
    const token = state.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (res.status === 403) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || 'Contenido solo Premium');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.feed = { date: data.date, cards: data.cards || [] };
    state.feedMeta = {
      plan_tier: data.plan_tier || 'free',
      free_limit: data.free_limit ?? 5,
      total_in_edition: data.total_in_edition ?? 0,
      locked_count: data.locked_count ?? 0,
      edition_complete: data.edition_complete !== false,
      is_latest_edition: data.is_latest_edition !== false,
    };
    renderFeed();
    renderTopicChips();
  } catch (err) {
    console.error('❌ Error loadFeed:', err.message);
    if (feedList) feedList.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${err.message}</p></div>`;
  }
}

function toggleReadMore(id) {
  const body = $(`body-${id}`);
  const btn = $(`readmore-${id}`);
  if (!body || !btn) return;
  const collapsed = body.classList.toggle('body-collapsed');
  btn.textContent = collapsed ? 'Leer más ↓' : 'Leer menos ↑';
}

function categoryPillClass(cat) {
  const map = {
    'Política monetaria': 'bg-primary-fixed text-on-primary-fixed-variant',
    'Materias primas': 'bg-secondary-container/60 text-on-secondary-container',
    'Macro Europa': 'bg-primary-fixed text-on-primary-fixed-variant',
    Macro: 'bg-primary-fixed text-on-primary-fixed-variant',
    Tech: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
    Bolsa: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
    Cripto: 'bg-secondary-container text-on-secondary-container',
    Energía: 'bg-secondary-fixed/40 text-secondary',
    España: 'bg-surface-container-high text-on-surface-variant',
    Geopolítica: 'bg-primary-fixed text-on-primary-fixed-variant',
    Inmobiliario: 'bg-secondary-container/50 text-on-secondary-container',
    Laboral: 'bg-surface-container-high text-on-surface-variant',
  };
  return map[cat] || 'bg-secondary-container/40 text-on-secondary-container';
}

function renderFeed(filterCategory = null) {
  const feedList = $('feed-list');
  if (!feedList) return;
  const topic = filterCategory ?? state.activeTopicFilter;
  const cards = topic ? state.feed.cards.filter((c) => c.category === topic) : state.feed.cards;

  const dateCaption = $('feed-date-caption');
  const mainTitle = $('feed-main-title');
  const editionLabel = $('edition-label');
  if (dateCaption) dateCaption.textContent = fmtDate(state.feed.date);
  if (mainTitle) mainTitle.textContent = topic ? topic : 'Para ti hoy';
  if (editionLabel) {
    editionLabel.textContent = topic ? `Filtro · ${topic}` : 'Edición del día';
  }

  if (!cards || cards.length === 0) {
    feedList.innerHTML = `<div class="empty-state"><h2>${topic ? `Sin noticias de ${escapeHtml(topic)}` : 'Sin contenido todavía'}</h2></div>`;
    return;
  }

  const totalReadTime = Math.round(cards.reduce((a, c) => a + (c.read_time_seconds || 40), 0) / 60);
  const lockedCount = state.feedMeta?.locked_count ?? 0;
  const showPremiumStrip =
    !topic && !isPremium() && lockedCount > 0;

  let html = '';
  if (showPremiumStrip) {
    html += `<div class="mb-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0_4px_20px_rgba(15,45,46,0.05)]">
      <p class="font-ui-label text-sm leading-relaxed text-on-surface-variant">
        <strong class="text-primary">${lockedCount} noticia${lockedCount === 1 ? '' : 's'} más</strong> en esta edición con <strong>Premium</strong> — 5 €/mes o 20 €/año (histórico + guardar).
      </p>
    </div>`;
  }

  for (const c of cards) {
    const pill = categoryPillClass(c.category);
    const saved = state.savedIds.has(c.id);
    const saveLocked = !isPremium();
    html += `
<article class="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(15,45,46,0.05)] overflow-hidden border border-outline-variant/10" data-id="${c.id}">
  <div class="p-stack-lg">
    <div class="flex justify-between items-start gap-2 mb-stack-sm">
      <span class="inline-block px-2 py-1 ${pill} text-[10px] font-bold uppercase rounded-sm">${escapeHtml(c.category)}</span>
      <span class="font-ui-label text-caption text-outline whitespace-nowrap">${c.read_time_seconds || 40} s</span>
    </div>
    <h2 class="font-article-body text-2xl font-medium text-primary leading-tight mb-stack-sm">${escapeHtml(c.headline)}</h2>
    <p class="font-article-body text-base text-on-surface-variant mb-stack-md leading-relaxed">${escapeHtml(c.deck)}</p>
    <p class="font-ui-label text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">Qué ha pasado</p>
    <p class="font-article-body text-on-surface body-collapsed text-base leading-relaxed mb-2" id="body-${c.id}">${escapeHtml(c.body)}</p>
    <button type="button" class="text-left font-ui-label text-xs font-semibold uppercase tracking-wider text-secondary mb-stack-md hover:opacity-80" id="readmore-${c.id}" onclick="toggleReadMore('${c.id}')">Leer más ↓</button>
    <div class="bg-[#f0f7f7] p-stack-md rounded-lg border-l-4 border-secondary">
      <h4 class="font-ui-label text-ui-label font-bold text-secondary mb-1">¿Qué significa para ti?</h4>
      <p class="font-ui-label text-sm text-on-primary-fixed-variant leading-snug">${escapeHtml(c.meaning)}</p>
    </div>
    <div class="mt-stack-md flex items-center justify-end gap-2 border-t border-outline-variant/20 pt-4">
      <button type="button" class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant/40 text-primary-container hover:bg-surface-container transition-colors ${saved ? 'saved' : ''}"
        title="${saveLocked ? 'Premium — guardar noticias' : 'Guardar'}"
        onclick="toggleSave('${c.id}', this)">
        <span class="material-symbols-outlined text-[22px]">bookmark</span>
      </button>
      <button type="button" class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant/40 text-primary-container hover:bg-surface-container transition-colors"
        onclick="shareCard('${c.id}')" aria-label="Compartir">
        <span class="material-symbols-outlined text-[22px]">share</span>
      </button>
    </div>
  </div>
</article>`;
  }

  if (!topic && !isPremium() && lockedCount > 0) {
    html += `
<article class="relative bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(15,45,46,0.05)] overflow-hidden border border-outline-variant/10">
  <div class="p-stack-lg">
    <div class="flex justify-between items-start mb-stack-md">
      <span class="inline-block px-2 py-1 bg-tertiary-fixed text-on-tertiary-fixed-variant text-[10px] font-bold uppercase rounded-sm">Premium</span>
      <span class="material-symbols-outlined text-primary text-lg" style="font-variation-settings: 'FILL' 1;">lock</span>
    </div>
    <h2 class="font-article-body text-2xl font-medium text-primary leading-tight mb-stack-sm">Sigue leyendo la edición completa</h2>
    <div class="relative min-h-[100px]">
      <p class="font-article-body text-on-surface-variant text-base leading-relaxed opacity-40">
        Desbloquea todas las noticias de hoy, el histórico de ediciones y guardar en tu cuenta…
      </p>
      <div class="absolute inset-0 premium-blur flex items-center justify-center rounded-lg">
        <button type="button" class="bg-primary-container text-white px-stack-lg py-stack-md rounded-full font-ui-label text-sm font-bold shadow-lg active:scale-95 transition-transform"
          onclick="startStripeCheckout('monthly')">Desbloquear con Premium</button>
      </div>
    </div>
  </div>
</article>`;
  }

  if (!topic) {
    html += `
<section class="premium-card-gradient p-stack-lg rounded-xl text-white mt-6 mb-2">
  <h3 class="font-headline-md text-headline-md text-secondary-fixed mb-base-unit">Claridad semanal</h3>
  <p class="font-ui-label text-sm opacity-90 mb-stack-md">Recibe el resumen dominical con lo que importa para tu patrimonio (próximamente).</p>
  <button type="button" class="w-full rounded-lg bg-secondary-fixed py-3 font-bold text-primary-container hover:opacity-95 active:scale-[0.98] transition-transform"
    onclick="toast('Newsletter próximamente')">Avísame</button>
</section>`;
  }

  feedList.innerHTML = html;
}

function renderTicker() {
  const tickerEl = $('ticker');
  if (!tickerEl) return;

  const popular = ['^IBEX', 'AAPL', 'MSFT', 'BTC-USD', 'ETH-USD', 'TSLA'];
  const items = popular.map((sym) => state.markets.flat.find((m) => m.symbol === sym)).filter(Boolean);

  if (items.length === 0) {
    tickerEl.innerHTML = '';
    return;
  }

  tickerEl.innerHTML = items
    .map((m) => {
      const cls = m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
      const prefix = m.symbol === 'GC=F' || m.symbol === 'BZ=F' ? '$' : '';
      const priceDigits = m.price > 1000 ? 0 : 2;
      return `<div class="ticker-item"><span class="ticker-name">${m.name}</span><span class="ticker-price">${prefix}${fmtNum(m.price, priceDigits)}</span><span class="ticker-change ${cls}">${fmtPct(m.change_pct)}</span></div>`;
    })
    .join('');
}

function renderMiniMarkets() {
  const root = $('mini-markets');
  if (!root) return;
  const order = ['^IBEX', 'EURUSD=X', 'GC=F', 'BTC-USD', '^GSPC'];
  const picked = [];
  for (const sym of order) {
    if (picked.length >= 2) break;
    const m = state.markets.flat.find((x) => x.symbol === sym);
    if (m) picked.push(m);
  }
  if (picked.length < 2) {
    for (const m of state.markets.flat) {
      if (picked.length >= 2) break;
      if (!picked.find((p) => p.symbol === m.symbol)) picked.push(m);
    }
  }
  if (picked.length === 0) {
    root.innerHTML = '';
    return;
  }
  root.innerHTML = picked
    .map((m) => {
      const cls =
        m.change_pct > 0 ? 'text-secondary' : m.change_pct < 0 ? 'text-error' : 'text-on-surface-variant';
      const prefix = m.symbol?.includes('=F') ? '$' : '';
      let priceDigits = 2;
      if (m.price > 1000) priceDigits = 0;
      if (m.symbol?.includes('EUR') || m.category === 'divisas') priceDigits = 4;
      const label = m.name.length > 22 ? `${m.name.slice(0, 20)}…` : m.name;
      return `<div class="bg-surface-container-lowest p-stack-md rounded-xl shadow-[0_4px_20px_rgba(15,45,46,0.05)] flex flex-col border border-outline-variant/10">
      <span class="font-ui-label text-caption text-on-surface-variant">${escapeHtml(label)}</span>
      <div class="flex items-baseline gap-2 mt-1">
        <span class="font-headline-md text-headline-md text-primary">${prefix}${fmtNum(m.price, priceDigits)}</span>
        <span class="text-caption font-bold ${cls}">${fmtPct(m.change_pct)}</span>
      </div>
    </div>`;
    })
    .join('');
}

async function loadMarkets() {
  const marketsList = $('markets-list');
  if (!marketsList) return;
  marketsList.innerHTML = `<div class="loading">Cargando...</div>`;
  try {
    await waitForSupabase();
    const res = await fetch(`${API.markets}?view=universe&_t=${Date.now()}`);
    if (!res.ok) throw new Error('Error');
    state.markets = await res.json();
    state.marketsDisclaimer = state.markets.disclaimer || null;
    renderMarkets();
    renderTicker();
    renderMiniMarkets();
  } catch (err) {
    console.error('Error loadMarkets:', err);
  }
}

function marketSparkSvg(up) {
  const path = up
    ? 'M0,18 L16,10 L32,14 L48,6 L64,8'
    : 'M0,8 L16,16 L32,10 L48,20 L64,14';
  const stroke = up ? '#2b6769' : '#ba1a1a';
  return `<svg class="w-16 h-8 shrink-0 overflow-visible" viewBox="0 0 64 24" fill="none" aria-hidden="true"><path d="${path}" stroke="${stroke}" stroke-width="2" fill="none" /></svg>`;
}

function renderMarkets() {
  const marketsList = $('markets-list');
  const tabs = $('market-tabs');
  const updatedEl = $('markets-updated');
  if (!marketsList || !tabs) return;

  if (updatedEl) {
    updatedEl.textContent = state.markets.updated_at
      ? 'Actualizado · ' +
        new Date(state.markets.updated_at).toLocaleString('es-ES', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Referencias en vivo y datos orientativos';
  }

  const cats = Object.keys(state.markets.grouped || {}).sort(
    (a, b) => marketCategorySortKey(a) - marketCategorySortKey(b),
  );
  const label = (c) => MARKET_CATEGORY_LABELS[c] || c;

  const tabBtn = (id, title, active) =>
    `<button type="button" class="rounded-full px-4 py-2 font-ui-label text-xs font-semibold uppercase tracking-wider transition-colors ${
      active ? 'bg-primary-container text-white shadow-md' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container'
    }" onclick="setMarketTab('${id}')">${title}</button>`;

  tabs.innerHTML =
    tabBtn('all', 'Todo', state.currentMarketTab === 'all') +
    cats.map((cat) => tabBtn(cat, label(cat), state.currentMarketTab === cat)).join('');

  const groups =
    state.currentMarketTab === 'all'
      ? state.markets.grouped
      : { [state.currentMarketTab]: state.markets.grouped[state.currentMarketTab] || [] };

  const sectionOrder = Object.keys(groups).sort(
    (a, b) => marketCategorySortKey(a) - marketCategorySortKey(b),
  );

  const rowCard = (m) => {
    const cls = m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
    const up = (m.change_pct ?? 0) >= 0;
    const prefix = m.symbol?.includes('=F') ? '$' : '';
    let priceDigits = 2;
    if (m.price > 1000) priceDigits = 0;
    else if (m.symbol?.includes('EUR') || m.category === 'divisas') priceDigits = 4;
    else if (m.category === 'cripto' && m.price != null && m.price < 1) priceDigits = 4;
    const tvSymbol = m.tv || TRADINGVIEW_MAP[m.symbol] || m.symbol;
    const detailMeta = {
      symbol: m.symbol,
      name: m.name,
      tv: tvSymbol,
      category: m.category,
      price: m.price,
      change_pct: m.change_pct,
    };
    const pctCls =
      cls === 'up' ? 'text-secondary' : cls === 'down' ? 'text-error' : 'text-on-surface-variant';
    return `
<div class="bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_20px_rgba(15,45,46,0.05)] border border-outline-variant/20 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition-transform"
  role="button" onclick='openMarketDetail(${JSON.stringify(detailMeta)})'>
  <div class="flex-1 min-w-0">
    <div class="font-ui-label text-ui-label text-primary font-bold truncate">${escapeHtml(m.name)}</div>
    <div class="font-caption text-caption text-on-surface-variant truncate">${escapeHtml(m.description || '')}</div>
  </div>
  <div class="flex-1 flex justify-center">${marketSparkSvg(up)}</div>
  <div class="flex-1 text-right">
    <div class="font-ui-label text-ui-label text-primary font-bold">${m.price != null && !Number.isNaN(+m.price) ? `${prefix}${fmtNum(m.price, priceDigits)}` : '–'}</div>
    <div class="font-caption text-caption font-bold ${pctCls}">${m.change_pct != null && !Number.isNaN(+m.change_pct) ? fmtPct(m.change_pct) : '–'}</div>
  </div>
</div>`;
  };

  const cryptoCard = (m) => {
    const cls = m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
    const up = (m.change_pct ?? 0) >= 0;
    let priceDigits = 2;
    if (m.category === 'cripto' && m.price != null && m.price < 1) priceDigits = 4;
    const tvSymbol = m.tv || TRADINGVIEW_MAP[m.symbol] || m.symbol;
    const detailMeta = {
      symbol: m.symbol,
      name: m.name,
      tv: tvSymbol,
      category: m.category,
      price: m.price,
      change_pct: m.change_pct,
    };
    const pctCls =
      cls === 'up' ? 'text-secondary' : cls === 'down' ? 'text-error' : 'text-on-surface-variant';
    return `
<div class="bg-surface-container-lowest rounded-xl p-5 shadow-[0_4px_20px_rgba(15,45,46,0.05)] border border-outline-variant/20 cursor-pointer active:scale-[0.99] transition-transform"
  role="button" onclick='openMarketDetail(${JSON.stringify(detailMeta)})'>
  <div class="flex justify-between items-start mb-4">
    <span class="material-symbols-outlined text-primary-container text-[28px]">currency_bitcoin</span>
    <div class="font-caption text-caption font-bold ${pctCls}">${m.change_pct != null && !Number.isNaN(+m.change_pct) ? fmtPct(m.change_pct) : '–'}</div>
  </div>
  <div class="font-ui-label text-ui-label text-primary font-bold truncate">${escapeHtml(m.name)}</div>
  <div class="font-headline-md text-headline-md text-primary-container mt-1">${m.price != null && !Number.isNaN(+m.price) ? fmtNum(m.price, priceDigits) : '–'}</div>
  <div class="mt-4 w-full">${marketSparkSvg(up)}</div>
</div>`;
  };

  let html = '';
  for (const cat of sectionOrder) {
    const items = groups[cat];
    if (!items?.length) continue;
    html += `<section class="mb-stack-lg"><h2 class="font-headline-md text-headline-md text-primary-container mb-stack-md">${label(cat)}</h2>`;
    if (cat === 'cripto') {
      html += `<div class="grid grid-cols-2 gap-4">${items.map((m) => cryptoCard(m)).join('')}</div>`;
    } else {
      html += `<div class="space-y-stack-md">${items.map((m) => rowCard(m)).join('')}</div>`;
    }
    html += `</section>`;
  }

  const disc = state.marketsDisclaimer
    ? `<p class="font-ui-label text-caption text-on-surface-variant mt-6 px-1">${escapeHtml(state.marketsDisclaimer)}</p>`
    : '';
  marketsList.innerHTML = (html || `<div class="empty-state"><h2>Sin datos</h2></div>`) + disc;
}

function setMarketTab(tab) {
  state.currentMarketTab = tab;
  renderMarkets();
}

/** Normaliza puntos {t,v} que vienen del JSON (por si acaso vienen como string). */
function normalizeMarketSeriesPoints(series) {
  const raw = Array.isArray(series) ? series : [];
  return raw
    .map((p) => {
      const v =
        typeof p.v === 'number' && !Number.isNaN(p.v)
          ? p.v
          : parseFloat(String(p?.v ?? '').replace(',', '.'));
      return { t: p.t, v };
    })
    .filter((p) => p.v != null && !Number.isNaN(p.v));
}

/** Gráfico de línea en canvas (sin dependencias externas). */
function drawMarketSeriesCanvas(canvas, series, strokeRgb) {
  const ptsIn = normalizeMarketSeriesPoints(series);
  if (!canvas || ptsIn.length === 0) return;

  let dataPts = ptsIn;
  if (dataPts.length === 1) {
    dataPts = [ptsIn[0], { ...ptsIn[0] }];
  }

  const wrap = canvas.parentElement;
  const w = Math.max(wrap?.clientWidth || 280, 200);
  const h = Math.max(wrap?.clientHeight || 200, 160);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const vals = dataPts.map((p) => p.v);
  if (vals.length < 2) return;

  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const span = max - min || 1;
  const pad = span * 0.06;
  min -= pad;
  max += pad;
  const range = max - min || 1;

  const marginL = 8;
  const marginR = 8;
  const marginT = 10;
  const marginB = 14;
  const innerW = w - marginL - marginR;
  const innerH = h - marginT - marginB;
  const n = vals.length;

  const pathPts = vals.map((v, i) => {
    const x = marginL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = marginT + innerH - ((v - min) / range) * innerH;
    return { x, y };
  });

  const [r, g, b] = strokeRgb;
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.14)`;
  ctx.beginPath();
  ctx.moveTo(pathPts[0].x, marginT + innerH);
  pathPts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pathPts[pathPts.length - 1].x, marginT + innerH);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pathPts[0].x, pathPts[0].y);
  for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
  ctx.stroke();
}

function parseAccentRgb() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (raw.startsWith('#') && raw.length >= 7) {
    const x = (n) => parseInt(raw.slice(n, n + 2), 16);
    return [x(1), x(3), x(5)];
  }
  return [201, 169, 97];
}

function formatMarketDetailPrice(v, meta) {
  if (v == null || Number.isNaN(+v)) return '–';
  const n = +v;
  if (meta.category === 'divisas' || String(meta.symbol || '').includes('EUR')) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  if (meta.category === 'cripto') {
    if (n >= 1000) return n.toLocaleString('es-ES', { maximumFractionDigits: 0 });
    if (n < 1) return n.toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Detalle mercado: número + % y gráfico simple (Frankfurter / CoinGecko / Finnhub).
 * No requiere cuenta ni Premium.
 */
async function openMarketDetail(meta) {
  const backdrop = document.createElement('div');
  backdrop.id = 'chart-modal-backdrop';
  backdrop.className = 'chart-modal-backdrop';

  let selectedDays = 30;
  backdrop.innerHTML = `
    <div class="chart-modal chart-modal--simple" role="dialog" aria-modal="true">
      <div class="chart-modal-header">
        <div>
          <div class="chart-modal-title">${meta.name}</div>
          <div class="chart-modal-symbol">${meta.symbol}</div>
        </div>
        <button type="button" class="chart-modal-close" onclick="closeChartModal()" aria-label="Cerrar">×</button>
      </div>
      <div class="chart-modal-simple-inner">
        <div class="chart-simple-stats" id="chart-simple-stats">
          <div class="chart-simple-change" id="chart-simple-change">…</div>
          <div class="chart-simple-price" id="chart-simple-price">…</div>
        </div>
        <div class="chart-range-tabs" id="chart-range-tabs">
          <button type="button" data-days="7" class="chart-range-tab">7 d</button>
          <button type="button" data-days="30" class="chart-range-tab active">30 d</button>
          <button type="button" data-days="90" class="chart-range-tab">90 d</button>
          <button type="button" data-days="365" class="chart-range-tab">1 a</button>
        </div>
        <div class="chart-canvas-wrap">
          <canvas id="market-chart-canvas" aria-label="Evolución del precio"></canvas>
        </div>
        <p class="chart-simple-hint" id="chart-simple-hint"></p>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  const canvas = $('market-chart-canvas');

  async function paint(days) {
    selectedDays = days;
    const elCh = $('chart-simple-change');
    const elPr = $('chart-simple-price');
    const elHint = $('chart-simple-hint');
    elCh.textContent = '…';
    elPr.textContent = '…';

    let data;
    try {
      const url = `${API.markets}?series=1&symbol=${encodeURIComponent(meta.symbol)}&days=${days}&_t=${Date.now()}`;
      const res = await fetch(url);
      data = await res.json();
      if (!res.ok || data.error) {
        elHint.textContent =
          data?.error || `Error del servidor (${res.status}).`;
        return;
      }
    } catch (err) {
      elHint.textContent = 'Error al cargar datos.';
      return;
    }

    const last =
      data.last_v != null && !Number.isNaN(+data.last_v)
        ? +data.last_v
        : meta.price != null
          ? +meta.price
          : null;
    const chg =
      data.change_pct != null && !Number.isNaN(+data.change_pct)
        ? +data.change_pct
        : meta.change_pct != null
          ? +meta.change_pct
          : null;

    elPr.textContent = formatMarketDetailPrice(last, meta);
    if (chg != null && !Number.isNaN(chg)) {
      const sign = chg > 0 ? '+' : chg < 0 ? '−' : '';
      const cls = chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
      elCh.innerHTML = `<span class="chart-pct ${cls}">${sign}${Math.abs(chg).toFixed(2)}%</span><span class="chart-pct-label">en el periodo</span>`;
    } else {
      elCh.innerHTML = '<span class="chart-pct flat">–</span><span class="chart-pct-label">variación</span>';
    }

    const serRaw = Array.isArray(data.series) ? data.series : [];
    const norm = normalizeMarketSeriesPoints(serRaw);
    elHint.textContent =
      norm.length > 0
        ? data.attribution || ''
        : last != null
          ? `${data.attribution || 'No hay serie histórica para este activo con las fuentes actuales; se muestra la última cotización de la lista.'}`
          : data.attribution || 'Sin datos en este periodo.';

    backdrop.querySelectorAll('.chart-range-tab').forEach((btn) => {
      btn.classList.toggle('active', +btn.dataset.days === days);
    });

    if (canvas) {
      if (norm.length > 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            drawMarketSeriesCanvas(canvas, serRaw, parseAccentRgb());
          });
        });
      } else {
        const wrap = canvas.parentElement;
        const w = Math.max(wrap?.clientWidth || 280, 200);
        const h = Math.max(wrap?.clientHeight || 200, 160);
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.clearRect(0, 0, w, h);
      }
    }
  }

  backdrop.querySelector('#chart-range-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chart-range-tab');
    if (!btn?.dataset.days) return;
    paint(+btn.dataset.days);
  });

  await paint(selectedDays);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeChartModal();
  });
}

function closeChartModal() {
  $('chart-modal-backdrop')?.remove();
}

const TOPICS = [
  { key: 'Macro', name: 'Macroecon­omía', icon: 'M', featured: true },
  { key: 'Bolsa', name: 'Bolsa y acciones', icon: 'B' },
  { key: 'Inmobiliario', name: 'Inmobi­liario', icon: 'I' },
  { key: 'Cripto', name: 'Cripto y blockchain', icon: '₿' },
  { key: 'Energía', name: 'Energía y materias', icon: 'E' },
  { key: 'Laboral', name: 'Laboral y pensiones', icon: 'L' },
  { key: 'Geopolítica', name: 'Geopolítica', icon: 'G' },
  { key: 'Tech', name: 'Tech e innovación', icon: 'T' },
  { key: 'España', name: 'España', icon: 'E' },
];

function renderTopicChips() {
  const el = $('topic-chips');
  if (!el) return;
  const counts = {};
  for (const c of state.feed.cards) counts[c.category] = (counts[c.category] || 0) + 1;
  const active = state.activeTopicFilter;
  const chipClass = (on) =>
    `shrink-0 rounded-full px-3 py-1.5 font-ui-label text-xs font-semibold whitespace-nowrap transition-colors border ${
      on
        ? 'bg-primary-container text-white border-primary-container shadow-sm'
        : 'bg-white text-on-surface-variant border-outline-variant/60 hover:bg-surface-container'
    }`;

  const parts = [
    `<button type="button" class="${chipClass(active == null)}" onclick="clearTopicFilter()">Todo</button>`,
  ];
  for (const t of TOPICS) {
    const on = active === t.key;
    const n = counts[t.key] || 0;
    parts.push(
      `<button type="button" class="${chipClass(on)}" onclick='filterByTopic(${JSON.stringify(t.key)})'>${escapeHtml(t.name)} · ${n}</button>`,
    );
  }
  el.innerHTML = parts.join('');
}

function clearTopicFilter() {
  state.activeTopicFilter = null;
  renderTopicChips();
  renderFeed();
}

function filterByTopic(topic) {
  const matching = state.feed.cards.filter((c) => c.category === topic);
  if (matching.length === 0) {
    toast(`Sin noticias de ${topic} hoy`);
    return;
  }
  state.activeTopicFilter = topic;
  switchScreen('today');
  renderTopicChips();
  renderFeed(topic);
}

async function loadSavedCards() {
  try {
    await waitForSupabase();
    if (!state.session) {
      state.savedIds = new Set();
      return;
    }
    const user = state.session?.user;
    if (!user) return;
    const { data, error } = await supabaseClient.from('saved_cards').select('card_id').eq('user_id', user.id);
    if (!error && data) state.savedIds = new Set(data.map(r => r.card_id));
  } catch (err) {
    console.error('Error loadSavedCards:', err);
  }
}

async function toggleSave(cardId, btn) {
  await waitForSupabase();
  if (!state.session) {
    toast('Inicia sesión para guardar noticias');
    openLoginModal();
    return;
  }
  const hadSaved = state.savedIds.has(cardId);
  if (!hadSaved && !isPremium()) {
    toast('Guardar e histórico completos son Premium — 5 €/mes o 20 €/año');
    return;
  }
  const user = state.session.user;
  try {
    if (hadSaved) {
      state.savedIds.delete(cardId);
      btn?.classList.remove('saved');
      const { error } = await supabaseClient.from('saved_cards').delete().eq('user_id', user.id).eq('card_id', cardId);
      if (error) throw error;
      toast('Eliminado');
    } else {
      state.savedIds.add(cardId);
      btn?.classList.add('saved');
      const { error } = await supabaseClient.from('saved_cards').upsert(
        { user_id: user.id, card_id: cardId, saved_at: new Date().toISOString() },
        { onConflict: 'user_id,card_id' },
      );
      if (error) throw error;
      toast('Guardado ✓');
    }
  } catch (err) {
    console.error('Error toggleSave:', err);
    if (hadSaved) {
      state.savedIds.add(cardId);
      btn?.classList.add('saved');
    } else {
      state.savedIds.delete(cardId);
      btn?.classList.remove('saved');
    }
    toast(err.message?.includes('row-level security') || err.code === '42501' ? 'Requiere Premium' : 'No se pudo guardar');
  }
}

async function renderSaved() {
  const savedList = $('saved-list');
  if (!savedList) return;
  if (!isLoggedIn()) {
    savedList.innerHTML = `<div class="empty-state rounded-2xl border border-outline-variant/30 bg-white px-6 py-10 shadow-sm">
      <h2 class="font-display-lg text-xl text-primary-container">Inicia sesión</h2>
      <p class="font-ui-label text-sm text-on-surface-variant mt-2">Guarda noticias y accede desde cualquier dispositivo.</p>
      <button type="button" class="mt-6 w-full rounded-xl bg-primary-container py-3 font-semibold text-white shadow-md active:scale-[0.98] transition-transform" onclick="openLoginModal()">Entrar</button>
    </div>`;
    return;
  }
  if (!isPremium()) {
    savedList.innerHTML = `<div class="relative overflow-hidden rounded-xl bg-primary-container p-8 text-white shadow-lg">
      <div class="relative z-10 flex flex-col">
        <span class="font-ui-label text-caption bg-secondary text-on-secondary px-3 py-1 rounded-full w-fit mb-4">Membresía Premium</span>
        <h3 class="font-display-lg text-headline-md mb-2">Guarda tus análisis favoritos</h3>
        <p class="font-ui-label text-sm opacity-90 mb-6 max-w-xs">Las cuentas gratuitas leen hasta 5 noticias del día. Guardar e histórico completos son Premium (5 €/mes o 20 €/año).</p>
        <button type="button" class="bg-secondary text-white font-ui-label font-bold py-3 px-6 rounded-lg w-full hover:opacity-90 active:scale-95 transition-transform flex items-center justify-center gap-2" onclick="startStripeCheckout('monthly')">
          Actualizar a Premium
          <span class="material-symbols-outlined text-[20px]">auto_awesome</span>
        </button>
      </div>
      <div class="absolute top-0 right-0 w-48 h-48 bg-secondary opacity-20 rounded-full -mr-24 -mt-24 pointer-events-none"></div>
      <div class="absolute bottom-0 left-0 w-32 h-32 bg-secondary opacity-10 rounded-full -ml-16 -mb-16 pointer-events-none"></div>
    </div>`;
    return;
  }
  savedList.innerHTML = `<div class="loading">Cargando…</div>`;
  try {
    await waitForSupabase();
    const ids = [...state.savedIds];
    if (ids.length === 0) {
      savedList.innerHTML = `<div class="empty-state"><h2 class="font-display-lg text-xl text-primary-container">Aún no guardaste nada</h2><p class="font-ui-label text-sm text-on-surface-variant mt-2">Toca el marcador en una noticia en Hoy.</p></div>`;
      return;
    }
    const { data: rows, error } = await supabaseClient.from('cards').select('*').in('id', ids).eq('status', 'published');
    if (error) throw error;
    const byId = new Map((rows || []).map((c) => [c.id, c]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    state._savedCardCache = Object.fromEntries(ordered.map((c) => [c.id, c]));
    savedList.innerHTML =
      ordered.length === 0
        ? `<div class="empty-state"><h2>No hay guardados visibles</h2></div>`
        : ordered
            .map((c) => {
              const pill = categoryPillClass(c.category);
              return `<article class="bg-surface-container-lowest p-[20px] rounded-xl shadow-[0_4px_20px_rgba(15,45,46,0.05)] border border-outline-variant/10">
  <div class="flex justify-between items-start mb-base-unit gap-2">
    <span class="font-ui-label text-caption ${pill} px-2 py-0.5 rounded-full uppercase tracking-wider">${escapeHtml(c.category)}</span>
  </div>
  <h3 class="font-article-body text-headline-md text-on-surface mb-stack-sm leading-tight">${escapeHtml(c.headline)}</h3>
  <p class="font-ui-label text-ui-label text-on-surface-variant mb-stack-md line-clamp-2">${escapeHtml(c.deck)}</p>
  ${
    c.meaning
      ? `<div class="bg-[#F1F5F5] p-stack-md rounded-lg border-l-4 border-primary-container mb-stack-md">
    <p class="font-ui-label text-caption font-bold text-primary-container mb-1 uppercase tracking-tighter">Impacto para ti</p>
    <p class="font-ui-label text-ui-label text-on-primary-container">${escapeHtml(c.meaning)}</p>
  </div>`
      : ''
  }
  <div class="mt-stack-md flex justify-end">
    <button type="button" class="saved inline-flex text-primary-container" onclick="toggleSave('${c.id}', this)" aria-label="Quitar guardado">
      <span class="material-symbols-outlined text-[28px]" style="font-variation-settings: 'FILL' 1;">bookmark</span>
    </button>
  </div>
</article>`;
            })
            .join('');
  } catch (err) {
    console.error('renderSaved:', err);
    savedList.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function shareCard(id) {
  let card = state.feed.cards.find(c => c.id === id);
  if (!card && state._savedCardCache) card = state._savedCardCache[id];
  if (!card) return;
  const text = `${card.headline}\n\n${card.deck}\n\nLeído en lente`;
  const url = `${location.origin}/?card=${id}`;
  if (navigator.share) {
    try { await navigator.share({ title: card.headline, text, url }); } catch { }
  } else {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Enlace copiado');
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data === 'RELOAD') window.location.reload();
  });
}

function openLoginModal() {
  $('login-modal')?.classList.add('open');
  showTab('login');
}

function openProfile() {
  if (state.session) {
    switchScreen('profile');
    renderProfilePage();
  } else {
    openLoginModal();
  }
}

async function startStripeCheckout(billing) {
  try {
    await waitForSupabase();
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) {
      toast('Inicia sesión para suscribirte');
      openLoginModal();
      return;
    }
    toast('Te llevamos a Stripe para pagar de forma segura…');
    const res = await fetch('/api/stripe/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mode: 'checkout', billing }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || 'No se pudo iniciar el pago');
      return;
    }
    if (data.url) window.location.href = data.url;
  } catch (e) {
    console.error(e);
    toast('Error de conexión');
  }
}

async function openStripePortal() {
  try {
    await waitForSupabase();
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) return;
    toast('Abriendo el portal de facturación…');
    const res = await fetch('/api/stripe/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mode: 'portal' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || 'No disponible');
      return;
    }
    if (data.url) window.location.href = data.url;
  } catch (e) {
    console.error(e);
    toast('Error');
  }
}

async function handleCheckoutReturn() {
  const p = new URLSearchParams(window.location.search);
  const c = p.get('checkout');
  if (!c) return;
  if (c === 'success') {
    toast('Pago recibido. Premium puede tardar unos segundos en activarse.');
  } else if (c === 'cancel') {
    toast('Pago cancelado');
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  const qs = url.searchParams.toString();
  window.history.replaceState({}, '', url.pathname + (qs ? `?${qs}` : ''));
  if (state.session?.user?.id) {
    await loadProfile(state.session.user.id);
    updateProfileBtn();
    renderFeed();
    renderTopicChips();
    if (state.currentScreen === 'profile') renderProfilePage();
    if ($('profile-modal')?.classList.contains('open')) renderProfileModal();
  }
}

function profileSettingsListHtml(suffix) {
  const idRem = `reminder-toggle${suffix}`;
  const idOff = `offline-toggle${suffix}`;
  return `
<section class="space-y-stack-sm mb-6">
  <p class="font-ui-label text-[12px] uppercase tracking-widest text-outline px-1">Ajustes</p>
  <div class="bg-white rounded-xl shadow-[0_4px_20px_rgba(15,45,46,0.05)] overflow-hidden border border-outline-variant/10">
    <div class="flex justify-between items-center p-4 border-b border-surface-container">
      <div>
        <div class="font-ui-label text-sm font-semibold text-on-surface">Recordatorio diario</div>
        <div class="font-ui-label text-xs text-on-surface-variant">Notificación a las 7:30</div>
      </div>
      <input type="checkbox" id="${idRem}" class="h-5 w-5 accent-[#0f2d2e] cursor-pointer" ${state.profile?.daily_reminder_enabled ? 'checked' : ''} onchange="toggleDailyReminder()" />
    </div>
    <div class="flex justify-between items-center p-4 border-b border-surface-container opacity-60">
      <div>
        <div class="font-ui-label text-sm font-semibold text-on-surface">Tema claro</div>
        <div class="font-ui-label text-xs text-on-surface-variant">Interfaz editorial Serene Capital</div>
      </div>
      <input type="checkbox" checked disabled class="h-5 w-5 cursor-not-allowed" />
    </div>
    <div class="flex justify-between items-center p-4 border-b border-surface-container">
      <div>
        <div class="font-ui-label text-sm font-semibold text-on-surface">Guardar offline</div>
        <div class="font-ui-label text-xs text-on-surface-variant">Lee sin conexión</div>
      </div>
      <input type="checkbox" id="${idOff}" class="h-5 w-5 accent-[#0f2d2e] cursor-pointer" ${localStorage.getItem('lente.offline-mode') === '1' ? 'checked' : ''} onchange="toggleOfflineMode()" />
    </div>
    <div class="flex justify-between items-center p-4">
      <div>
        <div class="font-ui-label text-sm font-semibold text-on-surface">Instalar app</div>
        <div class="font-ui-label text-xs text-on-surface-variant">PWA en tu dispositivo</div>
      </div>
      <button type="button" class="rounded-lg bg-secondary px-3 py-2 font-ui-label text-xs font-bold text-white hover:opacity-90" onclick="installPWAFromModal()">${getInstallButtonLabel()}</button>
    </div>
  </div>
</section>
<button type="button" class="w-full flex items-center justify-center gap-2 py-4 text-error font-bold rounded-xl border border-error-container hover:bg-error-container/10 transition-colors active:scale-[0.98] mb-4" onclick="signOut()">
  <span class="material-symbols-outlined">logout</span>
  Cerrar sesión
</button>
<p class="text-center text-[10px] text-outline font-ui-label pb-4">lente · MVP</p>`;
}

function renderProfilePage() {
  const container = $('profile-screen-body');
  if (!container) return;
  if (!state.session?.user) {
    container.innerHTML = `<div class="text-center py-16 px-4">
      <p class="font-ui-label text-on-surface-variant mb-6 max-w-xs mx-auto">Inicia sesión para ver tu plan, facturación y ajustes.</p>
      <button type="button" class="w-full max-w-sm mx-auto rounded-xl bg-primary-container py-3 font-semibold text-white shadow-md active:scale-[0.98] transition-transform" onclick="openLoginModal()">Entrar o registrarse</button>
    </div>`;
    return;
  }
  const user = state.session.user;
  const rawEmail = user.email || '';
  const email = escapeHtml(rawEmail);
  const shortName = escapeHtml(rawEmail.split('@')[0] || '?');
  const initial = escapeHtml((rawEmail[0] || '?').toUpperCase());
  const isPrem = isPremium();

  const badge = isPrem
    ? `<span class="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container font-ui-label text-[12px] uppercase tracking-wider font-bold">Premium</span>`
    : `<span class="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-ui-label text-[12px] uppercase tracking-wider font-bold">Plan gratuito</span>`;

  const premiumCard = !isPrem
    ? `<section class="premium-card-gradient rounded-xl p-5 text-white shadow-xl mb-stack-lg">
  <div class="flex justify-between items-start mb-4">
    <h3 class="font-headline-md text-headline-md leading-tight text-secondary-fixed">Hazte Premium</h3>
    <span class="material-symbols-outlined text-secondary-fixed" style="font-variation-settings: 'FILL' 1;">auto_awesome</span>
  </div>
  <ul class="space-y-3 mb-6">
    <li class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary-fixed text-[20px]" style="font-variation-settings: 'FILL' 1;">check_circle</span><span class="font-ui-label text-sm">Histórico de ediciones</span></li>
    <li class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary-fixed text-[20px]" style="font-variation-settings: 'FILL' 1;">check_circle</span><span class="font-ui-label text-sm">Guardados ilimitados</span></li>
    <li class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary-fixed text-[20px]" style="font-variation-settings: 'FILL' 1;">check_circle</span><span class="font-ui-label text-sm">Todas las noticias del día</span></li>
  </ul>
  <div class="flex flex-col gap-2">
    <button type="button" class="w-full bg-secondary-fixed text-primary-container py-3 rounded-lg font-bold hover:opacity-90 active:scale-[0.98] transition-transform" onclick="startStripeCheckout('monthly')">5 € / mes</button>
    <button type="button" class="w-full border border-white/40 text-white py-3 rounded-lg font-bold hover:bg-white/10" onclick="startStripeCheckout('yearly')">20 € / año</button>
  </div>
</section>`
    : `<section class="mb-stack-lg rounded-xl border border-outline-variant/30 bg-white p-4 shadow-sm">
  <button type="button" class="w-full rounded-lg border border-secondary py-3 font-semibold text-secondary hover:bg-surface-container transition-colors" onclick="openStripePortal()">Gestionar suscripción y facturas</button>
</section>`;

  const billingRow = `<a class="flex items-center justify-between p-4 hover:bg-surface-container-low transition-colors border-b border-surface-container" href="#" onclick="event.preventDefault();openStripePortal();">
  <div class="flex items-center gap-4">
    <div class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary-container">
      <span class="material-symbols-outlined">payments</span>
    </div>
    <span class="font-ui-label text-on-surface font-semibold">Facturación</span>
  </div>
  <div class="flex items-center gap-2">
    <span class="font-caption text-outline text-xs">Stripe</span>
    <span class="material-symbols-outlined text-outline text-sm">chevron_right</span>
  </div>
</a>`;

  container.innerHTML = `
<section class="flex flex-col items-center text-center space-y-2 mb-stack-lg">
  <div class="w-24 h-24 rounded-full bg-surface-container-high flex items-center justify-center text-3xl font-semibold text-primary-container shadow-lg border-4 border-white">${initial}</div>
  <h2 class="font-display-lg text-display-lg text-primary-container">${shortName}</h2>
  <p class="font-ui-label text-on-surface-variant">${email}</p>
  ${badge}
</section>
${premiumCard}
<section class="space-y-stack-sm mb-6">
  <p class="font-ui-label text-[12px] uppercase tracking-widest text-outline px-1">Configuración</p>
  <div class="bg-white rounded-xl shadow-[0_4px_20px_rgba(15,45,46,0.05)] overflow-hidden border border-outline-variant/10">
    ${billingRow}
    <div class="flex items-center justify-between p-4 border-b border-surface-container opacity-80">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary-container">
          <span class="material-symbols-outlined">notifications</span>
        </div>
        <span class="font-ui-label text-on-surface font-semibold">Notificaciones</span>
      </div>
      <span class="material-symbols-outlined text-outline">chevron_right</span>
    </div>
    <div class="flex items-center justify-between p-4">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary-container">
          <span class="material-symbols-outlined">help_outline</span>
        </div>
        <span class="font-ui-label text-on-surface font-semibold">Ayuda</span>
      </div>
      <span class="material-symbols-outlined text-outline">chevron_right</span>
    </div>
  </div>
</section>
${profileSettingsListHtml('')}
`;
}

function renderProfileModal() {
  const modal = $('profile-modal-body');
  if (!modal) return;
  const user = state.session?.user;
  if (!user) return;
  const rawEmail = user.email || '';
  const emailSafe = escapeHtml(rawEmail);
  const initial = escapeHtml((rawEmail[0] || '?').toUpperCase());
  const isPrem = isPremium();
  const planBadge = isPrem
    ? `<span class="inline-flex items-center px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold uppercase tracking-wider">Premium</span>`
    : `<span class="inline-flex items-center px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-xs font-bold uppercase tracking-wider">Free</span>`;

  modal.innerHTML = `
<div class="text-center pb-4 border-b border-outline-variant/40 mb-4">
  <div class="w-14 h-14 rounded-full bg-surface-container-high mx-auto mb-3 flex items-center justify-center text-xl font-semibold text-primary-container">${initial}</div>
  <div class="font-ui-label text-sm font-semibold text-on-surface">${emailSafe}</div>
  <div class="mt-2 flex justify-center">${planBadge}</div>
  ${!isPrem ? `<p class="text-xs text-on-surface-variant mt-3 leading-relaxed max-w-xs mx-auto">Plan gratuito: 5 noticias del día. <strong>Premium</strong>: edición completa, histórico y guardar.</p>
  <div class="flex gap-2 mt-4 flex-wrap justify-center">
    <button type="button" class="flex-1 min-w-[120px] rounded-lg bg-secondary py-2.5 text-sm font-bold text-white" onclick="startStripeCheckout('monthly')">5 € / mes</button>
    <button type="button" class="flex-1 min-w-[120px] rounded-lg border border-outline-variant py-2.5 text-sm font-bold text-on-surface" onclick="startStripeCheckout('yearly')">20 € / año</button>
  </div>` : `<button type="button" class="mt-4 w-full rounded-lg border border-secondary py-2.5 text-sm font-semibold text-secondary" onclick="openStripePortal()">Gestionar suscripción</button>`}
</div>
${profileSettingsListHtml('-modal')}
`;
}

async function signOut() {
  try {
    const modal = $('profile-modal');
    if (modal) modal.classList.remove('open');
    const saved = localStorage.getItem('lente.saved');
    localStorage.clear();
    if (saved) localStorage.setItem('lente.saved', saved);
    state.session = null;
    state.profile = null;
    state.savedIds.clear();
    updateProfileBtn();
    toast('Sesión cerrada ✓');
    supabaseClient.auth.signOut().catch(err => console.error('Error en signOut bg:', err));
    setTimeout(() => { window.location.href = location.origin; }, 600);
  } catch (err) {
    console.error('Error logout:', err);
    toast('Error');
  }
}

async function toggleDailyReminder() {
  try {
    await waitForSupabase();
    if (!state.session) { openLoginModal(); return; }
    const user = state.session?.user;
    if (!user) return;
    const isEnabled = state.profile?.daily_reminder_enabled || false;
    const { error } = await supabaseClient.from('profiles').update({ daily_reminder_enabled: !isEnabled }).eq('id', user.id);
    if (error) throw error;
    state.profile.daily_reminder_enabled = !isEnabled;
    localStorage.setItem('lente.profile', JSON.stringify(state.profile));
    toast(!isEnabled ? '✓ Recordatorios activados' : '✓ Recordatorios desactivados');
  } catch (err) {
    console.error('Error recordatorio:', err);
    toast('Error');
  }
}

function toggleOfflineMode() {
  const isEnabled = localStorage.getItem('lente.offline-mode') === '1';
  if (!isEnabled) {
    localStorage.setItem('lente.offline-mode', '1');
    toast('Modo offline activado');
  } else {
    localStorage.removeItem('lente.offline-mode');
    toast('Modo offline desactivado');
  }
}

// ----- PWA: instalar (1 clic con beforeinstallprompt) o guías iOS / macOS -----
let installGuideEscHandler = null;

function getInstallButtonLabel() {
  if (isStandalone) return '✓ Instalada';
  if (deferredPrompt) return 'Instalar ahora';
  if (isIOSDevice) return 'Ver pasos';
  if (isMacDesktop && isDesktopSafari()) return 'Añadir al Dock';
  if (isMacDesktop && (isChrome || isEdge)) return 'Cómo instalar';
  return 'Instalar';
}

function syncInstallBannerCopy() {
  const sub = $('install-prompt-sub');
  const btn = $('install-prompt-btn');
  if (!sub || !btn) return;
  btn.disabled = false;
  if (isStandalone) {
    btn.textContent = 'Abriendo como app';
    btn.disabled = true;
    sub.textContent = 'Ya usas lente en modo app (o añadida al inicio / Dock).';
    return;
  }
  if (deferredPrompt) {
    btn.textContent = 'Instalar en 1 clic';
    sub.textContent = 'El navegador puede añadir lente sin salir de la página.';
    return;
  }
  if (isIOSDevice) {
    btn.textContent = 'Ver pasos en iPhone / iPad';
    sub.textContent = 'iOS requiere Compartir → Añadir a inicio (no hay un solo botón del sistema).';
    return;
  }
  if (isMacDesktop && isDesktopSafari()) {
    btn.textContent = 'Cómo añadir al Dock';
    sub.textContent = 'En Safari para Mac: menú Archivo o Compartir → Añadir al Dock.';
    return;
  }
  if (isMacDesktop) {
    btn.textContent = 'Cómo instalar';
    sub.textContent = 'Chrome/Edge en Mac: icono de instalar en la barra de direcciones o menú del navegador.';
    return;
  }
  btn.textContent = 'Instalar';
  sub.textContent = 'Acceso directo como app en inicio, Dock o escritorio.';
}

function dismissInstall() {
  $('install-prompt')?.classList.remove('show');
  try {
    localStorage.setItem('lente.dismiss-install', String(Date.now()));
  } catch (_) { /* empty */ }
}

function maybeShowInstallBanner() {
  if (isStandalone || !deferredPrompt) return;
  try {
    const t = localStorage.getItem('lente.dismiss-install');
    if (t && Date.now() - Number(t) < 4 * 24 * 60 * 60 * 1000) return;
  } catch (_) { /* empty */ }
  syncInstallBannerCopy();
  $('install-prompt')?.classList.add('show');
}

function closeInstallGuideOverlay() {
  if (installGuideEscHandler) {
    document.removeEventListener('keydown', installGuideEscHandler);
    installGuideEscHandler = null;
  }
  $('install-guide-root')?.remove();
}

function copyPageUrlForInstall() {
  navigator.clipboard
    .writeText(location.href)
    .then(() => toast('Enlace copiado al portapapeles'))
    .catch(() => toast('No se pudo copiar'));
}

/**
 * @param {'ios'|'mac-safari'|'mac-chrome'|'android-chrome'|'generic'} kind
 * @param {'iphone'|'ipad'|null} sub
 */
function openInstallGuide(kind, sub) {
  closeInstallGuideOverlay();
  const overlay = document.createElement('div');
  overlay.className = 'install-guide-overlay';
  overlay.id = 'install-guide-root';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeInstallGuideOverlay();
  });

  let lead = '';
  let stepsHtml = '';

  if (kind === 'ios' && sub === 'iphone') {
    lead = 'Apple no ofrece API de “un clic”; en iPhone se usa el menú Compartir de Safari.';
    stepsHtml = `<div class="install-guide-steps"><strong><span class="step-num">1.</span> Compartir</strong>
      Toca <strong>Compartir</strong> (cuadrado con flecha hacia arriba) en la barra inferior de Safari.</div>
      <div class="install-guide-steps"><strong><span class="step-num">2.</span> Añadir a inicio</strong>
      Desplázate y pulsa <strong>Añadir a pantalla de inicio</strong> → Añadir.</div>`;
  } else if (kind === 'ios' && sub === 'ipad') {
    lead = 'En iPad el botón Compartir suele estar arriba a la derecha.';
    stepsHtml = `<div class="install-guide-steps"><strong><span class="step-num">1.</span> Compartir</strong>
      Pulsa el icono <strong>Compartir</strong> (cuadrado con flecha).</div>
      <div class="install-guide-steps"><strong><span class="step-num">2.</span> Añadir a inicio</strong>
      Elige <strong>Añadir a pantalla de inicio</strong> y confirma.</div>`;
  } else if (kind === 'mac-safari') {
    lead = 'Safari en macOS usa “Añadir al Dock”, no el mismo cuadro que Windows.';
    stepsHtml = `<div class="install-guide-steps"><strong><span class="step-num">1.</span> Archivo</strong>
      Barra de menús: <strong>Archivo</strong> → <strong>Añadir al Dock</strong> (Safari 17+).</div>
      <div class="install-guide-steps"><strong><span class="step-num">2.</span> Si no aparece</strong>
      Icono <strong>Compartir</strong> en la barra de Safari → <strong>Añadir al Dock</strong>.</div>`;
  } else if (kind === 'mac-chrome') {
    lead = 'Chrome y Edge en Mac suelen permitir instalación nativa en un clic cuando está disponible.';
    stepsHtml = `<div class="install-guide-steps"><strong><span class="step-num">1.</span> Barra de direcciones</strong>
      Mira el icono de <strong>instalar</strong> a la derecha de la URL (⊕ o monitor con flecha). Pulsa y confirma.</div>
      <div class="install-guide-steps"><strong><span class="step-num">2.</span> Menú</strong>
      Menú <strong>⋮</strong> → <strong>Instalar lente…</strong> o <strong>Crear acceso directo…</strong>.</div>`;
  } else if (kind === 'android-chrome') {
    lead = 'Chrome en Android muestra “Instalar app” o la opción en el menú.';
    stepsHtml = `<div class="install-guide-steps"><strong>Menú ⋮</strong>
      <strong>Añadir a la pantalla de inicio</strong> o <strong>Instalar aplicación</strong> (según versión).</div>`;
  } else {
    lead = 'Busca en el menú del navegador “Instalar”, “Añadir a inicio” o un icono junto a la URL.';
    stepsHtml = `<div class="install-guide-steps"><strong>Consejo</strong>
      Si usas Firefox en Mac, suele ser <strong>Guardar en Dock</strong> o crear acceso desde el menú.</div>`;
  }

  overlay.innerHTML = `
    <div class="install-guide-panel">
      <h2>Instalar lente</h2>
      <p class="lead">${lead}</p>
      ${stepsHtml}
      <p class="install-guide-note">En Windows/Android con Chrome o Edge, suele aparecer aviso de instalación automático.</p>
      <div class="install-guide-actions">
        <button type="button" class="btn-primary">Entendido</button>
        <button type="button" class="btn-ghost">Copiar enlace</button>
      </div>
    </div>`;

  const [btnOk, btnCopy] = overlay.querySelectorAll('button');
  btnOk.addEventListener('click', () => closeInstallGuideOverlay());
  btnCopy.addEventListener('click', () => copyPageUrlForInstall());

  document.body.appendChild(overlay);
  installGuideEscHandler = (ev) => {
    if (ev.key === 'Escape') closeInstallGuideOverlay();
  };
  document.addEventListener('keydown', installGuideEscHandler);
}

async function runInstallFlow() {
  if (isStandalone) {
    toast('lente ya está en modo app');
    return false;
  }
  if (deferredPrompt) {
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      dismissInstall();
      syncInstallBannerCopy();
      if (outcome === 'accepted') toast('¡Listo! Acceso directo creado.');
      return outcome === 'accepted';
    } catch (err) {
      console.error(err);
      toast('No se pudo abrir el instalador del navegador');
      return false;
    }
  }
  if (isIOSDevice) {
    openInstallGuide('ios', isIPadOSDevice ? 'ipad' : 'iphone');
    return false;
  }
  if (isMacDesktop && isDesktopSafari()) {
    openInstallGuide('mac-safari', null);
    return false;
  }
  if (isMacDesktop && (isChrome || isEdge)) {
    openInstallGuide('mac-chrome', null);
    return false;
  }
  if (isAndroid && (isChrome || isEdge)) {
    openInstallGuide('android-chrome', null);
    return false;
  }
  openInstallGuide('generic', null);
  return false;
}

async function installPWAFromModal() {
  await runInstallFlow();
  if (!state.session) return;
  if ($('profile-modal')?.classList.contains('open')) renderProfileModal();
  if (state.currentScreen === 'profile') renderProfilePage();
}

function installPWA() {
  void runInstallFlow();
}

function closeLogin() { $('login-modal')?.classList.remove('open'); }
function closeProfileModal() { $('profile-modal')?.classList.remove('open'); }

let loginMode = 'login';
function showTab(mode) {
  loginMode = mode;
  const isLogin = mode === 'login';
  const tLogin = $('tab-login');
  const tReg = $('tab-register');
  const activeCls = 'cta flex-1 rounded-lg px-3 py-2 text-sm font-semibold';
  const idleCls =
    'cta flex-1 rounded-lg border border-outline-variant bg-transparent px-3 py-2 text-sm font-semibold text-on-surface-variant';
  if (tLogin && tReg) {
    tLogin.className = isLogin ? activeCls : idleCls;
    tReg.className = !isLogin ? activeCls : idleCls;
  }
  if ($('login-submit-btn')) $('login-submit-btn').textContent = isLogin ? 'Entrar' : 'Crear cuenta';
  if ($('login-status')) $('login-status').textContent = '';
}

async function submitLogin() {
  try {
    await waitForSupabase();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email.includes('@')) { $('login-status').textContent = 'Email inválido'; return; }
    if (!password || password.length < 6) { $('login-status').textContent = 'Mínimo 6 caracteres'; return; }
    $('login-status').textContent = loginMode === 'login' ? 'Entrando...' : 'Creando...';
    if (loginMode === 'register') {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: location.origin },
      });
      if (error) {
        $('login-status').textContent = error.message;
      } else if (data?.session) {
        // Supabase con "Confirm email" desactivado: sesión inmediata (sin mail)
        $('login-status').textContent = '✓ Cuenta creada';
        $('login-email').value = '';
        $('login-password').value = '';
        setTimeout(() => {
          closeLogin();
          toast('¡Cuenta creada! ✓');
        }, 400);
      } else if (data?.user) {
        $('login-status').textContent = '✓ Revisa tu email para confirmar';
        $('login-email').value = '';
        $('login-password').value = '';
        setTimeout(() => showTab('login'), 1500);
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) { $('login-status').textContent = error.message; } else if (data?.session) { $('login-status').textContent = '✓ Sesión iniciada'; setTimeout(() => { closeLogin(); toast('¡Bienvenido! ✓'); }, 500); }
    }
  } catch (err) {
    console.error('Error submitLogin:', err);
    $('login-status').textContent = 'Error';
  }
}

function saveProfileToLocalStorage() {
  if (state.profile) localStorage.setItem('lente.profile', JSON.stringify(state.profile));
}

function loadProfileFromLocalStorage() {
  const cached = localStorage.getItem('lente.profile');
  if (cached) {
    try {
      state.profile = JSON.parse(cached);
    } catch (err) {
      console.error('Error restaurando perfil:', err);
    }
  }
}

async function loadProfile(userId) {
  try {
    await waitForSupabase();
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    state.profile = data || { plan: 'free', is_admin: false, daily_reminder_enabled: false };
    if (!error) saveProfileToLocalStorage();
  } catch (err) {
    console.error('Error loadProfile:', err);
    state.profile = { plan: 'free', is_admin: false, daily_reminder_enabled: false };
  }
}

function updateProfileBtn() {
  const btn = $('profile-btn');
  if (!btn) return;
  const user = state.session?.user;
  if (user?.email) {
    btn.textContent = user.email[0].toUpperCase();
    btn.classList.toggle('is-premium', isPremium());
  } else {
    btn.textContent = '?';
    btn.classList.remove('is-premium');
  }
}

async function setupAuthListener() {
  if (authListenerInitialized) return;
  authListenerInitialized = true;
  try {
    await waitForSupabase();
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      state.session = session;
      if (event === 'SIGNED_IN' && session) {
        loadProfileFromLocalStorage();
        await loadProfile(session.user.id);
        await loadSavedCards();
        await loadFeed();
        updateProfileBtn();
        renderFeed();
      } else if (event === 'SIGNED_OUT') {
        state.profile = null;
        state.savedIds.clear();
        state.activeTopicFilter = null;
        localStorage.removeItem('lente.profile');
        updateProfileBtn();
        await loadFeed();
        renderFeed();
      }
    });
  } catch (err) {
    console.error('Error setupAuthListener:', err);
  }
}

async function initAuth() {
  try {
    await waitForSupabase();
    const { data: { session } } = await supabaseClient.auth.getSession();
    state.session = session;
    if (session) {
      loadProfileFromLocalStorage();
      await Promise.all([
        loadProfile(session.user.id),
        loadSavedCards(),
      ]);
    }
  } catch (err) {
    console.error('Error initAuth:', err);
  }
}

async function startApp() {
  try {
    await loadFeed();
  } catch (err) {
    console.error('Error startApp:', err);
  }
}

async function init() {
  console.log('🚀 Inicializando app v26...');
  await initAuth();
  updateProfileBtn();
  await startApp();
  await setupAuthListener();
  syncInstallBannerCopy();
  await handleCheckoutReturn();
  appReady = true;
  console.log('✅ App v26 lista');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/** Chrome, Edge, Brave, etc. en Windows, macOS y Android — instalación en ~1 clic */
if (!isStandalone) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    maybeShowInstallBanner();
    syncInstallBannerCopy();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    dismissInstall();
    syncInstallBannerCopy();
    toast('Acceso directo instalado ✓');
  });
}

window.openMarketDetail = openMarketDetail;
window.installPWA = installPWA;
window.dismissInstall = dismissInstall;
window.closeInstallGuideOverlay = closeInstallGuideOverlay;
window.copyPageUrlForInstall = copyPageUrlForInstall;