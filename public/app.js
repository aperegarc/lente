// ============================================================
// /public/app.js — Mercados: Yahoo Finance · gráfico Apache ECharts (no TradingView)
// Ruta /chart/:symbol (ej. /chart/BINANCE%3ABTCUSDT)
// ============================================================

const { SUPABASE_URL, SUPABASE_ANON_KEY, API } = window.LENTE_CONFIG;

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/'/g, '&#39;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Fila transparencia IA + enlace al original (columnas legal en Supabase). */
function cardAiSourceRowHtml(c) {
  const showAi = c.is_ai_generated !== false;
  const url = String(c.primary_source_url || '').trim();
  const tag = String(c.legal_tag || '').trim();
  const badgeTitle = escapeAttr(tag || 'Contenido elaborado con asistencia de IA');
  const parts = [];
  if (showAi) {
    parts.push(
      `<span class="card-ai-badge" title="${badgeTitle}">Resumen con asistencia de IA</span>`,
    );
  }
  if (url && /^https?:\/\//i.test(url)) {
    parts.push(
      `<a class="card-source-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">Leer original</a>`,
    );
  } else if (c.sources_text) {
    parts.push(`<span class="card-source-credit">Fuente: ${escapeHtml(String(c.sources_text))}</span>`);
  }
  if (parts.length === 0) return '';
  return `<div class="card-ai-row">${parts.join('')}</div>`;
}

/** Rango y resolución Yahoo (v8) por botón de periodo */
const CHART_TF = {
  '1D': { rangeSec: 86400, resolution: '15' },
  '1W': { rangeSec: 86400 * 7, resolution: '60' },
  '1M': { rangeSec: 86400 * 30, resolution: 'D' },
};

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
  const url = window.LENTE_CONFIG?.SUPABASE_URL;
  const anon = window.LENTE_CONFIG?.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    setTimeout(initSupabase, 100);
    return;
  }
  const sdk = window.supabase;
  if (sdk?.createClient && !supabaseClient) {
    try {
      supabaseClient = sdk.createClient(url, anon);
      supabaseReady = true;
    } catch (err) {
      console.error('[lente] createClient falló', err);
      setTimeout(initSupabase, 100);
    }
  } else if (!sdk?.createClient) {
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
  if (!supabaseReady) {
    const missingSdk = !window.supabase?.createClient;
    const missingCfg = !window.LENTE_CONFIG?.SUPABASE_URL || !window.LENTE_CONFIG?.SUPABASE_ANON_KEY;
    throw new Error(
      missingCfg
        ? 'Config vacía: falta SUPABASE_URL/ANON_KEY en Vercel (/api/public-config)'
        : missingSdk
          ? 'SDK Supabase no cargó (/vendor/supabase.js)'
          : 'Supabase no se pudo inicializar',
    );
  }
  return supabaseClient;
}

const CATEGORY_COLORS = {
  'Política monetaria': '', 'Materias primas': 'green', 'Macro Europa': 'blue',
  'Macro': 'blue', 'Tech': 'red', 'Bolsa': 'red', 'Cripto': 'purple',
  'Energía': 'green', 'España': '', 'Geopolítica': 'blue', 'Inmobiliario': '', 'Laboral': '',
};

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
  chartTimeframe: '1D',
  _preChartScreen: 'markets',
  _chartSymbol: null,
  _chartName: null,
  _echartsInstance: null,
  _lwResize: null,
  /** true si el usuario llegó al gráfico desde la lista (hay history para back) */
  _chartHistoryPushed: false,
};

