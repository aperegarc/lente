// ============================================================
// /public/app.js
// Cliente PWA · router + render + auth
// ============================================================

const { SUPABASE_URL, SUPABASE_ANON_KEY, API } = window.LENTE_CONFIG;

// Cliente Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Paleta → color para categorías
const CATEGORY_COLORS = {
  'Política monetaria': '',
  'Materias primas':    'green',
  'Macro Europa':       'blue',
  'Macro':              'blue',
  'Tech':               'red',
  'Bolsa':              'red',
  'Cripto':             'purple',
  'Energía':            'green',
  'España':             '',
  'Geopolítica':        'blue',
  'Inmobiliario':       '',
  'Laboral':            '',
};

const MARKET_CATEGORIES = {
  indices:  'Índices bursátiles',
  materias: 'Materias primas',
  divisas:  'Divisas',
  cripto:   'Criptomonedas',
  bonos:    'Bonos',
};

// ============================================================
// ESTADO
// ============================================================
const state = {
  session: null,
  feed: { date: null, cards: [] },
  markets: { grouped: {}, flat: [], updated_at: null },
  savedIds: new Set(),
  currentScreen: 'today',
  currentMarketTab: 'all',
};

// ============================================================
// UTILIDADES
// ============================================================
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

// ============================================================
// ROUTER DE PANTALLAS
// ============================================================
function switchScreen(name) {
  state.currentScreen = name;
  $$('.screen').forEach(s => s.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  $(`screen-${name}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-screen="${name}"]`)?.classList.add('active');

  // Cargar data on-demand
  if (name === 'markets' && state.markets.flat.length === 0) {
    loadMarkets();
  }
  if (name === 'topics' && !state._topicsRendered) {
    renderTopics();
  }
  if (name === 'saved') {
    renderSaved();
  }
}

$$('.nav-item').forEach(n => {
  n.addEventListener('click', () => switchScreen(n.dataset.screen));
});

// ============================================================
// FEED
// ============================================================
async function loadFeed() {
  const list = $('feed-list');
  list.innerHTML = `<div class="loading">Cargando resumen del día...</div>`;

  try {
    const res = await fetch(API.feed);
    const data = await res.json();
    state.feed = data;
    renderFeed();
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><h2>No podemos conectar</h2><p>Comprueba tu conexión e inténtalo de nuevo.</p></div>`;
  }
}

function renderFeed(filterCategory = null) {
  const list = $('feed-list');
  const cards = filterCategory
    ? state.feed.cards.filter(c => c.category === filterCategory)
    : state.feed.cards;

  // Etiqueta de fecha
  $('date-label').textContent = fmtDate(state.feed.date);
  $('edition-label').textContent = filterCategory ? `Filtro · ${filterCategory}` : 'Edición del día';

  if (cards.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <h2>${filterCategory ? `Sin noticias de ${filterCategory}` : 'Sin contenido todavía'}</h2>
        <p>${filterCategory ? 'Prueba con otro ámbito o vuelve a la portada.' : 'El pipeline aún no ha publicado la edición de hoy. Vuelve pronto.'}</p>
      </div>
    `;
    return;
  }

  const totalReadTime = Math.round(cards.reduce((a, c) => a + (c.read_time_seconds || 40), 0) / 60);

  let html = `
    <section class="card card-intro">
      <div class="intro-label">${filterCategory ? `Filtrado por ${filterCategory}` : 'Tu resumen del día'}</div>
      <h1 class="intro-title">${filterCategory ? `<em>${filterCategory}</em>` : 'Buenos días.'}</h1>
      <p class="intro-summary">${cards.length} ${cards.length === 1 ? 'noticia' : 'noticias'}, ${totalReadTime} min de lectura. Todo explicado para entender el mundo en un minuto por historia.</p>
      <div class="intro-stats">
        <div class="intro-stat"><div class="num">${cards.length}</div><div class="txt">noticias</div></div>
        <div class="intro-stat"><div class="num">${totalReadTime}<span style="font-size:13px;color:var(--ink-dim);"> min</span></div><div class="txt">lectura total</div></div>
        <div class="intro-stat"><div class="num">${cards.reduce((a,c) => a + (c.sources_text?.split('·').length || 1), 0)}</div><div class="txt">fuentes</div></div>
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
        <p class="body-text">${c.body}</p>
        <div class="meaning-box">
          <div class="section-label">¿Qué significa para ti?</div>
          <p class="meaning-text">${c.meaning}</p>
        </div>
        <div class="card-footer">
          <span class="sources">${c.sources_text || ''}</span>
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
      <button class="cta" onclick="openProfile()">Activar recordatorio diario</button>
    </section>
  `;

  list.innerHTML = html;

  // Progress bars
  const progress = $('progress');
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

// ============================================================
// TICKER
// ============================================================
function renderTicker() {
  const t = $('ticker');
  // Filtramos unos cuantos mercados populares para la cabecera
  const popular = ['^IBEX', '^GSPC', 'GC=F', 'BTC-USD', 'EURUSD=X', 'BZ=F'];
  const items = popular
    .map(sym => state.markets.flat.find(m => m.symbol === sym))
    .filter(Boolean);

  if (items.length === 0) {
    t.innerHTML = '';
    return;
  }

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

// ============================================================
// MERCADOS
// ============================================================
async function loadMarkets() {
  const list = $('markets-list');
  list.innerHTML = `<div class="loading">Cargando mercados...</div>`;

  try {
    const res = await fetch(API.markets);
    state.markets = await res.json();
    renderMarkets();
    renderTicker();
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><h2>Sin datos de mercado</h2><p>No hemos podido conectar.</p></div>`;
  }
}

function renderMarkets() {
  const tabs = $('market-tabs');
  const list = $('markets-list');

  // Tabs
  const cats = Object.keys(state.markets.grouped);
  tabs.innerHTML = `<div class="market-tab ${state.currentMarketTab === 'all' ? 'active' : ''}" onclick="setMarketTab('all')">Todo</div>`
    + cats.map(cat => `
      <div class="market-tab ${state.currentMarketTab === cat ? 'active' : ''}" onclick="setMarketTab('${cat}')">
        ${MARKET_CATEGORIES[cat] || cat}
      </div>
    `).join('');

  // Items
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
    ? buildSparkline(m.sparkline, sparkColor)
    : '';
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

// ============================================================
// ÁMBITOS
// ============================================================
const TOPICS = [
  { key: 'Macro',              name: 'Macro­economía',      icon: 'M', featured: true },
  { key: 'Bolsa',              name: 'Bolsa y acciones',     icon: 'B' },
  { key: 'Inmobiliario',       name: 'Inmobi­liario',        icon: 'I' },
  { key: 'Cripto',             name: 'Cripto y blockchain',  icon: '₿' },
  { key: 'Energía',            name: 'Energía y materias',   icon: 'E' },
  { key: 'Laboral',            name: 'Laboral y pensiones',  icon: 'L' },
  { key: 'Geopolítica',        name: 'Geopolítica',          icon: 'G' },
  { key: 'Tech',               name: 'Tech e innovación',    icon: 'T' },
  { key: 'España',             name: 'España',               icon: 'E' },
];

function renderTopics() {
  const grid = $('topics-grid');

  // Contar noticias por topic
  const counts = {};
  for (const c of state.feed.cards) {
    counts[c.category] = (counts[c.category] || 0) + 1;
  }
  // También contamos aproximado por palabras clave
  const aliasMap = {
    'Macro': ['Macro', 'Macro Europa', 'Política monetaria'],
    'Energía': ['Energía', 'Materias primas'],
  };

  grid.innerHTML = TOPICS.map(t => {
    const aliases = aliasMap[t.key] || [t.key];
    const count = aliases.reduce((a, al) => a + (counts[al] || 0), 0);
    const featured = t.featured ? 'featured' : '';
    return `
      <div class="ambito-card ${featured}" onclick="filterByTopic('${t.key}')">
        <div class="ambito-icon">${t.icon}</div>
        <div class="ambito-name">${t.name}</div>
        <div class="ambito-meta">${count} ${count === 1 ? 'hoy' : 'hoy'}</div>
      </div>
    `;
  }).join('');

  state._topicsRendered = true;
}

function filterByTopic(topic) {
  // Buscar la categoría que mejor matchea
  const matching = state.feed.cards.filter(c =>
    c.category === topic ||
    c.category.toLowerCase().includes(topic.toLowerCase())
  );

  if (matching.length === 0) {
    toast(`Sin noticias de ${topic} hoy`);
    return;
  }

  // Guardamos el filtro y cambiamos de pantalla
  switchScreen('today');
  // Re-render con filtro usando la categoría real de la primera coincidencia
  renderFeed(matching[0].category);
  $('screen-today').scrollTop = 0;
}

// ============================================================
// GUARDADOS
// ============================================================
async function loadSavedCards() {
  if (!state.session) {
    state.savedIds = new Set(JSON.parse(localStorage.getItem('lente.saved') || '[]'));
    return;
  }
  const { data } = await supabase
    .from('saved_cards')
    .select('card_id')
    .eq('user_id', state.session.user.id);
  if (data) state.savedIds = new Set(data.map(r => r.card_id));
}

async function toggleSave(cardId, btn) {
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
      await supabase.from('saved_cards').delete()
        .match({ user_id: state.session.user.id, card_id: cardId });
    } else {
      await supabase.from('saved_cards').insert({
        user_id: state.session.user.id,
        card_id: cardId,
      });
    }
  } else {
    localStorage.setItem('lente.saved', JSON.stringify([...state.savedIds]));
  }

  toast(saved ? 'Eliminado de guardados' : 'Guardado ✓');
}

function renderSaved() {
  const list = $('saved-list');
  const saved = state.feed.cards.filter(c => state.savedIds.has(c.id));

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
          <span class="sources">${c.sources_text || ''}</span>
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

// ============================================================
// COMPARTIR
// ============================================================
async function shareCard(id) {
  const card = state.feed.cards.find(c => c.id === id);
  if (!card) return;

  const plain = card.headline.replace(/<[^>]+>/g, '');
  const text = `${plain}\n\n${card.deck}\n\nLeído en lente`;
  const url = `${location.origin}/?card=${id}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: plain, text, url });
    } catch { /* usuario canceló */ }
  } else {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Enlace copiado');
  }
}

