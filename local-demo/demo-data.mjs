// Datos de demostración con el mismo formato que devuelven /api/feed, /api/markets y /api/candles.
import { MARKETS_UNIVERSE, UNIVERSE_DISCLAIMER } from '../api/_lib/markets-universe.js';

export const FREE_CARD_LIMIT = 5;

const LEGAL_TAG = 'Contenido elaborado con asistencia de IA a partir de fuentes públicas. Revisado por el equipo editorial.';

const CARDS = [
  {
    category: 'Política monetaria',
    headline: 'El BCE mantiene los tipos y deja la puerta abierta a un recorte en diciembre',
    deck: 'La inflación de la eurozona se acerca al 2 % y Fráncfort empieza a hablar de "normalizar" el precio del dinero.',
    body: 'El Consejo de Gobierno del Banco Central Europeo ha decidido dejar el tipo de depósito sin cambios. En la rueda de prensa, su presidenta ha reconocido que la inflación subyacente sigue bajando más rápido de lo previsto y que el crecimiento de la eurozona es débil. Los mercados ya descuentan con más de un 60 % de probabilidad una bajada de un cuarto de punto antes de fin de año.',
    meaning: 'Si tienes una hipoteca variable, el euríbor podría seguir bajando en los próximos meses. Para tus ahorros, los depósitos remunerados irán pagando algo menos: conviene no esperar rentabilidades como las de 2023.',
    sources_text: 'BCE · Expansión · Financial Times',
    read_time_seconds: 45,
  },
  {
    category: 'Bolsa',
    headline: 'El IBEX 35 cierra la semana en máximos desde 2008 impulsado por la banca',
    deck: 'Santander y BBVA suman más de un 4 % en cinco sesiones tras presentar previsiones de beneficio al alza.',
    body: 'El selectivo español encadena su cuarta semana consecutiva de subidas. La banca, que pesa cerca de un tercio del índice, ha liderado las ganancias gracias a unos márgenes que aguantan mejor de lo esperado pese a la bajada de tipos. Las eléctricas también suben, mientras que el sector turístico corrige tras un verano récord.',
    meaning: 'Si inviertes en un fondo indexado al IBEX, este año lo estás notando. Pero recuerda: un índice muy concentrado en bancos sufre más cuando cambian los tipos. Diversificar con índices globales reduce ese riesgo.',
    sources_text: 'Bolsas y Mercados Españoles · Cinco Días',
    read_time_seconds: 40,
  },
  {
    category: 'Tech',
    headline: 'NVIDIA vuelve a batir previsiones y el Nasdaq recupera el terreno perdido',
    deck: 'La demanda de chips para inteligencia artificial sigue sin techo y arrastra a todo el sector tecnológico.',
    body: 'El fabricante de chips ha presentado ingresos trimestrales por encima de lo que esperaban los analistas y ha elevado su previsión para el próximo trimestre. Tras la noticia, el Nasdaq 100 ha recuperado las pérdidas de la semana anterior. Algunos gestores advierten de que las valoraciones del sector ya descuentan años de crecimiento.',
    meaning: 'Muchos fondos indexados al S&P 500 o al MSCI World tienen un peso alto en grandes tecnológicas. Tu cartera puede depender más de unas pocas empresas de lo que crees: revisa la composición de tus fondos.',
    sources_text: 'CNBC · Bloomberg',
    read_time_seconds: 40,
  },
  {
    category: 'Energía',
    headline: 'El Brent cae por debajo de 70 dólares ante la previsión de exceso de oferta',
    deck: 'La OPEP+ confirma que seguirá aumentando la producción mientras la demanda china se enfría.',
    body: 'El precio del barril de Brent ha bajado un 3 % en la semana. La Agencia Internacional de la Energía prevé que en 2027 la oferta mundial de crudo supere a la demanda, sobre todo por la menor actividad industrial en China y el auge del coche eléctrico. Las petroleras cotizadas, como Repsol, retroceden en bolsa.',
    meaning: 'Buena noticia para el bolsillo: la gasolina y el diésel deberían abaratarse en las próximas semanas. Y un petróleo más barato ayuda a contener la inflación, lo que da margen al BCE para bajar tipos.',
    sources_text: 'AIE · BBC Business · Expansión',
    read_time_seconds: 35,
  },
  {
    category: 'España',
    headline: 'El paro baja del 11 % por primera vez desde 2008',
    deck: 'La EPA del tercer trimestre refleja un récord de afiliados a la Seguridad Social y más contratos indefinidos.',
    body: 'Según la Encuesta de Población Activa, la tasa de paro se sitúa en el 10,8 %. El empleo crece sobre todo en servicios, tecnología y sanidad. Aun así, España sigue duplicando la media de desempleo de la eurozona y el paro juvenil continúa por encima del 25 %.',
    meaning: 'Más empleo significa más cotizantes y más consumo, dos pilares para el crecimiento y para las pensiones. Para ti, un mercado laboral fuerte suele traducirse en más poder de negociación salarial.',
    sources_text: 'INE · El País Economía',
    read_time_seconds: 35,
  },
  {
    category: 'Cripto',
    headline: 'Bitcoin supera los 100.000 dólares tras la entrada de grandes fondos',
    deck: 'Los ETF de bitcoin al contado registran su mejor mes de captación desde su lanzamiento.',
    body: 'La principal criptomoneda ha vuelto a superar la barrera psicológica de los 100.000 dólares. Los ETF al contado acumulan entradas netas récord este mes, mientras que la volatilidad sigue siendo muy superior a la de la bolsa tradicional.',
    meaning: 'Si te lo planteas, trátalo como una parte pequeña y opcional de tu cartera. Su precio puede caer un 50 % en meses: invierte solo lo que podrías ver bajar sin cambiar tus planes.',
    sources_text: 'CoinDesk · Financial Times',
    read_time_seconds: 35,
  },
  {
    category: 'España',
    headline: 'El precio de la vivienda sube un 9 % anual y la compraventa se modera',
    deck: 'El encarecimiento se concentra en Madrid, Málaga, Baleares y Valencia.',
    body: 'Los datos de notarios muestran que el precio medio sigue al alza mientras el número de operaciones empieza a estabilizarse. La falta de oferta de obra nueva mantiene la presión sobre precios y alquileres.',
    meaning: 'Comprar sigue siendo más caro cada año, pero la bajada de tipos abarata las hipotecas. Compara siempre la cuota con tus ingresos: los bancos recomiendan no superar el 30-35 %.',
    sources_text: 'Consejo General del Notariado · Idealista',
    read_time_seconds: 35,
  },
];