function isPremium() {
  if (!state.session) return false;
  if (state.feedMeta?.plan_tier === 'premium') return true;
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
  if (location.pathname.startsWith('/chart/')) {
    history.replaceState(null, '', '/');
  }
  hideChartScreen();
  state.currentScreen = name;
  $$('.screen').forEach(s => s.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  $(`screen-${name}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-screen="${name}"]`)?.classList.add('active');
  if (name === 'markets' && state.markets.flat.length === 0) loadMarkets();
  if (name === 'topics' && !state._topicsRendered) renderTopics();
  if (name === 'saved') void renderSaved();
}

$$('.nav-item').forEach(n => {
  n.addEventListener('click', () => switchScreen(n.dataset.screen));
});

function feedSlide(innerHtml) {
  return `<div class="feed-slide">${innerHtml}</div>`;
}

/** Vuelve al primer slide (resumen del día). Evita quedar al final tras restaurar scroll del navegador/PWA. */
function scrollFeedToStart() {
  const el = $('feed-scroll');
  if (!el) return;
  const reset = () => {
    el.scrollTop = 0;
  };
  reset();
  requestAnimationFrame(() => {
    reset();
    requestAnimationFrame(reset);
  });
}

async function loadFeed() {
  const feedList = $('feed-list');
  if (!feedList) return;
  feedList.innerHTML = feedSlide('<div class="loading">Cargando...</div>');
  scrollFeedToStart();
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
  } catch (err) {
    console.error('❌ Error loadFeed:', err.message);
    if (feedList) feedList.innerHTML = feedSlide(`<div class="empty-state"><h2>Error</h2><p>${escapeHtml(err.message)}</p></div>`);
  }
}

function toggleReadMore(id) {
  const body = $(`body-${id}`);
  const btn = $(`readmore-${id}`);
  const collapsed = body.classList.toggle('collapsed');
  btn.textContent = collapsed ? 'Leer más ↓' : 'Leer menos ↑';
}

function renderFeed(filterCategory = null) {
  const feedList = $('feed-list');
  if (!feedList) return;
  const cards = filterCategory ? state.feed.cards.filter(c => c.category === filterCategory) : state.feed.cards;
  const dateLabel = $('date-label');
  const editionLabel = $('edition-label');
  if (dateLabel) dateLabel.textContent = fmtDate(state.feed.date);
  if (editionLabel) editionLabel.textContent = filterCategory ? `Filtro · ${filterCategory}` : 'Edición del día';
  if (!cards || cards.length === 0) {
    feedList.innerHTML = feedSlide(
      `<div class="empty-state"><h2>${escapeHtml(filterCategory ? `Sin noticias de ${filterCategory}` : 'Sin contenido todavía')}</h2></div>`,
    );
    scrollFeedToStart();
    return;
  }
  const totalReadTime = Math.round(cards.reduce((a, c) => a + (c.read_time_seconds || 40), 0) / 60);
  const locked = !filterCategory && !isPremium() && (state.feedMeta?.locked_count > 0);
  let html = feedSlide(
    `<section class="card card-intro"><div class="intro-label">${escapeHtml(filterCategory ? `Filtrado por ${filterCategory}` : 'Tu resumen del día')}</div><p class="intro-ai-disclosure">Contenido del día elaborado o resumido con <strong>asistencia de IA</strong>. Finalidad informativa; no es asesoramiento ni recomendación de inversión.</p><h1 class="intro-title">${filterCategory ? `<em>${escapeHtml(filterCategory)}</em>` : 'Buenos días.'}</h1><p class="intro-summary">${cards.length} ${cards.length === 1 ? 'noticia' : 'noticias'}, ${totalReadTime} min de lectura.</p><div class="intro-stats"><div class="intro-stat"><div class="num">${cards.length}</div><div class="txt">noticias</div></div><div class="intro-stat"><div class="num">${totalReadTime}<span style="font-size:13px;color:var(--ink-dim);"> min</span></div><div class="txt">lectura</div></div></div></section>`,
  );
  if (locked) {
    html += feedSlide(
      `<section class="card card-upsell"><p class="upsell-text"><strong>${state.feedMeta.locked_count} noticia${state.feedMeta.locked_count === 1 ? '' : 's'} más</strong> en esta edición con <strong>Premium</strong> — 5 €/mes o 20 €/año (histórico + guardar).</p></section>`,
    );
  }
  for (const c of cards) {
    const catClass = CATEGORY_COLORS[c.category] || '';
    const saved = state.savedIds.has(c.id);
    const saveLocked = !isPremium();
    const saveClass = `${saved ? 'saved' : ''} ${saveLocked ? 'action-btn-save-lock' : ''}`;
    const aiRow = cardAiSourceRowHtml(c);
    html += feedSlide(
      `<section class="card" data-id="${escapeAttr(c.id)}"><div class="card-meta"><span class="category ${escapeAttr(catClass)}">${escapeHtml(c.category)}</span><span class="read-time">· ${Number(c.read_time_seconds) || 40} s</span></div>${aiRow}<h2 class="headline">${escapeHtml(c.headline)}</h2><p class="deck">${escapeHtml(c.deck)}</p><div class="section-label">Qué ha pasado</div><p class="body-text collapsed" id="body-${escapeAttr(c.id)}">${escapeHtml(c.body)}</p><button class="read-more-btn" id="readmore-${escapeAttr(c.id)}" onclick="toggleReadMore('${escapeAttr(c.id)}')">Leer más ↓</button><div class="meaning-box"><div class="section-label">¿Qué significa para ti?</div><p class="meaning-text">${escapeHtml(c.meaning)}</p></div><div class="card-footer"><div class="actions"><button type="button" class="action-btn ${saveClass}" title="${saveLocked ? 'Premium — guardar noticias' : 'Guardar'}" onclick="toggleSave('${escapeAttr(c.id)}', this)"><svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg></button><button type="button" class="action-btn" onclick="shareCard('${escapeAttr(c.id)}')"><svg viewBox="0 0 24 24"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/></svg></button></div></div></section>`,
    );
  }
  feedList.innerHTML = html;
  scrollFeedToStart();
}

