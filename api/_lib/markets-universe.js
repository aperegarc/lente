// Catálogo amplio para la vista «Mercados» (referencia educativa).
// Cotizaciones en vivo: Supabase cuando existan; divisas vía Frankfurter (ECB);
// cripto vía CoinGecko API pública (sin clave en tier gratuito básico).

export const UNIVERSE_DISCLAIMER =
  'Divisas: tipos de referencia (ECB, Frankfurter). Cripto: CoinGecko. Índices y acciones: datos cuando la base los tiene actualizados; el gráfico es orientativo (TradingView). No es asesoramiento financiero.';

/** @typedef {{ symbol: string, name: string, description: string, category: string, tv: string, coingeckoId?: string, frankfurterTo?: string }} UniverseRow */

/** @type {UniverseRow[]} */
export const MARKETS_UNIVERSE = [
  // --- Índices ---
  { symbol: '^IBEX', name: 'IBEX 35', description: 'España · blue chips', category: 'indices', tv: 'IBEX:IBEX' },
  { symbol: '^GDAXI', name: 'DAX', description: 'Alemania', category: 'indices', tv: 'XETR:DAX' },
  { symbol: '^FCHI', name: 'CAC 40', description: 'Francia', category: 'indices', tv: 'EURONEXT:PX1' },
  { symbol: '^FTSE', name: 'FTSE 100', description: 'Reino Unido', category: 'indices', tv: 'FOREXCOM:UK100' },
  { symbol: '^GSPC', name: 'S&P 500', description: 'EE.UU. · 500 valores', category: 'indices', tv: 'FOREXCOM:SPX500' },
  { symbol: '^NDX', name: 'Nasdaq 100', description: 'EE.UU. · tecnología', category: 'indices', tv: 'NASDAQ:NDX' },
  { symbol: '^DJI', name: 'Dow Jones', description: 'EE.UU. · industriales', category: 'indices', tv: 'DJ:DJI' },
  { symbol: '^STOXX50E', name: 'Euro Stoxx 50', description: 'Eurozona', category: 'indices', tv: 'STOXX:STOXX50E' },
  { symbol: '^RUT', name: 'Russell 2000', description: 'EE.UU. · small cap', category: 'indices', tv: 'FOREXCOM:RUS2000' },
  { symbol: '^N225', name: 'Nikkei 225', description: 'Japón', category: 'indices', tv: 'INDEX:NKY' },
  { symbol: '^HSI', name: 'Hang Seng', description: 'Hong Kong', category: 'indices', tv: 'HSI:HSI' },
  { symbol: '^VIX', name: 'VIX', description: 'Volatilidad implícita S&P', category: 'indices', tv: 'CBOE:VIX' },

  // --- Divisas (EUR vs divisa; datos Frankfurter / ECB) ---
  { symbol: 'EURUSD=X', name: 'EUR / USD', description: 'Euro vs dólar', category: 'divisas', tv: 'FX:EURUSD', frankfurterTo: 'USD' },
  { symbol: 'EURGBP=X', name: 'EUR / GBP', description: 'Euro vs libra', category: 'divisas', tv: 'FX:EURGBP', frankfurterTo: 'GBP' },
  { symbol: 'EURCHF=X', name: 'EUR / CHF', description: 'Euro vs franco', category: 'divisas', tv: 'FX:EURCHF', frankfurterTo: 'CHF' },
  { symbol: 'EURJPY=X', name: 'EUR / JPY', description: 'Euro vs yen', category: 'divisas', tv: 'FX:EURJPY', frankfurterTo: 'JPY' },
  { symbol: 'EURCAD=X', name: 'EUR / CAD', description: 'Euro vs dólar canadiense', category: 'divisas', tv: 'FX:EURCAD', frankfurterTo: 'CAD' },
  { symbol: 'EURAUD=X', name: 'EUR / AUD', description: 'Euro vs dólar australiano', category: 'divisas', tv: 'FX:EURAUD', frankfurterTo: 'AUD' },
  { symbol: 'EURSEK=X', name: 'EUR / SEK', description: 'Euro vs corona sueca', category: 'divisas', tv: 'FX:EURSEK', frankfurterTo: 'SEK' },
  { symbol: 'EURNOK=X', name: 'EUR / NOK', description: 'Euro vs corona noruega', category: 'divisas', tv: 'FX:EURNOK', frankfurterTo: 'NOK' },
  { symbol: 'EURPLN=X', name: 'EUR / PLN', description: 'Euro vs zloty', category: 'divisas', tv: 'FX:EURPLN', frankfurterTo: 'PLN' },
  { symbol: 'EURTRY=X', name: 'EUR / TRY', description: 'Euro vs lira turca', category: 'divisas', tv: 'FX:EURTRY', frankfurterTo: 'TRY' },

  // --- Materias primas (cotización si está en DB / cron) ---
  { symbol: 'GC=F', name: 'Oro', description: 'Futuro oro · USD/onza', category: 'materias', tv: 'FOREXCOM:XAUUSD' },
  { symbol: 'SI=F', name: 'Plata', description: 'Futuro plata · USD/onza', category: 'materias', tv: 'COMEX:SI1!' },
  { symbol: 'BZ=F', name: 'Petróleo Brent', description: 'USD/barril', category: 'materias', tv: 'NYMEX:CL1!' },
  { symbol: 'CL=F', name: 'WTI', description: 'Crudo EE.UU.', category: 'materias', tv: 'NYMEX:CL1!' },
  { symbol: 'NG=F', name: 'Gas natural', description: 'Henry Hub', category: 'materias', tv: 'NYMEX:NG1!' },
  { symbol: 'TTF=F', name: 'Gas TTF', description: 'Referencia Europa · EUR/MWh', category: 'materias', tv: 'SKILLING:NATURALGAS' },

  // --- Cripto (CoinGecko vs EUR) ---
  { symbol: 'BTC-USD', name: 'Bitcoin', description: 'BTC · referencia', category: 'cripto', tv: 'BINANCE:BTCUSDT', coingeckoId: 'bitcoin' },
  { symbol: 'ETH-USD', name: 'Ethereum', description: 'ETH · referencia', category: 'cripto', tv: 'BINANCE:ETHUSDT', coingeckoId: 'ethereum' },
  { symbol: 'XRP-USD', name: 'XRP', description: 'Ripple', category: 'cripto', tv: 'BINANCE:XRPUSDT', coingeckoId: 'ripple' },
  { symbol: 'SOL-USD', name: 'Solana', description: 'SOL', category: 'cripto', tv: 'BINANCE:SOLUSDT', coingeckoId: 'solana' },
  { symbol: 'ADA-USD', name: 'Cardano', description: 'ADA', category: 'cripto', tv: 'BINANCE:ADAUSDT', coingeckoId: 'cardano' },
  { symbol: 'DOGE-USD', name: 'Dogecoin', description: 'DOGE', category: 'cripto', tv: 'BINANCE:DOGEUSDT', coingeckoId: 'dogecoin' },
  { symbol: 'DOT-USD', name: 'Polkadot', description: 'DOT', category: 'cripto', tv: 'BINANCE:DOTUSDT', coingeckoId: 'polkadot' },
  { symbol: 'MATIC-USD', name: 'Polygon', description: 'MATIC', category: 'cripto', tv: 'BINANCE:MATICUSDT', coingeckoId: 'polygon-ecosystem-token' },
  { symbol: 'LINK-USD', name: 'Chainlink', description: 'LINK', category: 'cripto', tv: 'BINANCE:LINKUSDT', coingeckoId: 'chainlink' },
  { symbol: 'LTC-USD', name: 'Litecoin', description: 'LTC', category: 'cripto', tv: 'BINANCE:LTCUSDT', coingeckoId: 'litecoin' },
  { symbol: 'AVAX-USD', name: 'Avalanche', description: 'AVAX', category: 'cripto', tv: 'BINANCE:AVAXUSDT', coingeckoId: 'avalanche-2' },
  { symbol: 'ATOM-USD', name: 'Cosmos', description: 'ATOM', category: 'cripto', tv: 'BINANCE:ATOMUSDT', coingeckoId: 'cosmos' },

  // --- Renta variable (EE.UU. y España; precio si está en DB) ---
  { symbol: 'AAPL', name: 'Apple', description: 'NASDAQ', category: 'acciones', tv: 'NASDAQ:AAPL' },
  { symbol: 'MSFT', name: 'Microsoft', description: 'NASDAQ', category: 'acciones', tv: 'NASDAQ:MSFT' },
  { symbol: 'GOOGL', name: 'Alphabet A', description: 'NASDAQ', category: 'acciones', tv: 'NASDAQ:GOOGL' },
  { symbol: 'AMZN', name: 'Amazon', description: 'NASDAQ', category: 'acciones', tv: 'NASDAQ:AMZN' },
  { symbol: 'NVDA', name: 'NVIDIA', description: 'NASDAQ', category: 'acciones', tv: 'NASDAQ:NVDA' },
  { symbol: 'META', name: 'Meta', description: 'NASDAQ', category: 'acciones', tv: 'NASDAQ:META' },
  { symbol: 'TSLA', name: 'Tesla', description: 'NASDAQ', category: 'acciones', tv: 'NASDAQ:TSLA' },
  { symbol: 'NFLX', name: 'Netflix', description: 'NASDAQ', category: 'acciones', tv: 'NASDAQ:NFLX' },
  { symbol: 'JPM', name: 'JPMorgan', description: 'NYSE', category: 'acciones', tv: 'NYSE:JPM' },
  { symbol: 'BAC', name: 'Bank of America', description: 'NYSE', category: 'acciones', tv: 'NYSE:BAC' },
  { symbol: 'XOM', name: 'ExxonMobil', description: 'NYSE', category: 'acciones', tv: 'NYSE:XOM' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', description: 'NYSE', category: 'acciones', tv: 'NYSE:JNJ' },
  { symbol: 'WMT', name: 'Walmart', description: 'NYSE', category: 'acciones', tv: 'NYSE:WMT' },
  { symbol: 'KO', name: 'Coca-Cola', description: 'NYSE', category: 'acciones', tv: 'NYSE:KO' },
  { symbol: 'SAN', name: 'Banco Santander', description: 'BME', category: 'acciones', tv: 'BME:SAN' },
  { symbol: 'BBVA', name: 'BBVA', description: 'BME', category: 'acciones', tv: 'BME:BBVA' },
  { symbol: 'IBE', name: 'Iberdrola', description: 'BME', category: 'acciones', tv: 'BME:IBE' },
  { symbol: 'REP', name: 'Repsol', description: 'BME', category: 'acciones', tv: 'BME:REP' },
  { symbol: 'ITX', name: 'Inditex', description: 'BME', category: 'acciones', tv: 'BME:ITX' },
  { symbol: 'AENA', name: 'Aena', description: 'BME', category: 'acciones', tv: 'BME:AENA' },
];
