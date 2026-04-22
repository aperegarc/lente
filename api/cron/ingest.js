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

  // 3. Encadenar con generación automáticamente
  const deploymentUrl = getDeploymentUrl(req);
  const nextUrl = `${deploymentUrl}/api/cron/generate`;

  // Fire-and-forget: no bloqueamos la respuesta esperando a generate
  fetch(nextUrl, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(err => {
    console.error('[ingest] Could not chain to /generate:', err.message);
  });

  console.log(`[ingest] Done. ${results.articles_new} new articles across ${results.sources_processed} sources`);
  return res.status(200).json({
    ok: true,
    ...results,
    next_step: 'generate triggered',
  });
}
