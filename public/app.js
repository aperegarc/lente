// ============================================================
// /public/app.js — VERSIÓN v5 FINAL ARREGLADA
// Cliente PWA · router + render + auth + planes de usuario
// ============================================================

const { SUPABASE_URL, SUPABASE_ANON_KEY, API } = window.LENTE_CONFIG;

// Inicializar Supabase con retry
let supabaseClient = null;
let supabaseReady = false;

function initSupabase() {
  if (window.supabase && !supabaseClient) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      supabaseReady = true;
      console.log('✓ Supabase inicializado correctamente');
    } catch (err) {
      console.error('Error inicializando Supabase:', err);
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
  'Política monetaria': '',
  'Materias primas': 'green',
  'Macro Europa': 'blue',
  'Macro': 'blue',
  'Tech': 'red',
  'Bolsa': 'red',
  'Cripto': 'purple',
  'Energía': 'green',
  'España': '',
  'Geopolítica': 'blue',
  'Inmobiliario': '',
  'Laboral': '',
};

const MARKET_CATEGORIES = {
  indices: 'Índices bursátiles',
  materias: 'Materias primas',
  divisas: 'Divisas',
  cripto: 'Criptomonedas',
  bonos: 'Bonos',
};

// ESTADO
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

// UTILIDADES
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
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
    .replace(/^\w/, c => c.toUpperCase());
}

