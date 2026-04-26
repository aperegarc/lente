// ============================================================
// /public/app.js — VERSIÓN v15 ARQUITECTURA CORRECTA
// Cliente PWA · router + render + auth + planes de usuario
// ÚNICA FUENTE DE VERDAD: state.session
// ============================================================

const { SUPABASE_URL, SUPABASE_ANON_KEY, API } = window.LENTE_CONFIG;

let supabaseClient = null;
let supabaseReady = false;
let authListenerInitialized = false;
let appReady = false;

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

const MARKET_CATEGORIES = {
  indices: 'Índices bursátiles', materias: 'Materias primas', divisas: 'Divisas',
  cripto: 'Criptomonedas', bonos: 'Bonos',
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
  const list = $('feed-list');
  if (!list) return;
  list.innerHTML = `<div class="loading">Cargando...</div>`;
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
    if (list) list.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${err.message}</p></div>`;
  }
}

function toggleReadMore(id) {
  const body = $(`body-${id}`);
  const btn = $(`readmore-${id}`);
  const collapsed = body.classList.toggle('collapsed');
  btn.textContent = collapsed ? 'Leer más ↓' : 'Leer menos ↑';
}

function renderFeed(filterCategory = null) {
  const list = $('feed-list');
  if (!list) return;
  const cards = filterCategory ? state.feed.cards.filter(c => c.category === filterCategory) : state.feed.cards;
  const dateLabel = $('date-label');
  const editionLabel = $('edition-label');
  if (dateLabel) dateLabel.textContent = fmtDate(state.feed.date);
  if (editionLabel) editionLabel.textContent = filterCategory ? `Filtro · ${filterCategory}` : 'Edición del día';
  if (!cards || cards.length === 0) {
    list.innerHTML = `<div class="empty-state"><h2>${filterCategory ? `Sin noticias de ${filterCategory}` : 'Sin contenido todavía'}</h2></div>`;
    return;
  }
  const totalReadTime = Math.round(cards.reduce((a, c) => a + (c.read_time_seconds || 40), 0) / 60);
  let html = `<section class="card card-intro"><div class="intro-label">${filterCategory ? `Filtrado por ${filterCategory}` : 'Tu resumen del día'}</div><h1 class="intro-title">${filterCategory ? `<em>${filterCategory}</em>` : 'Buenos días.'}</h1><p class="intro-summary">${cards.length} ${cards.length === 1 ? 'noticia' : 'noticias'}, ${totalReadTime} min de lectura.</p><div class="intro-stats"><div class="intro-stat"><div class="num">${cards.length}</div><div class="txt">noticias</div></div><div class="intro-stat"><div class="num">${totalReadTime}<span style="font-size:13px;color:var(--ink-dim);"> min</span></div><div class="txt">lectura</div></div></div></section>`;
  for (const c of cards) {
    const catClass = CATEGORY_COLORS[c.category] || '';
    const saved = state.savedIds.has(c.id);
    html += `<section class="card" data-id="${c.id}"><div class="card-meta"><span class="category ${catClass}">${c.category}</span><span class="read-time">· ${c.read_time_seconds || 40} s</span></div><h2 class="headline">${c.headline}</h2><p class="deck">${c.deck}</p><div class="section-label">Qué ha pasado</div><p class="body-text collapsed" id="body-${c.id}">${c.body}</p><button class="read-more-btn" id="readmore-${c.id}" onclick="toggleReadMore('${c.id}')">Leer más ↓</button><div class="meaning-box"><div class="section-label">¿Qué significa para ti?</div><p class="meaning-text">${c.meaning}</p></div><div class="card-footer"><div class="actions"><button class="action-btn ${saved ? 'saved' : ''}" onclick="toggleSave('${c.id}', this)"><svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg></button><button class="action-btn" onclick="shareCard('${c.id}')"><svg viewBox="0 0 24 24"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/></svg></button></div></div></section>`;
  }
  list.innerHTML = html;
}

function renderTicker() {
  const t = $('ticker');
  const popular = ['^IBEX', '^GSPC', 'GC=F', 'BTC-USD', 'EURUSD=X', 'BZ=F'];
  const items = popular.map(sym => state.markets.flat.find(m => m.symbol === sym)).filter(Boolean);
  if (items.length === 0) { t.innerHTML = ''; return; }
  t.innerHTML = items.map(m => {
    const cls = m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
    const prefix = m.symbol === 'GC=F' || m.symbol === 'BZ=F' ? '$' : '';
    const priceDigits = m.price > 1000 ? 0 : 2;
    return `<div class="ticker-item"><span class="ticker-name">${m.name}</span><span class="ticker-price">${prefix}${fmtNum(m.price, priceDigits)}</span><span class="ticker-change ${cls}">${fmtPct(m.change_pct)}</span></div>`;
  }).join('');
}

async function loadMarkets() {
  const list = $('markets-list');
  if (!list) return;
  list.innerHTML = `<div class="loading">Cargando...</div>`;
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
  const tabs = $('market-tabs');
  const list = $('markets-list');
  if (!tabs || !list) return;
  const cats = Object.keys(state.markets.grouped);
  tabs.innerHTML = `<div class="market-tab ${state.currentMarketTab === 'all' ? 'active' : ''}" onclick="setMarketTab('all')">Todo</div>` + cats.map(cat => `<div class="market-tab ${state.currentMarketTab === cat ? 'active' : ''}" onclick="setMarketTab('${cat}')">${MARKET_CATEGORIES[cat] || cat}</div>`).join('');
  const groups = state.currentMarketTab === 'all' ? state.markets.grouped : { [state.currentMarketTab]: state.markets.grouped[state.currentMarketTab] || [] };
  if ($('markets-updated')) $('markets-updated').textContent = state.markets.updated_at ? `Actualizado ${new Date(state.markets.updated_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : '–';
  list.innerHTML = Object.entries(groups).map(([cat, items]) => `<div class="market-section"><h3 class="market-section-title">${MARKET_CATEGORIES[cat] || cat}</h3>${items.map(m => {
    const cls = m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
    const prefix = m.symbol?.includes('=F') ? '$' : '';
    const priceDigits = m.price > 1000 ? 0 : 2;
    return `<div class="market-item"><div class="market-item-left"><div class="market-item-name">${m.name}</div><div class="market-item-desc">${m.description || ''}</div></div><div class="market-item-right"><div class="market-price">${prefix}${fmtNum(m.price, priceDigits)}</div><div class="market-change ${cls}">${fmtPct(m.change_pct)}</div></div></div>`;
  }).join('')}</div>`).join('');
}

function setMarketTab(tab) {
  state.currentMarketTab = tab;
  renderMarkets();
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
  const list = $('saved-list');
  if (!list) return;
  const saved = state.feed.cards.filter(c => state.savedIds.has(c.id));
  if (!isLoggedIn()) {
    list.innerHTML = `<div class="empty-state"><h2>Inicia sesión</h2><button class="cta" onclick="openLoginModal()">Crear cuenta</button></div>`;
    if (state.savedIds.size > 0) list.innerHTML = saved.map(c => `<section class="card"><div class="card-meta"><span class="category">${c.category}</span></div><h2 class="headline">${c.headline}</h2><p class="deck">${c.deck}</p></section>`).join('');
    return;
  }
  list.innerHTML = saved.length === 0 ? `<div class="empty-state"><h2>Aún no guardaste nada</h2></div>` : saved.map(c => `<section class="card"><div class="card-meta"><span class="category">${c.category}</span></div><h2 class="headline">${c.headline}</h2><p class="deck">${c.deck}</p><div class="card-footer"><button class="action-btn saved" onclick="toggleSave('${c.id}', this)"><svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg></button></div></section>`).join('');
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
  modal.innerHTML = `<div style="text-align:center;padding:20px 0;"><div style="width:56px;height:56px;border-radius:50%;background:var(--surface-2);margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:500;">${email[0]?.toUpperCase() || '?'}</div><div style="font-size:15px;font-weight:500;">${email}</div><div style="margin-top:8px;">${planBadge}</div></div><button class="cta" id="logout-btn" style="width:100%;background:transparent;border:1px solid var(--border);color:var(--ink-dim);">Cerrar sesión</button>`;
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

    // Supabase hace su trabajo en background, sin esperar
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
    const btn = $('reminder-btn');
    const isEnabled = state.profile?.daily_reminder_enabled || false;
    const { error } = await supabaseClient.from('profiles').update({ daily_reminder_enabled: !isEnabled }).eq('id', user.id);
    if (error) throw error;
    state.profile.daily_reminder_enabled = !isEnabled;
    localStorage.setItem('lente.profile', JSON.stringify(state.profile));
    if (!isEnabled) {
      if (btn) { btn.textContent = '✓ Recordatorio activado'; btn.style.background = 'rgba(201, 169, 97, 0.2)'; }
      toast('Recordatorios activados ✓');
    } else {
      if (btn) { btn.textContent = 'Activar recordatorio diario'; btn.style.background = ''; }
      toast('Recordatorios desactivados');
    }
  } catch (err) {
    console.error('Error recordatorio:', err);
    toast('Error');
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
      console.log('🔐 Auth event:', event);
      
      // IGNORAR eventos iniciales si ya está inicializado
      if (!appReady && event === 'SIGNED_IN') {
        console.log('🔐 Ignorando SIGNED_IN inicial (appReady aún no)');
        return;
      }
      
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

// ✅ PASO 1: Resolver sesión ANTES de arrancar la app
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

// ✅ PASO 2: Cargar feed
async function startApp() {
  try {
    await loadFeed();
  } catch (err) {
    console.error('Error startApp:', err);
  }
}

// ✅ PASO 3: Secuencia correcta
async function init() {
  console.log('🚀 Inicializando app...');
  
  // 1. Resolver auth PRIMERO
  await initAuth();
  console.log('✓ Auth resuelto, sesión:', !!state.session);
  
  // 2. Actualizar UI
  updateProfileBtn();
  
  // 3. Cargar feed
  await startApp();
  console.log('✓ Feed cargado');
  
  // 4. Registrar listener SOLO para cambios posteriores
  await setupAuthListener();
  console.log('✓ Listener registrado');
  
  // 5. Marcar como listo
  appReady = true;
  console.log('✅ App lista');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!localStorage.getItem('lente.install.dismissed')) {
    setTimeout(() => {
      $('install-prompt')?.classList.add('show');
    }, 3000);
  }
});

async function installPWA() {
  if (!deferredPrompt) return;
  $('install-prompt')?.classList.remove('show');
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') toast('Instalación iniciada');
  deferredPrompt = null;
}

function dismissInstall() {
  $('install-prompt')?.classList.remove('show');
  localStorage.setItem('lente.install.dismissed', '1');
}

function showInstallGuide() {
  toast('Abre el menú del navegador y selecciona "Instalar app"');
}