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
import { isInMadridToday, madridTodayWindow } from '../../api/_lib/madrid-day.js';

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

/** Fecha del ítem RSS; sin pubDate/isoDate válidos → null (no se inventa «ahora»). */
function parseItemDate(item) {
  const raw = item.isoDate || item.pubDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
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

  const now = new Date();
  const { ymd, timeZone } = madridTodayWindow(now);
  const results = {
    sources_processed: 0,
    articles_new: 0,
    articles_skipped_no_date: 0,
    articles_skipped_not_today: 0,
    errors: [],
    calendar: { timeZone, ymd },
  };

  console.log(`[ingest] Ventana de hoy ${timeZone} ${ymd} (00:00 → ahora)`);

  for (const source of sources) {
    try {
      console.log(`[ingest] Fetching ${source.name}...`);
      const feed = await fetchFeed(source.url);

      const items = (feed.items || []).filter(isRelevant).slice(0, 30);
      const rows = [];
      let skippedNoDate = 0;
      let skippedNotToday = 0;

      for (const item of items) {
        const link = (item.link || '').trim();
        if (!link) continue;
        const pub = parseItemDate(item);
        if (!pub) {
          skippedNoDate++;
          continue;
        }
        if (!isInMadridToday(pub, now)) {
          skippedNotToday++;
          continue;
        }
        rows.push({
          source_id: source.id,
          source_name: source.name,
          title: item.title?.trim() || 'Sin título',
          snippet: (item.contentSnippet || item.content || '').trim().slice(0, 500),
          link,
          pub_date: pub.toISOString(),
        });
      }

      results.articles_skipped_no_date += skippedNoDate;
      results.articles_skipped_not_today += skippedNotToday;

      if (rows.length === 0) {
        console.log(
          `[ingest] ${source.name}: sin items de hoy`
            + (skippedNoDate || skippedNotToday
              ? ` (omitidos: ${skippedNoDate} sin fecha, ${skippedNotToday} no de hoy)`
              : ''),
        );
        results.sources_processed++;
        continue;
      }

      const { error: insErr, count } = await supabase
        .from('articles')
        .upsert(rows, { onConflict: 'link', ignoreDuplicates: true, count: 'exact' });

      if (insErr) throw insErr;

      results.articles_new += count || 0;
      results.sources_processed++;
      console.log(
        `[ingest] ✓ ${source.name}: ${rows.length} de hoy, ${count || 0} nuevos`
          + (skippedNoDate || skippedNotToday
            ? ` (omitidos: ${skippedNoDate} sin fecha, ${skippedNotToday} no de hoy)`
            : ''),
      );
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