// ============================================================
// AUTH
// ============================================================
async function openProfile() {
  if (state.session) {
    if (confirm(`Sesión iniciada como ${state.session.user.email}. ¿Cerrar sesión?`)) {
      await supabase.auth.signOut();
      location.reload();
    }
  } else {
    $('login-modal').classList.add('open');
  }
}

function closeLogin() {
  $('login-modal').classList.remove('open');
}

async function sendMagicLink() {
  const email = $('login-email').value.trim();
  const status = $('login-status');
  if (!email.includes('@')) {
    status.textContent = 'Email inválido';
    status.className = 'login-status error';
    return;
  }

  status.textContent = 'Enviando...';
  status.className = 'login-status';

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin },
  });

  if (error) {
    status.textContent = error.message;
    status.className = 'login-status error';
  } else {
    status.textContent = `Enlace enviado a ${email}. Revisa tu bandeja.`;
  }
}

async function refreshSession() {
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session;
  if (session) {
    $('profile-btn').textContent = session.user.email[0].toUpperCase();
  } else {
    $('profile-btn').textContent = '?';
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  state.session = session;
  refreshSession();
  loadSavedCards();
});

// ============================================================
// PWA INSTALL
// ============================================================
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Mostrar prompt propio solo si no lo ha desestimado ya
  if (!localStorage.getItem('lente.install.dismissed')) {
    setTimeout(() => $('install-prompt').classList.add('show'), 3000);
  }
});

async function installPWA() {
  if (!deferredPrompt) return;
  $('install-prompt').classList.remove('show');
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') toast('Instalación iniciada');
  deferredPrompt = null;
}

function dismissInstall() {
  $('install-prompt').classList.remove('show');
  localStorage.setItem('lente.install.dismissed', '1');
}

// ============================================================
// INIT
// ============================================================
async function init() {
  await refreshSession();
  await loadSavedCards();
  await loadMarkets();   // para el ticker
  await loadFeed();
}

init();
