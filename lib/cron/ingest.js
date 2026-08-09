// ============================================================
// lib/cron/ingest.js — invocado solo vía /api/crons?job=ingest
// Solo fuentes RSS configuradas en Supabase (sin APIs de noticias de pago)
// ============================================================

import Parser from 'rss-parser';
import {
  getSupabaseAdmin,
  isValidCronRequest,
  asCronRequest,
  createJsonRes,
} from '../../api/_lib/clients.js';

const parser = new Parser({
  timeout: 10000,
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

/** Evita que un feed colgado bloquee todo el job. */
function fetchFeed(url) {
  return Promise.race([
    parser.parseURL(url),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout RSS (10s)')), 12000);
    }),
  ]);
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

  const skipGenerate =
    req.query?.skipGenerate === '1' ||
    req.query?.skipGenerate === true ||
    req.headers?.['x-lente-skip-generate'] === '1';

  console.log('[ingest] Starting RSS ingestion...', skipGenerate ? '(sin generate)' : '(con generate)');

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

  for (const source of sources) {
    try {
      console.log(`[ingest] Fetching ${source.name}...`);
      const feed = await fetchFeed(source.url);

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

  console.log(`[ingest] RSS listo: ${results.sources_processed} fuentes, ${results.articles_new} nuevos`);

  if (skipGenerate) {
    return res.status(200).json({
      ok: true,
      ...results,
      generate: null,
      skipped_generate: true,
    });
  }

  console.log('[ingest] Encadenando con generate (in-process)...');

  try {
    const { default: generate } = await import('./generate.js');
    const { res: genRes, out } = createJsonRes();
    await generate(asCronRequest(req, 'generate'), genRes);
    console.log(`[ingest] generate respondió (${out.statusCode}):`, out.body);

    return res.status(200).json({
      ok: true,
      ...results,
      generate: out.body,
      generate_status: out.statusCode,
    });
  } catch (err) {
    console.error('[ingest] Error llamando a generate:', err.message);
    return res.status(200).json({ ok: true, ...results, generate_error: err.message });
  }
}