function fmtNum(n, digits = 2) {
  if (n == null || Number.isNaN(+n)) return '–';
  return (+n).toLocaleString('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(n) {
  if (n == null) return '–';
  const sign = n > 0 ? '+' : (n < 0 ? '−' : '±');
  return `${sign}${Math.abs(n).toFixed(2)}%`;
}

// ROUTER
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

// FEED
async function loadFeed() {
  console.log('📰 loadFeed() iniciado');
  const list = $('feed-list');
  if (!list) return;
  
  list.innerHTML = `<div class="loading">Cargando resumen del día...</div>`;

  try {
    await waitForSupabase();
    const url = API.feed + '?_t=' + Date.now();
    console.log('📡 Fetch:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log('✓ Feed cargado:', data?.cards?.length, 'tarjetas');
    state.feed = data;
    renderFeed();
  } catch (err) {
    console.error('❌ Error loadFeed:', err);
    if (list) {
      list.innerHTML = `<div class="empty-state"><h2>No podemos conectar</h2><p>${err.message}</p></div>`;
    }
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
  
  const cards = filterCategory
    ? state.feed.cards.filter(c => c.category === filterCategory)
    : state.feed.cards;

  const dateLabel = $('date-label');
  const editionLabel = $('edition-label');
  if (dateLabel) dateLabel.textContent = fmtDate(state.feed.date);
  if (editionLabel) editionLabel.textContent = filterCategory ? `Filtro · ${filterCategory}` : 'Edición del día';

  if (!cards || cards.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <h2>${filterCategory ? `Sin noticias de ${filterCategory}` : 'Sin contenido todavía'}</h2>
        <p>${filterCategory ? 'Prueba con otro ámbito.' : 'El pipeline aún no ha publicado la edición de hoy. Vuelve pronto.'}</p>
      </div>
    `;
    return;
  }

  const totalReadTime = Math.round(cards.reduce((a, c) => a + (c.read_time_seconds || 40), 0) / 60);

  let html = `
    <section class="card card-intro">
      <div class="intro-label">${filterCategory ? `Filtrado por ${filterCategory}` : 'Tu resumen del día'}</div>
      <h1 class="intro-title">${filterCategory ? `<em>${filterCategory}</em>` : 'Buenos días.'}</h1>
      <p class="intro-summary">${cards.length} ${cards.length === 1 ? 'noticia' : 'noticias'}, ${totalReadTime} min de lectura.</p>
      <div class="intro-stats">
        <div class="intro-stat"><div class="num">${cards.length}</div><div class="txt">noticias</div></div>
        <div class="intro-stat"><div class="num">${totalReadTime}<span style="font-size:13px;color:var(--ink-dim);"> min</span></div><div class="txt">lectura total</div></div>
        <div class="intro-stat"><div class="num">${cards.reduce((a, c) => a + (c.sources_text?.split('·').length || 1), 0)}</div><div class="txt">fuentes</div></div>
      </div>
    </section>
  `;

  for (const c of cards) {
    const catClass = CATEGORY_COLORS[c.category] || '';
    const saved = state.savedIds.has(c.id);
    html += `
      <section class="card" data-id="${c.id}">
        <div class="card-meta">
          <span class="category ${catClass}">${c.category}</span>
          <span class="read-time">· ${c.read_time_seconds || 40} s lectura</span>
        </div>
        <h2 class="headline">${c.headline}</h2>
        <p class="deck">${c.deck}</p>
        <div class="section-label">Qué ha pasado</div>
        <p class="body-text collapsed" id="body-${c.id}">${c.body}</p>
        <button class="read-more-btn" id="readmore-${c.id}" onclick="toggleReadMore('${c.id}')">Leer más ↓</button>
        <div class="meaning-box">
          <div class="section-label">¿Qué significa para ti?</div>
          <p class="meaning-text">${c.meaning}</p>
        </div>
        <div class="card-footer">
          <div class="actions">
            <button class="action-btn ${saved ? 'saved' : ''}" onclick="toggleSave('${c.id}', this)" title="Guardar">
              <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            </button>
            <button class="action-btn" onclick="shareCard('${c.id}')" title="Compartir">
              <svg viewBox="0 0 24 24"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/></svg>
            </button>
          </div>
        </div>
      </section>
    `;
  }

  html += `
    <section class="card card-end">
      <div class="intro-label">Fin del resumen</div>
      <h2 class="headline" style="text-align:center;">Has leído las <em>${cards.length} ${cards.length === 1 ? 'noticia' : 'noticias'}</em> de hoy.</h2>
      <p class="deck" style="text-align:center;">Vuelve mañana a las 7:30.</p>
      <button class="cta" id="reminder-btn" onclick="toggleDailyReminder()">
        Activar recordatorio diario
      </button>
    </section>
  `;

  list.innerHTML = html;

  const progress = $('progress');
  if (progress) {
    progress.innerHTML = '';
    const allCards = list.querySelectorAll('.card');
    allCards.forEach(() => {
      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      progress.appendChild(bar);
    });
    const bars = progress.querySelectorAll('.progress-bar');
    const screen = $('screen-today');
    screen.addEventListener('scroll', () => {
      const scrollTop = screen.scrollTop;
      const viewportCenter = scrollTop + screen.clientHeight / 2;
      allCards.forEach((card, i) => {
        const top = card.offsetTop;
        const bottom = top + card.offsetHeight;
        if (bars[i]) {
          bars[i].classList.remove('active', 'done');
          if (viewportCenter >= top && viewportCenter < bottom) bars[i].classList.add('active');
          else if (scrollTop > bottom - 100) bars[i].classList.add('done');
        }
      });
    });
    if (bars[0]) bars[0].classList.add('active');
  }
}

// TICKER
function renderTicker() {
  const t = $('ticker');
  const popular = ['^IBEX', '^GSPC', 'GC=F', 'BTC-USD', 'EURUSD=X', 'BZ=F'];
  const items = popular
    .map(sym => state.markets.flat.find(m => m.symbol === sym))
    .filter(Boolean);

  if (items.length === 0) { t.innerHTML = ''; return; }

  t.innerHTML = items.map(m => {
    const cls = m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
    const prefix = m.symbol === 'GC=F' || m.symbol === 'BZ=F' ? '$' : '';
    const priceDigits = m.price > 1000 ? 0 : 2;
    return `
      <div class="ticker-item">
        <span class="ticker-name">${m.name}</span>
        <span class="ticker-price">${prefix}${fmtNum(m.price, priceDigits)}</span>
        <span class="ticker-change ${cls}">${fmtPct(m.change_pct)}</span>
      </div>
    `;
  }).join('');
}

// MERCADOS
async function loadMarkets() {
  const list = $('markets-list');
  if (!list) return;
  list.innerHTML = `<div class="loading">Cargando mercados...</div>`;

  try {
    await waitForSupabase();
    const res = await fetch(API.markets + '?_t=' + Date.now());
    if (!res.ok) throw new Error('Error cargando mercados');
    state.markets = await res.json();
    renderMarkets();
    renderTicker();
  } catch (err) {
    console.error('Error loadMarkets:', err);
    if (list) {
      list.innerHTML = `<div class="empty-state"><h2>Sin datos de mercado</h2><p>No hemos podido conectar.</p></div>`;
    }
  }
}

function renderMarkets() {
  const tabs = $('market-tabs');
  const list = $('markets-list');
  if (!tabs || !list) return;

  const cats = Object.keys(state.markets.grouped);
  tabs.innerHTML = `<div class="market-tab ${state.currentMarketTab === 'all' ? 'active' : ''}" onclick="setMarketTab('all')">Todo</div>`
    + cats.map(cat => `
      <div class="market-tab ${state.currentMarketTab === cat ? 'active' : ''}" onclick="setMarketTab('${cat}')">
        ${MARKET_CATEGORIES[cat] || cat}
      </div>
    `).join('');

  const groups = state.currentMarketTab === 'all'
    ? state.markets.grouped
    : { [state.currentMarketTab]: state.markets.grouped[state.currentMarketTab] || [] };

  if ($('markets-updated')) {
    $('markets-updated').textContent = state.markets.updated_at
      ? `Actualizado ${new Date(state.markets.updated_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
      : '–';
  }

  list.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div class="market-section">
      <h3 class="market-section-title">${MARKET_CATEGORIES[cat] || cat}</h3>
      ${items.map(m => renderMarketItem(m)).join('')}
    </div>
  `).join('');
}

function renderMarketItem(m) {
  const cls = m.change_pct > 0 ? 'up' : m.change_pct < 0 ? 'down' : 'flat';
  const sparkColor = m.change_pct > 0 ? '#6fae5f' : m.change_pct < 0 ? '#d66a5c' : '#9a958b';
  const spark = Array.isArray(m.sparkline) && m.sparkline.length > 0
    ? buildSparkline(m.sparkline, sparkColor) : '';
  const prefix = m.symbol?.includes('=F') ? '$' : '';
  const priceDigits = m.price > 1000 ? 0 : m.symbol?.includes('EUR') ? 4 : 2;

  return `
    <div class="market-item">
      <div class="market-item-left">
        <div class="market-item-name">${m.name}</div>
        <div class="market-item-desc">${m.description || ''}</div>
      </div>
      <div class="market-item-mid">${spark}</div>
      <div class="market-item-right">
        <div class="market-price">${prefix}${fmtNum(m.price, priceDigits)}</div>
        <div class="market-change ${cls}">${fmtPct(m.change_pct)}</div>
      </div>
    </div>
  `;
}

function buildSparkline(points, color) {
  const w = 60, h = 24;
  if (points.length < 2) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${color}" stroke-width="1.3"/></svg>`;
}

function setMarketTab(tab) {
  state.currentMarketTab = tab;
  renderMarkets();
}

// ÁMBITOS
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
  const aliasMap = {
    'Macro': ['Macro', 'Macro Europa', 'Política monetaria'],
    'Energía': ['Energía', 'Materias primas'],
  };

  grid.innerHTML = TOPICS.map(t => {
    const aliases = aliasMap[t.key] || [t.key];
    const count = aliases.reduce((a, al) => a + (counts[al] || 0), 0);
    return `
      <div class="ambito-card ${t.featured ? 'featured' : ''}" onclick="filterByTopic('${t.key}')">
        <div class="ambito-icon">${t.icon}</div>
        <div class="ambito-name">${t.name}</div>
        <div class="ambito-meta">${count} hoy</div>
      </div>
    `;
  }).join('');

  state._topicsRendered = true;
}

function filterByTopic(topic) {
  const matching = state.feed.cards.filter(c =>
    c.category === topic || c.category.toLowerCase().includes(topic.toLowerCase())
  );
  if (matching.length === 0) { toast(`Sin noticias de ${topic} hoy`); return; }
  switchScreen('today');
  renderFeed(matching[0].category);
  const screen = $('screen-today');
  if (screen) screen.scrollTop = 0;
}

// GUARDADOS
async function loadSavedCards() {
  try {
    console.log('💾 loadSavedCards() iniciado, session:', !!state.session);
    
    await waitForSupabase();
    
    if (!state.session) {
      console.log('📱 Sin sesión, cargando guardados locales');
      state.savedIds = new Set(JSON.parse(localStorage.getItem('lente.saved') || '[]'));
      console.log('✓ Guardados locales cargados:', state.savedIds.size);
      return;
    }

    console.log('🔐 Con sesión, cargando guardados de Supabase');
    const { data, error } = await supabaseClient
      .from('saved_cards')
      .select('card_id')
      .eq('user_id', state.session.user.id);

    if (error) {
      console.error('❌ Error loadSavedCards:', error);
      return;
    }

    if (data) {
      state.savedIds = new Set(data.map(r => r.card_id));
      console.log('✓ Guardados de Supabase cargados:', state.savedIds.size);
    }
  } catch (err) {
    console.error('❌ Error en loadSavedCards:', err);
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
      if (saved) {
        const { error } = await supabaseClient.from('saved_cards').delete()
          .eq('user_id', state.session.user.id)
          .eq('card_id', cardId);
        
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from('saved_cards').upsert({
          user_id: state.session.user.id,
          card_id: cardId,
          saved_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,card_id'
        });

        if (error) throw error;
      }
    } else {
      localStorage.setItem('lente.saved', JSON.stringify([...state.savedIds]));
    }

    toast(saved ? 'Eliminado de guardados' : 'Guardado ✓');
  } catch (err) {
    console.error('Error toggleSave:', err);
    if (state.savedIds.has(cardId)) {
      state.savedIds.delete(cardId);
      btn?.classList.remove('saved');
    } else {
      state.savedIds.add(cardId);
      btn?.classList.add('saved');
    }
    toast('Error. Inténtalo de nuevo.');
  }
}

function renderSaved() {
  const list = $('saved-list');
  if (!list) return;

  const saved = state.feed.cards.filter(c => state.savedIds.has(c.id));

  if (!isLoggedIn()) {
    list.innerHTML = `
      <div class="empty-state">
        <h2>Inicia sesión para guardar</h2>
        <p>Crea una cuenta gratuita para guardar tarjetas y acceder desde cualquier dispositivo.</p>
        <button class="cta" style="margin-top:16px;" onclick="openLoginModal()">Crear cuenta gratis</button>
      </div>
    `;
    if (state.savedIds.size > 0) renderSavedCards(list, saved, true);
    return;
  }

  renderSavedCards(list, saved, false);
}

function renderSavedCards(list, saved, isGuest) {
  if (saved.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <h2>Aún no has guardado nada</h2>
        <p>Toca el marcador en cualquier tarjeta para guardarla aquí.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = saved.map(c => {
    const catClass = CATEGORY_COLORS[c.category] || '';
    return `
      <section class="card">
        <div class="card-meta">
          <span class="category ${catClass}">${c.category}</span>
          <span class="read-time">· ${c.read_time_seconds || 40} s</span>
        </div>
        <h2 class="headline">${c.headline}</h2>
        <p class="deck">${c.deck}</p>
        <div class="meaning-box">
          <div class="section-label">¿Qué significa para ti?</div>
          <p class="meaning-text">${c.meaning}</p>
        </div>
        <div class="card-footer">
          <div class="actions">
            <button class="action-btn saved" onclick="toggleSave('${c.id}', this)">
              <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            </button>
          </div>
        </div>
      </section>
    `;
  }).join('');
}

// COMPARTIR
async function shareCard(id) {
  const card = state.feed.cards.find(c => c.id === id);
  if (!card) return;
  const plain = card.headline.replace(/<[^>]+>/g, '');
  const text = `${plain}\n\n${card.deck}\n\nLeído en lente`;
  const url = `${location.origin}/?card=${id}`;

  if (navigator.share) {
    try { await navigator.share({ title: plain, text, url }); } catch { }
  } else {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Enlace copiado');
  }
}

// AUTH
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data === 'RELOAD') window.location.reload();
  });
}

