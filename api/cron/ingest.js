// ============================================================
// /api/cron/ingest.js
// Ingestión RSS — se ejecuta vía Vercel Cron + trigger manual
// ============================================================

import Parser from 'rss-parser';
import { getSupabaseAdmin, isValidCronRequest, getDeploymentUrl } from '../_lib/clients.js';

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
  console.log('[ingest] SUPABASE_URL:', process.env.SUPABASE_URL?.substring(0, 20) + '...');
  console.log('[ingest] SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY?.substring(0, 20) + '...');

  // 1. Obtener fuentes activas
  const { data: sources, error: srcErr } = await supabase
    .from('sources')
    .select('*')
    .eq('active', true);

  if (srcErr) {
    console.error('[ingest] Could not load sources:', srcErr);
    return res.status(500).json({
      error: 'Could not load sources',
      hint: '¿Has ejecutado schema.sql en Supabase? Comprueba que existe la tabla "sources" con filas',
      details: srcErr.message,
    });
  }

  if (!sources || sources.length === 0) {
    return res.status(500).json({
      error: 'No hay fuentes activas',
      hint: 'Ejecuta schema.sql en Supabase para cargar las fuentes por defecto',
    });
  }

  const results = {
    sources_processed: 0,
    articles_new: 0,
    errors: [],
  };

  // 2. Procesar cada fuente
  for (const source of sources) {
    try {
      console.log(`[ingest] Fetching ${source.name}...`);
      const feed = await parser.parseURL(source.url);

      const items = (feed.items || [])
        .filter(isRelevant)
        .slice(0, 30);

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

      console.log(`[ingest] Intentando upsert de ${rows.length} items para ${source.name}...`);
      const { error: insErr, count } = await supabase
        .from('articles')
        .upsert(rows, { onConflict: 'link', ignoreDuplicates: true, count: 'exact' });

      if (insErr) {
        console.error(`[ingest] ✗ Upsert error para ${source.name}:`, insErr);
        throw insErr;
      }

      console.log(`[ingest] ✓ Upsert completado: ${rows.length} items enviados, count=${count}`);
      results.articles_new += count || 0;
      results.sources_processed++;
      console.log(`[ingest] ✓ ${source.name}: ${rows.length} items, ${count || 0} nuevos`);
    } catch (err) {
      console.error(`[ingest] ✗ ${source.name}:`, err.message);
      results.errors.push({ source: source.name, error: err.message });
    }
  }

  // 3. Encadenar con generate — ✅ await para que Vercel no mate el proceso
  const deploymentUrl = getDeploymentUrl(req);
  const nextUrl = `${deploymentUrl}/api/cron/generate`;

  console.log('[ingest] Encadenando con generate...');
  try {
    const genResponse = await fetch(nextUrl, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const genData = await genResponse.json();
    console.log(`[ingest] generate respondió (${genResponse.status}):`, genData);

    return res.status(200).json({
      ok: true,
      ...results,
      generate: genData,
    });
  } catch (err) {
    console.error('[ingest] Error llamando a generate:', err.message);
    return res.status(200).json({
      ok: true,
      ...results,
      generate_error: err.message,
    });
  }
}