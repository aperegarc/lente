// ============================================================
// /api/cron/ingest.js
// Ingestión RSS — se ejecuta vía Vercel Cron 2 veces al día
// ============================================================
// Configurado en vercel.json para correr a las 06:00 y 14:00 UTC
// ============================================================

import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service key: acceso admin, bypasea RLS
);

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'lente-bot/1.0' },
});

// Palabras clave para descartar artículos irrelevantes
const BLOCKLIST = [
  'horóscopo', 'fútbol', 'receta', 'gossip', 'famoso',
  'netflix', 'serie', 'película', 'cine',
];

function isRelevant(article) {
  const text = `${article.title} ${article.contentSnippet || ''}`.toLowerCase();
  return !BLOCKLIST.some(kw => text.includes(kw));
}

export default async function handler(req, res) {
  // Protección: solo Vercel Cron puede llamar esto
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[ingest] Starting RSS ingestion...');

  // 1. Obtener fuentes activas
  const { data: sources, error: srcErr } = await supabase
    .from('sources')
    .select('*')
    .eq('active', true);

  if (srcErr) {
    return res.status(500).json({ error: 'Could not load sources', details: srcErr });
  }

  const results = {
    sources_processed: 0,
    articles_new: 0,
    articles_skipped: 0,
    errors: [],
  };

  // 2. Procesar cada fuente en paralelo (limitado)
  for (const source of sources) {
    try {
      console.log(`[ingest] Fetching ${source.name}...`);
      const feed = await parser.parseURL(source.url);

      const items = feed.items
        .filter(isRelevant)
        .slice(0, 30);  // máx 30 por fuente por ejecución

      const rows = items.map(item => ({
        source_id: source.id,
        source_name: source.name,
        title: item.title?.trim() || 'Sin título',
        snippet: (item.contentSnippet || item.content || '').trim().slice(0, 500),
        link: item.link,
        pub_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      })).filter(r => r.link);

      // Upsert por link (ignora duplicados)
      const { error: insErr, count } = await supabase
        .from('articles')
        .upsert(rows, { onConflict: 'link', ignoreDuplicates: true, count: 'exact' });

      if (insErr) throw insErr;

      results.articles_new += count || rows.length;
      results.sources_processed++;
      console.log(`[ingest] ✓ ${source.name}: ${rows.length} items`);
    } catch (err) {
      console.error(`[ingest] ✗ ${source.name}:`, err.message);
      results.errors.push({ source: source.name, error: err.message });
    }
  }

  // 3. Después de ingestar, lanzamos el clustering+generación
  //    mediante una llamada a la siguiente función de la cadena
  const next = `${process.env.DEPLOYMENT_URL}/api/cron/generate`;
  fetch(next, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(err => console.error('[ingest] Could not chain to /generate:', err));

  return res.status(200).json(results);
}