function renderTicker() {
  const tickerEl = $('ticker');
  if (!tickerEl) return;
  
  // Mostrar ticker simple desde mercados cargados
  const popular = ['^IBEX', 'AAPL', 'MSFT', 'BTC-USD', 'ETH-USD', 'TSLA'];
  const items = popular.map(sym => state.markets.flat.find(m => m.symbol === sym)).filter(Boolean);
  
  if (items.length === 0) {
    tickerEl.innerHTML = '';
    return;
  }
  
  tickerEl.innerHTML = items.map(m => {
    const cls = m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
    const prefix = m.symbol === 'GC=F' || m.symbol === 'BZ=F' ? '$' : '';
    const priceDigits = m.price > 1000 ? 0 : 2;
    return `<div class="ticker-item"><span class="ticker-name">${m.name}</span><span class="ticker-price">${prefix}${fmtNum(m.price, priceDigits)}</span><span class="ticker-change ${cls}">${fmtPct(m.change_pct)}</span></div>`;
  }).join('');
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
  } catch (err) {
    console.error('Error loadMarkets:', err);
  }
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
  tabs.innerHTML =
    `<div class="market-tab ${state.currentMarketTab === 'all' ? 'active' : ''}" onclick="setMarketTab('all')">Todo</div>` +
    cats.map(
      (cat) =>
        `<div class="market-tab ${state.currentMarketTab === cat ? 'active' : ''}" onclick="setMarketTab('${cat}')">${label(cat)}</div>`,
    ).join('');

  const groups =
    state.currentMarketTab === 'all'
      ? state.markets.grouped
      : { [state.currentMarketTab]: state.markets.grouped[state.currentMarketTab] || [] };

  const sectionOrder = Object.keys(groups).sort(
    (a, b) => marketCategorySortKey(a) - marketCategorySortKey(b),
  );

  let html = '';
  for (const cat of sectionOrder) {
    const items = groups[cat];
    if (!items?.length) continue;
    html += `<div class="market-section"><h3 class="market-section-title">${label(cat)}</h3>`;
    for (const m of items) {
      const cls =
        m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
      const prefix = m.symbol?.includes('=F') ? '$' : '';
      let priceDigits = 2;
      if (m.price > 1000) priceDigits = 0;
      else if (m.symbol?.includes('EUR') || m.category === 'divisas') priceDigits = 4;
      else if (m.category === 'cripto' && m.price != null && m.price < 1) priceDigits = 4;
      const tvSymbol = m.tv || TRADINGVIEW_MAP[m.symbol] || m.symbol;
      const dsym = escapeAttr(tvSymbol);
      const dname = escapeAttr(m.name);
      html += `
        <div class="market-item" role="button" tabindex="0" data-chart="${dsym}" data-name="${dname}">
          <div class="market-item-left">
            <div class="market-item-name">${escapeHtml(m.name)}</div>
            <div class="market-item-desc">${escapeHtml(m.description || '')}</div>
          </div>
          <div class="market-item-right">
            <div class="market-price">${m.price != null && !Number.isNaN(+m.price) ? `${prefix}${fmtNum(m.price, priceDigits)}` : '–'}</div>
            <div class="market-change ${cls}">${m.change_pct != null && !Number.isNaN(+m.change_pct) ? fmtPct(m.change_pct) : '–'}</div>
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }

  const disc = state.marketsDisclaimer
    ? `<p class="markets-disclaimer">${state.marketsDisclaimer}</p>`
    : '';
  marketsList.innerHTML = html + disc;
  marketsList.querySelectorAll('.market-item').forEach((el) => {
    el.addEventListener('click', () => {
      const sym = el.getAttribute('data-chart');
      const name = el.getAttribute('data-name');
      if (sym) navigateToChart(sym, name || sym);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });
}

function setMarketTab(tab) {
  state.currentMarketTab = tab;
  renderMarkets();
}

function hideChartScreen() {
  const sc = $('screen-chart');
  if (!sc?.classList.contains('active')) return;
  sc.classList.remove('active');
  sc.setAttribute('aria-hidden', 'true');
  $('app')?.classList.remove('app--chart');
  destroyChartWidget();
}

function destroyChartWidget() {
  if (state._lwResize) {
    window.removeEventListener('resize', state._lwResize);
    state._lwResize = null;
  }
  if (state._echartsInstance) {
    try {
      state._echartsInstance.dispose();
    } catch (_) { /* noop */ }
    state._echartsInstance = null;
  }
}

function navigateToChart(chartSymbol, displayName) {
  state._preChartScreen = state.currentScreen;
  state._chartHistoryPushed = true;
  history.pushState(
    { chartName: displayName, chartSymbol },
    '',
    `/chart/${encodeURIComponent(chartSymbol)}`,
  );
  applyChartRoute(chartSymbol, displayName);
}

function applyChartRoute(chartSymbol, displayName) {
  destroyChartWidget();
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $$('.nav-item').forEach((n) => n.classList.remove('active'));
  const sc = $('screen-chart');
  sc.classList.add('active');
  sc.setAttribute('aria-hidden', 'false');
  $('app')?.classList.add('app--chart');

  $('chart-page-name').textContent = displayName || chartSymbol;
  $('chart-page-symbol').textContent = chartSymbol;
  $('chart-page-error').hidden = true;
  $('chart-page-loading').style.display = '';
  $('chart-page-container').innerHTML = '';

  state._chartSymbol = chartSymbol;
  state._chartName = displayName;
  state.currentScreen = 'chart';
  state.chartTimeframe = '1D';
  document.querySelectorAll('.chart-tf-btn').forEach((b) => {
    const on = b.dataset.tf === '1D';
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  void refreshChartData();
}

function chartGoBack() {
  if (state._chartHistoryPushed) {
    history.back();
    return;
  }
  history.replaceState(null, '', '/');
  hideChartScreen();
  switchScreen(state._preChartScreen || 'markets');
}

function loadEchartsScript() {
  if (window.echarts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar ECharts'));
    document.head.appendChild(script);
  });
}

async function refreshChartData() {
  const sym = state._chartSymbol;
  if (!sym || !API.candles) return;
  const tf = state.chartTimeframe || '1D';
  const cfg = CHART_TF[tf];
  if (!cfg) return;

  const to = Math.floor(Date.now() / 1000);
  const from = to - cfg.rangeSec;
  const loading = $('chart-page-loading');
  const errEl = $('chart-page-error');
  const container = $('chart-page-container');

  errEl.hidden = true;
  loading.style.display = '';
  container.innerHTML = '';
  destroyChartWidget();

  try {
    const url = `${API.candles}?symbol=${encodeURIComponent(sym)}&resolution=${encodeURIComponent(cfg.resolution)}&from=${from}&to=${to}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const parts = [data.error, data.detail, data.hint].filter(Boolean);
      throw new Error(parts.length ? parts.join(' · ') : `Error ${res.status}`);
    }
    loading.style.display = 'none';
    if (!data.ok || data.status !== 'ok' || !data.candles?.length) {
      errEl.textContent =
        data.status === 'no_data'
          ? (data.hint || 'No hay velas para este activo en este periodo (Yahoo Finance).')
          : 'No se pudieron obtener las velas.';
      errEl.hidden = false;
      return;
    }
    await renderMarketChart(data.candles);
  } catch (e) {
    loading.style.display = 'none';
    errEl.textContent = e.message || 'Error de red';
    errEl.hidden = false;
  }
}

