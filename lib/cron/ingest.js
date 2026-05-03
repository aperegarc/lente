// ============================================================
// lib/cron/ingest.js — invocado solo vía /api/crons?job=ingest
// ============================================================

import Parser from 'rss-parser';
import { getSupabaseAdmin, isValidCronRequest, getDeploymentUrl } from '../../api/_lib/clients.js';

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'lente-bot/1.0' },
});

const BLOCKLIST = [
  'horóscopo', 'fútbol', 'receta', 'gossip', 'famoso',
  'netflix', 'serie', 'película', 'cine',
];

function isRelevant(article) {
  const text = `${article.title || ''} ${article.contentSnippet || ''}`.toLowerCase();
  return !BLOCKLIST.some(kw => text.includes(kw));
}

function isRelevantFinnhub(item) {
  const fake = {
    title: item.headline || '',
    contentSnippet: item.summary || '',
  };
  return isRelevant(fake);
}

/** Noticias de mercado Finnhub (misma tabla `articles`, dedupe por `link`). */
async function ingestFinnhub(token, supabase, results) {
  const categories = ['general', 'forex'];
  const seen = new Set();
  const rows = [];

  for (const category of categories) {
    const apiUrl = `https://finnhub.io/api/v1/news?category=${encodeURIComponent(category)}&token=${encodeURIComponent(token)}`;
    const r = await fetch(apiUrl);
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
    }
    const items = await r.json();
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      const link = (item.url || '').trim();
      if (!link || seen.has(link)) continue;
      seen.add(link);
      if (!isRelevantFinnhub(item)) continue;

      const pubTs = item.datetime;
      const pubDate = typeof pubTs === 'number'
        ? new Date(pubTs * 1000).toISOString()
        : new Date().toISOString();

      rows.push({
        source_id: null,
        source_name: item.source ? `${item.source} (Finnhub)` : 'Finnhub',
        title: (item.headline || 'Sin título').trim(),
        snippet: (item.summary || '').trim().slice(0, 500),
        link,
        pub_date: pubDate,
      });
    }
  }

  if (rows.length === 0) {
    console.log('[ingest] Finnhub: sin artículos nuevos tras filtrar');
    results.finnhub = { items: 0, new: 0 };
    return;
  }

  const { error: insErr, count } = await supabase
    .from('articles')
    .upsert(rows, { onConflict: 'link', ignoreDuplicates: true, count: 'exact' });

  if (insErr) throw insErr;

  results.articles_new += count || 0;
  results.finnhub = { items: rows.length, new: count || 0 };
  console.log(`[ingest] ✓ Finnhub: ${rows.length} items, ${count || 0} nuevos`);
}

export default async function handler(req, res) {
  if (!isValidCronRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized — falta o es inválido el Bearer token' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return res.status(500).json({ error: 'Config error', details: err.message });
  }

  console.log('[ingest] Starting RSS ingestion...');

  // 1. Obtener fuentes activas
  const { data: sources, error: srcErr } = await supabase
    .from('sources')
    .select('*')
    .eq('active', true);

  if (srcErr) {
    console.error('[ingest] Could not load sources:', srcErr);
    return res.status(500).json({
      error: 'Could not load sources',
      hint: '¿Has ejecutado schema.sql en Supabase? Comprueba que existe la tabla "sources"',
      details: srcErr.message,
    });
  }

  if (!sources || sources.length === 0) {
    return res.status(500).json({
      error: 'No hay fuentes activas',
      hint: 'Ejecuta schema.sql en Supabase para cargar las fuentes por defecto',
    });
  }

  const results = { sources_processed: 0, articles_new: 0, errors: [] };

  // 2. Procesar cada fuente
  for (const source of sources) {
    try {
      console.log(`[ingest] Fetching ${source.name}...`);
      const feed = await parser.parseURL(source.url);

      const items = (feed.items || []).filter(isRelevant).slice(0, 30);

      const rows = items.map(item => ({
        source_id: source.id,
        source_name: source.name,
        title: item.title?.trim() || 'Sin título',
        snippet: (item.contentSnippet || item.content || '').trim().slice(0, 500),
        link: item.link,
        pub_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      })).filter(r => r.link);

      if (rows.length === 0) {
        console.log(`[ingest] ${source.name}: sin items relevantes`);
        results.sources_processed++;
        continue;
      }

      const { error: insErr, count } = await supabase
        .from('articles')
        .upsert(rows, { onConflict: 'link', ignoreDuplicates: true, count: 'exact' });

      if (insErr) throw insErr;

      results.articles_new += count || 0;
      results.sources_processed++;
      console.log(`[ingest] ✓ ${source.name}: ${rows.length} items, ${count || 0} nuevos`);
    } catch (err) {
      console.error(`[ingest] ✗ ${source.name}:`, err.message);
      results.errors.push({ source: source.name, error: err.message });
    }
  }

  // 2b. Finnhub (opcional; clave solo en servidor)
  const finnhubKey = process.env.FINNHUB_API_KEY?.trim();
  if (finnhubKey && !finnhubKey.includes('...')) {
    try {
      console.log('[ingest] Fetching Finnhub...');
      await ingestFinnhub(finnhubKey, supabase, results);
    } catch (err) {
      console.error('[ingest] ✗ Finnhub:', err.message);
      results.errors.push({ source: 'Finnhub', error: err.message });
    }
  } else {
    console.log('[ingest] Finnhub omitido (FINNHUB_API_KEY no configurada)');
  }

  // 3. Encadenar con generate — await para que Vercel no mate el proceso
  const nextUrl = `${getDeploymentUrl(req)}/api/crons?job=generate`;
  console.log('[ingest] Encadenando con generate...');

  try {
    const genResponse = await fetch(nextUrl, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const genData = await genResponse.json();
    console.log(`[ingest] generate respondió (${genResponse.status}):`, genData);

    return res.status(200).json({ ok: true, ...results, generate: genData });
  } catch (err) {
    console.error('[ingest] Error llamando a generate:', err.message);
    return res.status(200).json({ ok: true, ...results, generate_error: err.message });
  }
}