function uuidFromIndex(i) {
  const hex = (i + 1).toString(16).padStart(12, '0');
  return `0d3a0c4d-0000-4000-8000-${hex}`;
}

export function todayMadrid() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

export function allCards() {
  const edition = todayMadrid();
  return CARDS.map((c, i) => ({
    id: uuidFromIndex(i),
    ...c,
    primary_source_url: null,
    legal_tag: LEGAL_TAG,
    is_ai_generated: true,
    edition_date: edition,
    order_index: i,
    published_at: new Date().toISOString(),
  }));
}

export function feedPayload({ premium = false, category = '' } = {}) {
  const pool = allCards();
  let visible = premium ? [...pool] : pool.slice(0, FREE_CARD_LIMIT);
  if (category) visible = visible.filter((c) => c.category === category);
  return {
    date: todayMadrid(),
    cards: visible,
    plan_tier: premium ? 'premium' : 'free',
    free_limit: FREE_CARD_LIMIT,
    total_in_edition: pool.length,
    locked_count: premium ? 0 : Math.max(0, pool.length - FREE_CARD_LIMIT),
    edition_complete: premium || pool.length <= FREE_CARD_LIMIT,
    is_latest_edition: true,
    category_filter: category || null,
  };
}

const BASE_PRICES = {
  '^IBEX': 12845, '^GDAXI': 23410, '^FCHI': 7980, '^FTSE': 9120, '^GSPC': 6540, '^NDX': 23980,
  '^DJI': 45870, '^STOXX50E': 5510, '^RUT': 2390, '^N225': 44120, '^HSI': 26350, '^VIX': 15.8,
  'EURUSD=X': 1.1712, 'EURGBP=X': 0.8721, 'EURCHF=X': 0.9345, 'EURJPY=X': 173.42, 'EURCAD=X': 1.6215,
  'EURAUD=X': 1.7802, 'EURSEK=X': 10.994, 'EURNOK=X': 11.672, 'EURPLN=X': 4.2651, 'EURTRY=X': 48.41,
  'GC=F': 3745, 'SI=F': 44.2, 'BZ=F': 69.4, 'CL=F': 65.8, 'NG=F': 2.91, 'TTF=F': 31.6,
  'BTC-USD': 101250, 'ETH-USD': 4180, 'XRP-USD': 2.84, 'SOL-USD': 212.4, 'ADA-USD': 0.82,
  'DOGE-USD': 0.241, 'DOT-USD': 4.12, 'MATIC-USD': 0.27, 'LINK-USD': 21.6, 'LTC-USD': 108.3,
  'AVAX-USD': 29.4, 'ATOM-USD': 4.55,
  AAPL: 254.1, MSFT: 511.3, GOOGL: 246.8, AMZN: 221.5, NVDA: 187.2, META: 742.9, TSLA: 438.6,
  NFLX: 1212.4, JPM: 309.7, BAC: 50.9, XOM: 113.2, JNJ: 178.4, WMT: 102.6, KO: 67.1,
  SAN: 8.64, BBVA: 16.42, IBE: 16.08, REP: 14.21, ITX: 45.9, AENA: 23.7,
};