async function renderMarketChart(candles) {
  await loadEchartsScript();
  const container = $('chart-page-container');
  container.innerHTML = '';
  const h = Math.max(280, Math.min(480, Math.floor(window.innerHeight * 0.48)));
  const el = document.createElement('div');
  el.className = 'chart-echarts-root';
  el.style.width = '100%';
  el.style.height = `${h}px`;
  container.appendChild(el);

  const dates = candles.map((c) => {
    const d = new Date(c.time * 1000);
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  });
  const n = candles.length;
  const labelEvery = Math.max(1, Math.floor(n / 8));

  const chart = window.echarts.init(el, null, { renderer: 'canvas' });
  chart.setOption({
    animation: false,
    backgroundColor: '#F8F9FA',
    textStyle: { fontFamily: 'Manrope, system-ui, sans-serif', color: '#414848' },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
    grid: [
      { left: '10%', right: '8%', top: '14%', height: '50%' },
      { left: '10%', right: '8%', top: '72%', height: '18%' },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: true,
        axisLine: { lineStyle: { color: '#c1c8c7' } },
        axisLabel: {
          color: '#717878',
          interval: (i) => i % labelEvery === 0 || i === n - 1,
          rotate: 28,
          fontSize: 10,
        },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: true,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
      },
    ],
    yAxis: [
      {
        scale: true,
        splitLine: { lineStyle: { color: 'rgba(193, 200, 199, 0.45)' } },
        axisLabel: { color: '#414848', fontSize: 11 },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        type: 'candlestick',
        data: candles.map((c) => [c.open, c.close, c.low, c.high]),
        itemStyle: {
          color: '#2b6769',
          color0: '#ba1a1a',
          borderColor: '#2b6769',
          borderColor0: '#ba1a1a',
        },
      },
      {
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: candles.map((c) => ({
          value: c.volume != null && c.volume > 0 ? c.volume : 0,
          itemStyle: {
            color: c.close >= c.open ? 'rgba(43, 103, 105, 0.35)' : 'rgba(186, 26, 26, 0.35)',
          },
        })),
      },
    ],
  });

  state._echartsInstance = chart;
  state._lwResize = () => {
    chart.resize();
  };
  window.addEventListener('resize', state._lwResize);
}

