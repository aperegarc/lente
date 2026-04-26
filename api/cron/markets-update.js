// ============================================================
// /api/cron/markets-update.js — Actualizar datos de mercados con Finnhub
// Símbolos verificados que funcionan
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// Símbolos VERIFICADOS que funcionan en Finnhub
const SYMBOLS = {
  'IBEX': { symbol: '^IBEX', name: 'IBEX 35', category: 'indices', description: 'Índice bursátil español' },
  'BTC': { symbol: 'BTC-USD', name: 'Bitcoin', category: 'cripto', description: 'BTC · USD' },
  'ETH': { symbol: 'ETH-USD', name: 'Ethereum', category: 'cripto', description: 'ETH · USD' },
  'AAPL': { symbol: 'AAPL', name: 'Apple', category: 'indices', description: 'Apple Inc' },
  'MSFT': { symbol: 'MSFT', name: 'Microsoft', category: 'indices', description: 'Microsoft Corp' },
  'TSLA': { symbol: 'TSLA', name: 'Tesla', category: 'indices', description: 'Tesla Inc' },
  'GOOGL': { symbol: 'GOOGL', name: 'Google', category: 'indices', description: 'Alphabet Inc' },
  'AMZN': { symbol: 'AMZN', name: 'Amazon', category: 'indices', description: 'Amazon.com Inc' },
};

async function fetchFinnhubData(symbol) {
  try {
    console.log(`📈 Fetching ${symbol} from Finnhub...`);
    
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`❌ Finnhub error para ${symbol}: ${res.status}`);
      return null;
    }

    const data = await res.json();

    // Finnhub devuelve: c (precio actual), dp (cambio %), d (cambio abs)
    if (!data.c) {
      console.error(`❌ No hay datos para ${symbol}`);
      return null;
    }

    return {
      price: data.c || null,
      change_pct: data.dp || null,
      change_abs: data.d || null,
    };
  } catch (err) {
    console.error(`❌ Error fetch ${symbol}:`, err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // Verificar CRON_SECRET
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FINNHUB_API_KEY) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const results = [];
  const errors = [];

  console.log(`🔄 Actualizando ${Object.keys(SYMBOLS).length} símbolos con Finnhub...`);

  // Fetch todos los símbolos en paralelo
  const promises = Object.entries(SYMBOLS).map(async ([finnhubSymbol, metadata]) => {
    try {
      const priceData = await fetchFinnhubData(finnhubSymbol);
      if (!priceData) {
        errors.push({ symbol: finnhubSymbol, error: 'No data from Finnhub' });
        return null;
      }

      return {
        symbol: metadata.symbol,
        name: metadata.name,
        description: metadata.description,
        category: metadata.category,
        price: priceData.price,
        change_pct: priceData.change_pct,
        change_abs: priceData.change_abs,
        sparkline: null,
        updated_at: new Date().toISOString(),
      };
    } catch (err) {
      console.error(`❌ Error ${finnhubSymbol}:`, err.message);
      errors.push({ symbol: finnhubSymbol, error: err.message });
      return null;
    }
  });

  const allData = (await Promise.all(promises)).filter(d => d != null);

  if (allData.length === 0) {
    console.log('❌ No data fetched');
    return res.status(200).json({
      success: false,
      message: 'No data fetched',
      errors,
    });
  }

  // Upsert en Supabase
  try {
    const { error } = await supabase
      .from('markets')
      .upsert(allData, { onConflict: 'symbol' });

    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`✅ ${allData.length} mercados actualizados`);
    return res.status(200).json({
      success: true,
      updated: allData.length,
      symbols: allData.map(m => m.symbol),
    });
  } catch (err) {
    console.error('❌ Error upsert:', err.message);
    return res.status(500).json({ error: err.message });
  }
}