function seededRandom(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function walk(symbol, base, n, vol, salt = '') {
  const rnd = seededRandom(symbol + salt);
  const drift = (rnd() - 0.45) * vol * 0.4;
  const out = [];
  let p = base * (1 - drift * n * 0.5);
  for (let i = 0; i < n; i++) {
    p *= 1 + drift + (rnd() - 0.5) * vol;
    out.push(p);
  }
  const k = base / out[out.length - 1];
  return out.map((v) => v * k);
}

export function marketsPayload() {
  const flat = MARKETS_UNIVERSE.map((def) => {
    const base = BASE_PRICES[def.symbol] ?? 100;
    const vol = def.category === 'cripto' ? 0.02 : def.category === 'divisas' ? 0.002 : 0.008;
    const spark = walk(def.symbol, base, 24, vol);
    const change_pct = ((spark[spark.length - 1] - spark[0]) / spark[0]) * 100;
    return {
      symbol: def.symbol,
      name: def.name,
      description: def.description,
      category: def.category,
      tv: def.tv,
      price: base,
      change_pct: Math.round(change_pct * 100) / 100,
      sparkline: spark.map((v) => Math.round(v * 10000) / 10000),
      updated_at: new Date().toISOString(),
    };
  });
  const grouped = {};
  for (const m of flat) (grouped[m.category] ||= []).push(m);
  return {
    source: 'demo',
    disclaimer: `Modo demostración local: cotizaciones simuladas. ${UNIVERSE_DISCLAIMER}`,
    updated_at: new Date().toISOString(),
    grouped,
    flat,
  };
}

const RESOLUTION_SECONDS = { '15': 900, '60': 3600, D: 86400 };

export function candlesPayload(symbol, resolution, from, to) {
  const def = MARKETS_UNIVERSE.find((m) => m.symbol === symbol || m.tv === symbol);
  const sym = def?.symbol || symbol;
  const base = BASE_PRICES[sym] ?? 100;
  const step = RESOLUTION_SECONDS[resolution] || 3600;
  const n = Math.max(2, Math.min(400, Math.floor((to - from) / step)));
  const vol = def?.category === 'cripto' ? 0.012 : def?.category === 'divisas' ? 0.0015 : 0.005;
  const closes = walk(sym, base, n + 1, vol, `:${resolution}`);
  const rnd = seededRandom(`${sym}:wicks:${resolution}`);
  const candles = [];
  for (let i = 1; i <= n; i++) {
    const open = closes[i - 1];
    const close = closes[i];
    const hi = Math.max(open, close) * (1 + rnd() * vol * 0.6);
    const lo = Math.min(open, close) * (1 - rnd() * vol * 0.6);
    candles.push({
      time: to - (n - i) * step,
      open, high: hi, low: lo, close,
      volume: Math.round(1e5 + rnd() * 9e5),
    });
  }
  return {
    ok: true,
    status: 'ok',
    candles,
    symbol: sym,
    source: 'demo',
    attribution: 'Modo demostración local: velas simuladas.',
  };
}