function openLoginModal() {
  const m = $('login-modal');
  if (m) m.classList.add('open');
  showTab('login');
}

function openProfile() {
  if (state.session) {
    renderProfileModal();
    const m = $('profile-modal');
    if (m) m.classList.add('open');
  } else {
    openLoginModal();
  }
}

function renderProfileModal() {
  const modal = $('profile-modal-body');
  if (!modal) return;

  const email = state.session?.user?.email || '';
  const plan = state.profile?.plan || 'free';
  const expires = state.profile?.plan_expires_at;
  const isPrem = isPremium();

  const planBadge = isPrem
    ? `<span style="background:#2a6b3a;color:#7fd89a;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:500;">Premium</span>`
    : `<span style="background:#2a2a2a;color:#9a958b;padding:3px 10px;border-radius:20px;font-size:12px;">Free</span>`;

  const expiresText = isPrem && expires
    ? `<p style="font-size:12px;color:var(--ink-dim);margin:4px 0 0;">Válido hasta ${new Date(expires).toLocaleDateString('es-ES')}</p>`
    : '';

  modal.innerHTML = `
    <div style="text-align:center;padding:8px 0 20px;">
      <div style="width:56px;height:56px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:500;margin:0 auto 12px;">
        ${email && email.length > 0 ? email[0].toUpperCase() : '?'}
      </div>
      <div style="font-size:15px;font-weight:500;color:var(--ink);">${email || 'Sin email'}</div>
      <div style="margin-top:8px;">${planBadge}</div>
      ${expiresText}
    </div>

    ${!isPrem ? `
    <div style="background:var(--surface-2);border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">
      <div style="font-size:14px;font-weight:500;margin-bottom:6px;">lente Premium</div>
      <div style="font-size:12px;color:var(--ink-dim);margin-bottom:12px;">Historial completo · Alertas · Sin límites</div>
      <button class="cta" style="width:100%;opacity:0.5;cursor:not-allowed;" disabled>Próximamente</button>
    </div>
    ` : ''}

    <button class="cta" id="logout-btn" style="width:100%;background:transparent;border:1px solid var(--border);color:var(--ink-dim);">
      Cerrar sesión
    </button>
  `;

  const logoutBtn = $('logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = signOut;
  }
}

