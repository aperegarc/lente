// ============================================================
// /api/cron/generate.js
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin, isValidCronRequest } from '../_lib/clients.js';

const SYSTEM_PROMPT = `Eres el editor jefe de lente, una app de noticias económicas diarias para inversores pasivos españoles que quieren entender el mundo en 5 minutos.

TU LECTOR:
- Invierte de forma pasiva (fondos indexados, ETFs)
- No sigue CNBC. No sabe qué es un punto básico
- Quiere entender el PORQUÉ de los movimientos, no solo los datos
- Le interesa cómo le afecta a su hipoteca, ahorros, pensión

Para cada tema que te pase, responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks) con esta estructura:

{
  "category": "Política monetaria | Materias primas | Macro Europa | Bolsa | Cripto | Energía | España | Tech | Geopolítica",
  "headline": "Máximo 12 palabras. UNA palabra rodeada de <em></em> para énfasis.",
  "deck": "Resumen de 1-2 frases que despeja la pregunta del titular.",
  "body": "Máximo 80 palabras. Explica QUÉ ha pasado y POR QUÉ. Sin jerga.",
  "meaning": "Máximo 60 palabras. Siempre conecta con hipoteca/ahorro/inversión española.",
  "read_time_seconds": 30-60,
  "sources_text": "Medio1 · Medio2 · Medio3"
}

REGLAS:
- Nunca recomiendes comprar o vender nada. Explica, no asesores.
- Si aparece un término técnico (Euríbor, inflación subyacente), explícalo en una línea.
- Conecta siempre con el contexto español: Euríbor, hipotecas variables, ahorro en depósitos, planes de pensiones.
- NUNCA inventes cifras. Si no estás seguro de un dato, omítelo.
- Responde SOLO con el JSON, nada más.`;

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function clusterArticles(articles, threshold = 0.78) {
  const clusters = [];
  for (const art of articles) {
    if (!art.embedding) continue;
    const emb = Array.isArray(art.embedding) ? art.embedding : JSON.parse(art.embedding);

    let matched = null;
    for (const c of clusters) {
      const sim = cosineSim(emb, c.centroid);
      if (sim > threshold) { matched = c; break; }
    }

    if (matched) {
      matched.articles.push({ ...art, embedding: emb });
      for (let i = 0; i < matched.centroid.length; i++) {
        matched.centroid[i] =
          (matched.centroid[i] * (matched.articles.length - 1) + emb[i])
          / matched.articles.length;
      }
    } else {
      clusters.push({
        centroid: [...emb],
        articles: [{ ...art, embedding: emb }],
      });
    }
  }
  return clusters;
}

function detectTopic(titles) {
  const text = titles.join(' ').toLowerCase();
  const rules = [
    { topic: 'Política monetaria', kw: ['fed', 'powell', 'federal reserve', 'tipos de interés', 'interest rate'] },
    { topic: 'Macro Europa',       kw: ['bce', 'ecb', 'eurozone', 'eurozona', 'lagarde', 'eurostat'] },
    { topic: 'Materias primas',    kw: ['gold', 'oro', 'oil', 'petróleo', 'brent', 'gas'] },
    { topic: 'Cripto',             kw: ['bitcoin', 'btc', 'ethereum', 'cripto', 'crypto'] },
    { topic: 'Tech',               kw: ['nvidia', 'meta', 'google', 'apple', 'microsoft', 'ai', 'tecnol'] },
    { topic: 'España',             kw: ['ibex', 'euríbor', 'euribor', 'banco de españa', 'españa'] },
    { topic: 'Energía',            kw: ['oil', 'petróleo', 'gas', 'electricidad'] },
    { topic: 'Geopolítica',        kw: ['war', 'guerra', 'israel', 'ucrania', 'china', 'eeuu', 'tarifas'] },
  ];
  for (const r of rules) {
    if (r.kw.some(k => text.includes(k))) return r.topic;
  }
  return 'Macro';
}

