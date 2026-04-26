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
const isIOS = /iphone|ipad|ipod/.test(ua);
const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
const isAndroid = /android/.test(ua);
const isChrome = /chrome|chromium|crios/.test(ua);
const isEdge = /edg/.test(ua);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

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

const CATEGORY_COLORS = {
  'Política monetaria': '', 'Materias primas': 'green', 'Macro Europa': 'blue',
  'Macro': 'blue', 'Tech': 'red', 'Bolsa': 'red', 'Cripto': 'purple',
  'Energía': 'green', 'España': '', 'Geopolítica': 'blue', 'Inmobiliario': '', 'Laboral': '',
};

const state = {
  session: null,
  profile: null,
  feed: { date: null, cards: [] },
  markets: { grouped: {}, flat: [], updated_at: null },
  savedIds: new Set(),
  currentScreen: 'today',
  currentMarketTab: 'all',
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
  if (name === 'topics' && !state._topicsRendered) renderTopics();
  if (name === 'saved') renderSaved();
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
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.feed = data;
    renderFeed();
  } catch (err) {
    console.error('❌ Error loadFeed:', err.message);
    if (feedList) feedList.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${err.message}</p></div>`;
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
    feedList.innerHTML = `<div class="empty-state"><h2>${filterCategory ? `Sin noticias de ${filterCategory}` : 'Sin contenido todavía'}</h2></div>`;
    return;
  }
  const totalReadTime = Math.round(cards.reduce((a, c) => a + (c.read_time_seconds || 40), 0) / 60);
  let html = `<section class="card card-intro"><div class="intro-label">${filterCategory ? `Filtrado por ${filterCategory}` : 'Tu resumen del día'}</div><h1 class="intro-title">${filterCategory ? `<em>${filterCategory}</em>` : 'Buenos días.'}</h1><p class="intro-summary">${cards.length} ${cards.length === 1 ? 'noticia' : 'noticias'}, ${totalReadTime} min de lectura.</p><div class="intro-stats"><div class="intro-stat"><div class="num">${cards.length}</div><div class="txt">noticias</div></div><div class="intro-stat"><div class="num">${totalReadTime}<span style="font-size:13px;color:var(--ink-dim);"> min</span></div><div class="txt">lectura</div></div></div></section>`;
  for (const c of cards) {
    const catClass = CATEGORY_COLORS[c.category] || '';
    const saved = state.savedIds.has(c.id);
    html += `<section class="card" data-id="${c.id}"><div class="card-meta"><span class="category ${catClass}">${c.category}</span><span class="read-time">· ${c.read_time_seconds || 40} s</span></div><h2 class="headline">${c.headline}</h2><p class="deck">${c.deck}</p><div class="section-label">Qué ha pasado</div><p class="body-text collapsed" id="body-${c.id}">${c.body}</p><button class="read-more-btn" id="readmore-${c.id}" onclick="toggleReadMore('${c.id}')">Leer más ↓</button><div class="meaning-box"><div class="section-label">¿Qué significa para ti?</div><p class="meaning-text">${c.meaning}</p></div><div class="card-footer"><div class="actions"><button class="action-btn ${saved ? 'saved' : ''}" onclick="toggleSave('${c.id}', this)"><svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg></button><button class="action-btn" onclick="shareCard('${c.id}')"><svg viewBox="0 0 24 24"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/></svg></button></div></div></section>`;
  }
  feedList.innerHTML = html;
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
    const res = await fetch(API.markets + '?_t=' + Date.now());
    if (!res.ok) throw new Error('Error');
    state.markets = await res.json();
    renderMarkets();
    renderTicker();
  } catch (err) {
    console.error('Error loadMarkets:', err);
  }
}

function renderMarkets() {
  const marketsList = $('markets-list');
  const tabs = $('market-tabs');
  if (!marketsList || !tabs) return;
  
  const cats = Object.keys(state.markets.grouped);
  tabs.innerHTML = `<div class="market-tab ${state.currentMarketTab === 'all' ? 'active' : ''}" onclick="setMarketTab('all')">Todo</div>` + cats.map(cat => `<div class="market-tab ${state.currentMarketTab === cat ? 'active' : ''}" onclick="setMarketTab('${cat}')">${cat}</div>`).join('');
  
  const groups = state.currentMarketTab === 'all' ? state.markets.grouped : { [state.currentMarketTab]: state.markets.grouped[state.currentMarketTab] || [] };
  
  let html = '';
  for (const [cat, items] of Object.entries(groups)) {
    html += `<div class="market-section"><h3 class="market-section-title">${cat}</h3>`;
    for (const m of items) {
      const cls = m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
      const prefix = m.symbol?.includes('=F') ? '$' : '';
      const priceDigits = m.price > 1000 ? 0 : m.symbol?.includes('EUR') ? 4 : 2;
      const tvSymbol = TRADINGVIEW_MAP[m.symbol] || m.symbol;
      
      html += `
        <div class="market-item" style="cursor: pointer;" onclick="openMarketChart('${tvSymbol}', '${m.name}')">
          <div class="market-item-left">
            <div class="market-item-name">${m.name}</div>
            <div class="market-item-desc">${m.description || ''}</div>
          </div>
          <div class="market-item-right">
            <div class="market-price">${prefix}${fmtNum(m.price, priceDigits)}</div>
            <div class="market-change ${cls}">${fmtPct(m.change_pct)}</div>
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }
  
  marketsList.innerHTML = html;
}