async function signOut() {
  try {
    const btn = $('logout-btn');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }

    console.log('🔐 Iniciando logout...');

    await waitForSupabase();

    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      console.error('Error en Supabase.signOut():', error);
    }

    console.log('✓ Sesión cerrada');

    const modal = $('profile-modal');
    if (modal) {
      modal.classList.remove('open');
    }

    const savedCardIds = localStorage.getItem('lente.saved');

    localStorage.clear();
    sessionStorage.clear();

    if (savedCardIds) {
      localStorage.setItem('lente.saved', savedCardIds);
    }

    state.session = null;
    state.profile = null;
    state.feed = { date: null, cards: [] };
    state.savedIds.clear();

    console.log('✓ Estado limpiado');

    updateProfileBtn();
    toast('Sesión cerrada ✓');

    console.log('⏳ Recargando en 600ms...');
    setTimeout(() => {
      window.location.href = window.location.origin;
    }, 600);

  } catch (err) {
    console.error('❌ Error en logout:', err);
    toast('Error: ' + (err.message || 'desconocido'));
    const btn = $('logout-btn');
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
}

async function toggleDailyReminder() {
  try {
    await waitForSupabase();
    
    if (!state.session) {
      openLoginModal();
      return;
    }

    const btn = $('reminder-btn');
    const isEnabled = state.profile?.daily_reminder_enabled || false;

    const { error } = await supabaseClient
      .from('profiles')
      .update({ daily_reminder_enabled: !isEnabled })
      .eq('id', state.session.user.id);

    if (error) throw error;

    state.profile.daily_reminder_enabled = !isEnabled;
    
    if (!isEnabled) {
      if (btn) {
        btn.textContent = '✓ Recordatorio activado';
        btn.style.background = 'rgba(201, 169, 97, 0.2)';
      }
      toast('Recordatorios activados ✓');
    } else {
      if (btn) {
        btn.textContent = 'Activar recordatorio diario';
        btn.style.background = '';
      }
      toast('Recordatorios desactivados');
    }
  } catch (err) {
    console.error('Error en recordatorio:', err);
    toast('Error al actualizar recordatorio');
  }
}