function bindChartPage() {
  $('chart-page-back')?.addEventListener('click', chartGoBack);
  $('chart-timeframes')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chart-tf-btn');
    if (!btn) return;
    const tf = btn.dataset.tf;
    if (!tf || tf === state.chartTimeframe) return;
    state.chartTimeframe = tf;
    document.querySelectorAll('.chart-tf-btn').forEach((b) => {
      const on = b.dataset.tf === tf;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    void refreshChartData();
  });
}

function initChartRoute() {
  const path = location.pathname;
  if (path.startsWith('/chart/')) {
    const raw = path.slice('/chart/'.length);
    let sym = raw;
    try {
      sym = decodeURIComponent(raw);
    } catch (_) { /* raw */ }
    const name = history.state?.chartName || sym;
    state._preChartScreen = 'markets';
    state._chartHistoryPushed = false;
    applyChartRoute(sym, name);
  }

  window.addEventListener('popstate', () => {
    const p = location.pathname;
    if (p.startsWith('/chart/')) {
      const raw = p.slice('/chart/'.length);
      let sym = raw;
      try {
        sym = decodeURIComponent(raw);
      } catch (_) { /* raw */ }
      const name = history.state?.chartName || sym;
      applyChartRoute(sym, name);
    } else {
      hideChartScreen();
      state._chartHistoryPushed = false;
      const back = state._preChartScreen || 'markets';
      $$('.screen').forEach((s) => s.classList.remove('active'));
      $(`screen-${back}`)?.classList.add('active');
      $$('.nav-item').forEach((n) => n.classList.remove('active'));
      document.querySelector(`.nav-item[data-screen="${back}"]`)?.classList.add('active');
      state.currentScreen = back;
    }
  });
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

function renderTopics() {
  const grid = $('topics-grid');
  if (!grid) return;
  const counts = {};
  for (const c of state.feed.cards) counts[c.category] = (counts[c.category] || 0) + 1;
  grid.innerHTML = TOPICS.map(t => `<div class="ambito-card ${t.featured ? 'featured' : ''}" onclick="filterByTopic('${t.key}')"><div class="ambito-icon">${t.icon}</div><div class="ambito-name">${t.name}</div><div class="ambito-meta">${counts[t.key] || 0} hoy</div></div>`).join('');
  state._topicsRendered = true;
}

function filterByTopic(topic) {
  const matching = state.feed.cards.filter(c => c.category === topic);
  if (matching.length === 0) { toast(`Sin noticias de ${topic} hoy`); return; }
  switchScreen('today');
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
    savedList.innerHTML = `<div class="empty-state"><h2>Inicia sesión</h2><button class="cta" onclick="openLoginModal()">Entrar</button></div>`;
    return;
  }
  if (!isPremium()) {
    savedList.innerHTML = `<div class="empty-state"><h2>Guardados · Premium</h2><p style="max-width:320px;margin:12px auto 0;line-height:1.5;color:var(--ink-dim);">Las cuentas gratuitas leen hasta 5 noticias del día. <strong>Guardar</strong> noticias y el <strong>histórico</strong> de ediciones incluyen Premium (5 €/mes o 20 €/año).</p></div>`;
    return;
  }
  savedList.innerHTML = `<div class="loading">Cargando...</div>`;
  try {
    await waitForSupabase();
    const ids = [...state.savedIds];
    if (ids.length === 0) {
      savedList.innerHTML = `<div class="empty-state"><h2>Aún no guardaste nada</h2></div>`;
      return;
    }
    const token = state.session?.access_token;
    const res = await fetch(`${API.cards}?ids=${encodeURIComponent(ids.join(','))}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || payload.message || `HTTP ${res.status}`);
    const rows = payload.cards || [];
    const byId = new Map(rows.map((c) => [c.id, c]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    state._savedCardCache = Object.fromEntries(ordered.map((c) => [c.id, c]));
    savedList.innerHTML = ordered.length === 0
      ? `<div class="empty-state"><h2>No hay guardados visibles</h2></div>`
      : ordered.map((c) => {
          const catClass = CATEGORY_COLORS[c.category] || '';
          return `<section class="card"><div class="card-meta"><span class="category ${escapeAttr(catClass)}">${escapeHtml(c.category)}</span></div>${cardAiSourceRowHtml(c)}<h2 class="headline">${escapeHtml(c.headline)}</h2><p class="deck">${escapeHtml(c.deck)}</p><div class="card-footer"><button type="button" class="action-btn saved" onclick="toggleSave('${escapeAttr(c.id)}', this)"><svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg></button></div></section>`;
        }).join('');
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
    renderProfileModal();
    $('profile-modal')?.classList.add('open');
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
    if ($('profile-modal')?.classList.contains('open')) renderProfileModal();
  }
}

function renderProfileModal() {
  const modal = $('profile-modal-body');
  if (!modal) return;
  const user = state.session?.user;
  if (!user) return;
  const email = user.email || '';
  const isPrem = isPremium();
  const planBadge = isPrem ? `<span style="background:rgba(177,237,239,0.65);color:#084f51;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Premium</span>` : `<span style="background:#e7e8e9;color:#414848;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Free</span>`;
  
  modal.innerHTML = `
    <div style="text-align:center;padding:20px 0;border-bottom:1px solid #e1e3e4;margin-bottom:20px;">
      <div style="width:56px;height:56px;border-radius:50%;background:#edeeef;border:1px solid #c1c8c7;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600;color:#0f2d2e;">${email[0]?.toUpperCase() || '?'}</div>
      <div style="font-size:15px;font-weight:500;">${escapeHtml(email)}</div>
      <div style="margin-top:8px;">${planBadge}</div>
      ${!isPrem ? `<p style="font-size:13px;color:var(--ink-dim);margin-top:14px;line-height:1.45;">Plan <strong>Free</strong>: 5 noticias del día y mercados. <strong>Premium</strong>: todas las noticias, histórico y guardar.</p>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e1e3e4;">
        <div style="font-size:13px;font-weight:600;color:var(--ink-dim);margin-bottom:10px;">Suscripción Premium</div>
        <p style="font-size:12px;color:var(--ink-muted);margin:0 0 12px;line-height:1.4;">Pago seguro con Stripe · cancela cuando quieras</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" onclick="startStripeCheckout('monthly')" style="flex:1;min-width:120px;padding:12px 14px;background:#0f2d2e;border:none;border-radius:10px;color:#fff;font-weight:600;cursor:pointer;font-size:13px;">5 € / mes</button>
          <button type="button" onclick="startStripeCheckout('yearly')" style="flex:1;min-width:120px;padding:12px 14px;background:transparent;border:1px solid #c1c8c7;color:var(--ink);border-radius:10px;font-weight:600;cursor:pointer;font-size:13px;">20 € / año</button>
        </div>
      </div>` : `
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e1e3e4;">
        <button type="button" onclick="openStripePortal()" style="width:100%;padding:12px;background:transparent;border:1px solid rgba(43,103,105,0.35);color:var(--accent);border-radius:10px;font-weight:600;cursor:pointer;font-size:13px;">Gestionar suscripción y facturas</button>
      </div>`}
    </div>
    <div style="margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:var(--ink-muted);margin-bottom:12px;">AJUSTES</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #e1e3e4;">
        <div><div style="font-size:14px;font-weight:500;">Recordatorio diario</div><div style="font-size:12px;color:var(--ink-dim);">Notificación a las 7:30</div></div>
        <input type="checkbox" id="reminder-toggle" ${state.profile?.daily_reminder_enabled ? 'checked' : ''} onchange="toggleDailyReminder()" style="cursor:pointer;width:18px;height:18px;">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #e1e3e4;">
        <div><div style="font-size:14px;font-weight:500;">Apariencia</div><div style="font-size:12px;color:var(--ink-dim);">Tema claro Serene</div></div>
        <input type="checkbox" checked disabled style="cursor:not-allowed;width:18px;height:18px;opacity:0.5;">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #e1e3e4;">
        <div><div style="font-size:14px;font-weight:500;">Guardar offline</div><div style="font-size:12px;color:var(--ink-dim);">Lee sin conexión</div></div>
        <input type="checkbox" id="offline-toggle" ${localStorage.getItem('lente.offline-mode') === '1' ? 'checked' : ''} onchange="toggleOfflineMode()" style="cursor:pointer;width:18px;height:18px;">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;">
        <div><div style="font-size:14px;font-weight:500;">Instalar app</div><div style="font-size:12px;color:var(--ink-dim);">PWA en tu dispositivo</div></div>
        <button type="button" onclick="installPWAFromModal()" style="padding:8px 14px;background:#0f2d2e;border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">${getInstallButtonLabel()}</button>
      </div>
    </div>
    <button class="cta" id="logout-btn" style="width:100%;background:transparent;border:1px solid var(--border);color:var(--ink-dim);">Cerrar sesión</button>
  `;
  
  const logoutBtn = $('logout-btn');
  if (logoutBtn) logoutBtn.onclick = signOut;
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
  if (state.session && $('profile-modal')?.classList.contains('open')) renderProfileModal();
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
  if ($('tab-login')) { $('tab-login').style.background = isLogin ? '' : 'transparent'; $('tab-login').style.color = isLogin ? '' : '#717878'; }
  if ($('tab-register')) { $('tab-register').style.background = isLogin ? 'transparent' : ''; $('tab-register').style.color = isLogin ? '#717878' : ''; }
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
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('plan, plan_expires_at, daily_reminder_enabled, name, streak_days, last_visit')
      .eq('id', userId)
      .single();
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
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  scrollFeedToStart();
  bindChartPage();
  initChartRoute();
  await initAuth();
  updateProfileBtn();
  await startApp();
  scrollFeedToStart();
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

window.installPWA = installPWA;
window.dismissInstall = dismissInstall;
window.closeInstallGuideOverlay = closeInstallGuideOverlay;
window.copyPageUrlForInstall = copyPageUrlForInstall;