function setMarketTab(tab) {
  state.currentMarketTab = tab;
  renderMarkets();
}

async function openMarketChart(tvSymbol, name) {
  const backdrop = document.createElement('div');
  backdrop.id = 'chart-modal-backdrop';
  backdrop.className = 'chart-modal-backdrop';

  const chartId = `tv-${tvSymbol.replace(/[^a-zA-Z0-9]/g, '-')}`;

  backdrop.innerHTML = `
    <div class="chart-modal">
      <div class="chart-modal-header">
        <div>
          <div class="chart-modal-title">${name}</div>
          <div class="chart-modal-symbol">${tvSymbol}</div>
        </div>
        <button class="chart-modal-close" onclick="closeChartModal()">×</button>
      </div>
      <div class="chart-modal-body" id="${chartId}"></div>
    </div>`;

  document.body.appendChild(backdrop);

  loadTradingViewScript(() => {
    renderTradingViewChart(chartId, tvSymbol);
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
}

function closeChartModal() {
  document.getElementById('chart-modal-backdrop')?.remove();
}

function loadTradingViewScript(callback) {
  if (window.TradingView) {
    callback();
  } else {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = callback;
    document.body.appendChild(script);
  }
}

function renderTradingViewChart(containerId, tvSymbol) {
  try {
    new TradingView.widget({
      "container_id": containerId,
      "autosize": true,
      "symbol": tvSymbol,
      "interval": "D",
      "timezone": "Europe/Madrid",
      "theme": "dark",
      "style": "1",
      "locale": "es",
      "toolbar_bg": "#1a1a1a",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "hide_side_toolbar": false,
      "details": true,
      "hotlist": true,
      "calendar": true,
      "studies": ["Volume@tv-basicstudies", "RSI@tv-basicstudies", "MACD@tv-basicstudies"]
    });
  } catch (err) {
    console.error('Error TradingView:', err);
  }
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
      state.savedIds = new Set(JSON.parse(localStorage.getItem('lente.saved') || '[]'));
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
  try {
    await waitForSupabase();
    const saved = state.savedIds.has(cardId);
    if (saved) {
      state.savedIds.delete(cardId);
      btn?.classList.remove('saved');
    } else {
      state.savedIds.add(cardId);
      btn?.classList.add('saved');
    }
    if (state.session) {
      const user = state.session?.user;
      if (!user) return;
      if (saved) {
        await supabaseClient.from('saved_cards').delete().eq('user_id', user.id).eq('card_id', cardId);
      } else {
        await supabaseClient.from('saved_cards').upsert({ user_id: user.id, card_id: cardId, saved_at: new Date().toISOString() }, { onConflict: 'user_id,card_id' });
      }
    } else {
      localStorage.setItem('lente.saved', JSON.stringify([...state.savedIds]));
    }
    toast(saved ? 'Eliminado' : 'Guardado ✓');
  } catch (err) {
    console.error('Error toggleSave:', err);
    toast('Error');
  }
}

function renderSaved() {
  const savedList = $('saved-list');
  if (!savedList) return;
  const saved = state.feed.cards.filter(c => state.savedIds.has(c.id));
  if (!isLoggedIn()) {
    savedList.innerHTML = `<div class="empty-state"><h2>Inicia sesión</h2><button class="cta" onclick="openLoginModal()">Crear cuenta</button></div>`;
    if (state.savedIds.size > 0) savedList.innerHTML = saved.map(c => `<section class="card"><div class="card-meta"><span class="category">${c.category}</span></div><h2 class="headline">${c.headline}</h2><p class="deck">${c.deck}</p></section>`).join('');
    return;
  }
  savedList.innerHTML = saved.length === 0 ? `<div class="empty-state"><h2>Aún no guardaste nada</h2></div>` : saved.map(c => `<section class="card"><div class="card-meta"><span class="category">${c.category}</span></div><h2 class="headline">${c.headline}</h2><p class="deck">${c.deck}</p><div class="card-footer"><button class="action-btn saved" onclick="toggleSave('${c.id}', this)"><svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg></button></div></section>`).join('');
}

async function shareCard(id) {
  const card = state.feed.cards.find(c => c.id === id);
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

function renderProfileModal() {
  const modal = $('profile-modal-body');
  if (!modal) return;
  const user = state.session?.user;
  if (!user) return;
  const email = user.email || '';
  const isPrem = isPremium();
  const planBadge = isPrem ? `<span style="background:#2a6b3a;color:#7fd89a;padding:3px 10px;border-radius:20px;font-size:12px;">Premium</span>` : `<span style="background:#2a2a2a;color:#9a958b;padding:3px 10px;border-radius:20px;font-size:12px;">Free</span>`;
  
  modal.innerHTML = `
    <div style="text-align:center;padding:20px 0;border-bottom:1px solid #3a3530;margin-bottom:20px;">
      <div style="width:56px;height:56px;border-radius:50%;background:var(--surface-2);margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:500;">${email[0]?.toUpperCase() || '?'}</div>
      <div style="font-size:15px;font-weight:500;">${email}</div>
      <div style="margin-top:8px;">${planBadge}</div>
    </div>
    <div style="margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;color:var(--ink-dim);margin-bottom:12px;">AJUSTES</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #2a2a2a;">
        <div><div style="font-size:14px;font-weight:500;">Recordatorio diario</div><div style="font-size:12px;color:var(--ink-dim);">Notificación a las 7:30</div></div>
        <input type="checkbox" id="reminder-toggle" ${state.profile?.daily_reminder_enabled ? 'checked' : ''} onchange="toggleDailyReminder()" style="cursor:pointer;width:18px;height:18px;">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #2a2a2a;">
        <div><div style="font-size:14px;font-weight:500;">Tema oscuro</div><div style="font-size:12px;color:var(--ink-dim);">Activado siempre</div></div>
        <input type="checkbox" checked disabled style="cursor:not-allowed;width:18px;height:18px;opacity:0.5;">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #2a2a2a;">
        <div><div style="font-size:14px;font-weight:500;">Guardar offline</div><div style="font-size:12px;color:var(--ink-dim);">Lee sin conexión</div></div>
        <input type="checkbox" id="offline-toggle" ${localStorage.getItem('lente.offline-mode') === '1' ? 'checked' : ''} onchange="toggleOfflineMode()" style="cursor:pointer;width:18px;height:18px;">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;">
        <div><div style="font-size:14px;font-weight:500;">Instalar app</div><div style="font-size:12px;color:var(--ink-dim);">PWA en tu dispositivo</div></div>
        <button onclick="installPWAFromModal()" style="padding:6px 12px;background:#c9a961;border:none;border-radius:6px;color:#1a1a1a;font-size:12px;font-weight:600;cursor:pointer;">${isStandalone ? '✓ Instalada' : 'Instalar'}</button>
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

async function installPWAFromModal() {
  if (deferredPrompt) {
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast('¡App instalada! 🎉');
        renderProfileModal();
      }
      deferredPrompt = null;
    } catch (err) {
      console.error('Error instalación:', err);
      toast('Error al instalar');
    }
  } else if (isIOS || (isSafari && !isAndroid)) {
    showIOSInstallGuide();
  } else {
    alert('Tu navegador no soporta instalación de PWA. Intenta abrir el menú y busca "Instalar app".');
  }
}

function closeLogin() { $('login-modal')?.classList.remove('open'); }
function closeProfileModal() { $('profile-modal')?.classList.remove('open'); }

let loginMode = 'login';
function showTab(mode) {
  loginMode = mode;
  const isLogin = mode === 'login';
  if ($('tab-login')) { $('tab-login').style.background = isLogin ? '' : 'transparent'; $('tab-login').style.color = isLogin ? '' : '#9a958b'; }
  if ($('tab-register')) { $('tab-register').style.background = isLogin ? 'transparent' : ''; $('tab-register').style.color = isLogin ? '#9a958b' : ''; }
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
      const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
      if (error) { $('login-status').textContent = error.message; } else if (data?.user) { $('login-status').textContent = '✓ Revisa tu email'; $('login-email').value = ''; $('login-password').value = ''; setTimeout(() => showTab('login'), 1500); }
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
        updateProfileBtn();
        renderFeed();
      } else if (event === 'SIGNED_OUT') {
        state.profile = null;
        state.savedIds.clear();
        localStorage.removeItem('lente.profile');
        updateProfileBtn();
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
  appReady = true;
  console.log('✅ App v26 lista');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

if ((isChrome || isEdge) && !isIOS) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });
}

function showIOSInstallGuide() {
  const html = `<div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;"><div style="background: #1a1a1a; border-radius: 16px; padding: 24px; max-width: 320px; text-align: center; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"><h2 style="margin: 0 0 16px; font-size: 18px; font-weight: 600;">Instalar lente</h2><p style="margin: 0 0 20px; font-size: 14px; color: #ccc; line-height: 1.4;">Pasos para añadir la app a tu pantalla de inicio:</p><div style="background: #2a2a2a; border-radius: 12px; padding: 16px; margin-bottom: 20px; text-align: left; font-size: 13px; line-height: 1.6;"><div style="margin-bottom: 12px;"><strong style="display: block; margin-bottom: 4px;">1️⃣ Pulsa el botón compartir</strong><span style="color: #999;">(icono ⬆️ abajo)</span></div><div style="margin-bottom: 12px;"><strong style="display: block; margin-bottom: 4px;">2️⃣ Desplaza hacia abajo</strong><span style="color: #999;">y busca "Añadir a pantalla de inicio"</span></div><div><strong style="display: block; margin-bottom: 4px;">3️⃣ Pulsa "Añadir"</strong><span style="color: #999;">¡Listo! La app aparecerá en tu home</span></div></div><button onclick="this.parentElement.parentElement.remove()" style="width: 100%; padding: 10px; background: #c9a961; border: none; border-radius: 8px; color: #1a1a1a; font-weight: 600; cursor: pointer;">Entendido</button></div></div>`;
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div.firstElementChild);
}