function closeLogin() {
  const m = $('login-modal');
  if (m) m.classList.remove('open');
}

function closeProfileModal() {
  const m = $('profile-modal');
  if (m) m.classList.remove('open');
}

let loginMode = 'login';

function showTab(mode) {
  loginMode = mode;
  const isLogin = mode === 'login';
  const tabLogin = $('tab-login');
  const tabRegister = $('tab-register');
  const submitBtn = $('login-submit-btn');
  const status = $('login-status');

  if (tabLogin) {
    tabLogin.style.background = isLogin ? '' : 'transparent';
    tabLogin.style.color = isLogin ? '' : '#9a958b';
    tabLogin.style.border = isLogin ? '' : '1px solid #3a3530';
  }
  if (tabRegister) {
    tabRegister.style.background = isLogin ? 'transparent' : '';
    tabRegister.style.color = isLogin ? '#9a958b' : '';
    tabRegister.style.border = isLogin ? '1px solid #3a3530' : '';
  }
  if (submitBtn) submitBtn.textContent = isLogin ? 'Entrar' : 'Crear cuenta';
  if (status) status.textContent = '';
}

async function submitLogin() {
  try {
    await waitForSupabase();

    const emailEl = $('login-email');
    const passwordEl = $('login-password');
    const status = $('login-status');

    if (!emailEl || !passwordEl || !status) return;

    const email = emailEl.value.trim();
    const password = passwordEl.value;

    if (!email.includes('@')) {
      status.textContent = 'Email inválido';
      status.className = 'login-status error';
      return;
    }

    if (!password || password.length < 6) {
      status.textContent = 'Mínimo 6 caracteres';
      status.className = 'login-status error';
      return;
    }

    status.textContent = loginMode === 'login' ? 'Iniciando sesión...' : 'Creando cuenta...';
    status.className = 'login-status';

    if (loginMode === 'register') {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        status.textContent = error.message || 'Error creando cuenta';
        status.className = 'login-status error';
      } else if (data?.user) {
        status.textContent = '✓ Cuenta creada. Revisa tu email';
        status.className = 'login-status success';
        emailEl.value = '';
        passwordEl.value = '';
        setTimeout(() => showTab('login'), 1500);
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        status.textContent = error.message || 'Error iniciando sesión';
        status.className = 'login-status error';
      } else if (data?.session) {
        status.textContent = '✓ Sesión iniciada';
        status.className = 'login-status success';
        setTimeout(() => {
          closeLogin();
          toast('¡Bienvenido! ✓');
        }, 500);
      }
    }
  } catch (err) {
    console.error('Error en submitLogin:', err);
    const status = $('login-status');
    if (status) {
      status.textContent = 'Error: ' + (err.message || 'desconocido');
      status.className = 'login-status error';
    }
  }
}