export default async function handler(req, res) {
  if (!isValidCronRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.VOYAGE_API_KEY) {
    return res.status(500).json({ error: 'VOYAGE_API_KEY no configurada' });
  }
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('...')) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY no configurada',
      hint: 'Consigue una key en https://console.anthropic.com/settings/keys',
    });
  }

  let supabase, claude;
  try {
    supabase = getSupabaseAdmin();
    claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
  } catch (err) {
    return res.status(500).json({ error: 'Config error', details: err.message });
  }

  console.log('[generate] Starting generation pipeline...');

  // ============================================================
  // 1. Artículos sin embedding — SIN filtro de fecha
  // ============================================================
  const { data: pending, error: pendErr } = await supabase
    .from('articles')
    .select('id, title, snippet, pub_date')
    .is('embedding', null)
    .order('pub_date', { ascending: false })
    .limit(300);

  if (pendErr) {
    console.error('[generate] Error loading pending:', pendErr);
    return res.status(500).json({ error: pendErr.message });
  }

  console.log(`[generate] ${pending?.length ?? 0} artículos sin embedding`);
  if (pending?.length > 0) {
    console.log('[generate] Muestra pub_dates:', pending.slice(0, 3).map(a => a.pub_date));
  }

  // ============================================================
  // 2. Generar embeddings con Voyage AI
  // ============================================================
  if (pending && pending.length > 0) {
    try {
      const texts = pending.map(a => `${a.title}. ${a.snippet || ''}`.slice(0, 2000));

      const batches = [];
      for (let i = 0; i < texts.length; i += 128) {
        batches.push(texts.slice(i, i + 128));
      }

      const embeddings = [];
      for (const batch of batches) {
        const voyageRes = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
          },
          body: JSON.stringify({ model: 'voyage-3-lite', input: batch }),
        });
        const data = await voyageRes.json();
        if (!voyageRes.ok) throw new Error(data.detail || JSON.stringify(data));
        embeddings.push(...data.data.map(d => d.embedding));
      }

      for (let i = 0; i < pending.length; i++) {
        await supabase
          .from('articles')
          .update({ embedding: embeddings[i] })
          .eq('id', pending[i].id);
      }
      console.log(`[generate] ✓ ${pending.length} embeddings generados con Voyage`);
    } catch (err) {
      console.error('[generate] Embeddings error:', err.message);
      return res.status(500).json({
        error: 'Error generando embeddings con Voyage',
        details: err.message,
      });
    }
  }

  // ============================================================
  // 3. Cargar artículos con embedding — SIN filtro de fecha en BD,
  //    filtramos en JS para evitar problemas de formato de fecha
  // ============================================================
  const { data: allWithEmbedding, error: artErr } = await supabase
    .from('articles')
    .select('id, title, snippet, source_name, pub_date, embedding')
    .not('embedding', 'is', null)
    .order('pub_date', { ascending: false })
    .limit(600);

  if (artErr) {
    return res.status(500).json({ error: artErr.message });
  }

  console.log(`[generate] Total artículos con embedding en BD: ${allWithEmbedding?.length ?? 0}`);

  // Filtro en JS: últimas 72h, robusto ante cualquier formato de fecha
  const cutoffMs = Date.now() - 72 * 3600 * 1000;
  const recentArticles = (allWithEmbedding || []).filter(a => {
    const ms = new Date(a.pub_date).getTime();
    return !isNaN(ms) && ms > cutoffMs;
  });

  console.log(`[generate] Artículos en ventana 72h: ${recentArticles.length}`);

  // Fallback: si hay menos de 10 recientes, usar los 200 más recientes de la BD
  const articlesToCluster = recentArticles.length >= 10
    ? recentArticles
    : (allWithEmbedding || []).slice(0, 200);

  console.log(`[generate] Artículos a clusterizar: ${articlesToCluster.length}`);

  if (articlesToCluster.length === 0) {
    return res.status(200).json({
      ok: true,
      message: 'Sin artículos para clusterizar. Ejecuta /api/cron/ingest primero.',
    });
  }

  // ============================================================
  // 4. Clustering
  // ============================================================
  const rawClusters = clusterArticles(articlesToCluster, 0.78);

  console.log(`[generate] Clusters totales: ${rawClusters.length}`);

  const significant = rawClusters
    .map(c => ({
      ...c,
      unique_sources: new Set(c.articles.map(a => a.source_name)).size,
    }))
    .filter(c => c.unique_sources >= 1 && c.articles.length >= 2)
    .sort((a, b) => b.unique_sources - a.unique_sources);

  console.log(`[generate] Clusters significativos: ${significant.length}`);

  if (significant.length === 0) {
    return res.status(200).json({
      ok: true,
      message: 'Artículos encontrados pero ningún cluster con ≥2 artículos.',
      total_articles: articlesToCluster.length,
      total_clusters: rawClusters.length,
      debug_clusters: rawClusters.slice(0, 5).map(c => ({
        size: c.articles.length,
        sources: [...new Set(c.articles.map(a => a.source_name))],
        title: c.articles[0]?.title?.slice(0, 60),
      })),
    });
  }

  // ============================================================
  // 5. Top 7 y generación con Claude
  // ============================================================
  const topClusters = significant.slice(0, 7);
  const today = new Date().toISOString().split('T')[0];
  const generatedCards = [];

  for (const cluster of topClusters) {
    const titles = cluster.articles.map(a => a.title);
    const topic = detectTopic(titles);

    const { data: savedCluster, error: clusterErr } = await supabase
      .from('clusters')
      .insert({
        label: titles[0].slice(0, 120),
        topic,
        size: cluster.articles.length,
        score: cluster.unique_sources * 10,
        selected: true,
        date: today,
      })
      .select()
      .single();

    if (clusterErr || !savedCluster) {
      console.error('[generate] Error insertando cluster:', clusterErr?.message);
      continue;
    }

    await supabase
      .from('articles')
      .update({ cluster_id: savedCluster.id })
      .in('id', cluster.articles.map(a => a.id));

    const articlesContext = cluster.articles
      .slice(0, 8)
      .map(a => `[${a.source_name}] ${a.title}\n${a.snippet || ''}`)
      .join('\n\n');

    try {
      const response = await claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `TEMA DETECTADO: ${topic}\n\nFUENTES DEL DÍA:\n${articlesContext}\n\nGenera la tarjeta en JSON. SOLO JSON, sin texto adicional.`,
        }],
      });

      const text = response.content[0].text.trim();
      const jsonText = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      const card = JSON.parse(jsonText);

      const { data: saved, error: cardErr } = await supabase
        .from('cards')
        .insert({
          cluster_id: savedCluster.id,
          category: card.category || topic,
          headline: card.headline,
          deck: card.deck,
          body: card.body,
          meaning: card.meaning,
          sources_text: card.sources_text || [...new Set(cluster.articles.map(a => a.source_name))].slice(0, 3).join(' · '),
          read_time_seconds: card.read_time_seconds || 40,
          status: 'pending',
          edition_date: today,
          order_index: generatedCards.length,
        })
        .select()
        .single();

      if (cardErr) {
        console.error('[generate] Error insertando tarjeta:', cardErr);
        continue;
      }

      if (saved) {
        generatedCards.push(saved);
        console.log(`[generate] ✓ Tarjeta: ${card.headline?.replace(/<[^>]*>/g, '')}`);
      }
    } catch (err) {
      console.error('[generate] ✗ Error con cluster:', err.message);
      if (err.status === 401) {
        return res.status(500).json({
          error: 'ANTHROPIC_API_KEY inválida',
          hint: 'Genera una nueva en https://console.anthropic.com/settings/keys',
        });
      }
    }
  }

  console.log(`[generate] Done. ${generatedCards.length} tarjetas generadas`);

  return res.status(200).json({
    ok: true,
    articles_clustered: articlesToCluster.length,
    clusters_detected: significant.length,
    clusters_selected: topClusters.length,
    cards_generated: generatedCards.length,
    cards: generatedCards.map(c => ({
      id: c.id,
      headline: c.headline,
      category: c.category,
    })),
  });
}