async function loadProfile(userId) {
  try {
    await waitForSupabase();
    console.log('👤 Cargando perfil para:', userId);
    
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('⚠️ Error loadProfile:', error);
      state.profile = { 
        plan: 'free', 
        is_admin: false, 
        daily_reminder_enabled: false 
      };
      return;
    }

    state.profile = data || { 
      plan: 'free', 
      is_admin: false, 
      daily_reminder_enabled: false 
    };
    console.log('✓ Perfil cargado:', state.profile);
  } catch (err) {
    console.error('❌ Error en loadProfile:', err);
    state.profile = { 
      plan: 'free', 
      is_admin: false, 
      daily_reminder_enabled: false 
    };
  }
}

function updateProfileBtn() {
  const btn = $('profile-btn');
  if (!btn) return;
  if (state.session && state.session.user && state.session.user.email) {
    btn.textContent = state.session.user.email[0].toUpperCase();
    btn.classList.toggle('is-premium', isPremium());
  } else {
    btn.textContent = '?';
    btn.classList.remove('is-premium');
  }
}

async function setupAuthListener() {
  try {
    await waitForSupabase();
    console.log('👂 setupAuthListener() registrado');
    
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth state changed:', event, '| session:', !!session);
      state.session = session;
      if (session) {
        console.log('🔐 Sesión detectada, cargando perfil...');
        await loadProfile(session.user.id);
        console.log('🔐 Perfil cargado, cargando guardados...');
        await loadSavedCards();
        console.log('🔐 Guardados cargados');
      } else {
        state.profile = null;
        state.savedIds.clear();
      }
      updateProfileBtn();
    });
  } catch (err) {
    console.error('Error setupAuthListener:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAuthListener);
} else {
  setupAuthListener();
}

async function refreshSession() {
  try {
    console.log('🔄 refreshSession() iniciado');
    await waitForSupabase();
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    state.session = session;
    console.log('✓ Session obtenida:', !!session);
    
    if (session) {
      console.log('🔄 Sesión encontrada, cargando perfil...');
      await loadProfile(session.user.id);
      console.log('🔄 Perfil cargado, cargando guardados...');
      await loadSavedCards();
      console.log('🔄 Guardados cargados');
    }
    updateProfileBtn();
  } catch (err) {
    console.error('Error refreshSession:', err);
  }
}

// PWA INSTALL
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!localStorage.getItem('lente.install.dismissed')) {
    setTimeout(() => {
      const banner = $('install-prompt');
      if (banner) banner.classList.add('show');
    }, 3000);
  }
});

async function installPWA() {
  if (!deferredPrompt) return;
  const banner = $('install-prompt');
  if (banner) banner.classList.remove('show');
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') toast('Instalación iniciada');
  deferredPrompt = null;
}

function dismissInstall() {
  const banner = $('install-prompt');
  if (banner) banner.classList.remove('show');
  localStorage.setItem('lente.install.dismissed', '1');
}

// INIT
async function init() {
  console.log('🚀 === INICIANDO APP === 🚀');
  
  console.log('Paso 1: Esperar Supabase...');
  await waitForSupabase();
  console.log('✓ Supabase listo');
  
  console.log('Paso 2: Restaurar sesión...');
  await refreshSession();
  console.log('✓ Sesión restaurada (perfil + guardados ya cargados)');
  
  console.log('Paso 3: Cargar feed...');
  await loadFeed();
  console.log('✓ Feed cargado');
  
  console.log('✅ === APP LISTA === ✅');
}

// Asegurar que el HTML esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}