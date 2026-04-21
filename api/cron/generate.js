// ============================================================
// /api/cron/generate.js
// Clustering + priorización + generación de tarjetas con Claude
// ============================================================
// Se llama automáticamente después de /api/cron/ingest
// ============================================================

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';

// ============================================================
// PROMPT DE SISTEMA — la "voz editorial" de lente
// ============================================================
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
  "meaning": "Máximo 60 palabras. Adapta según la categoría:
- Política monetaria: impacto en hipotecas variables y Euríbor
- Bolsa/ETFs: qué significa para carteras indexadas españolas
- Cripto: riesgo/oportunidad para el inversor conservador español
- Energía/Materias primas: efecto en factura de luz, gasolina o inflación
- Geopolítica: consecuencias económicas concretas para España
- España/Macro Europa: impacto directo en salarios, pensiones o ahorro
Para cualquier otra categoría, conecta siempre con ahorro e inversión en España.",
  "read_time_seconds": 30-60,
  "sources_text": "Medio1 · Medio2 · Medio3"
}

REGLAS:
- Nunca recomiendes comprar o vender nada. Explica, no asesores.
- Si aparece un término técnico (Euríbor, inflación subyacente), explícalo en una línea.
- Conecta siempre con el contexto español: Euríbor, hipotecas variables, ahorro en depósitos, planes de pensiones.
- NUNCA inventes cifras. Si no estás seguro de un dato, omítelo.
- Responde SOLO con el JSON, nada más.`;

function buildKeywordClusters(articles) {
  const byTopic = new Map();
  for (const art of articles) {
    const topic = detectTopic([art.title || '', art.snippet || '']);
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(art);
  }
  return [...byTopic.entries()].map(([topic, grouped]) => ({
    centroid: null,
    topic,
    articles: grouped,
    unique_sources: new Set(grouped.map(a => a.source_name)).size,
  }));
}

function buildFallbackCard(cluster, topic) {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const titles = cluster.articles.map(a => clean(a.title)).filter(Boolean);
  const headlineBase = titles[0] || `Resumen de ${topic}`;
  const headline = `${headlineBase.slice(0, 90)}`;
  const sources = [...new Set(cluster.articles.map(a => a.source_name).filter(Boolean))];
  const snippetLines = cluster.articles
    .slice(0, 3)
    .map(a => clean(a.snippet))
    .filter(Boolean);

  return {
    category: topic,
    headline: headline.length > 12 ? `${headline.split(' ').slice(0, 12).join(' ')}` : headline,
    deck: `Resumen rápido de ${cluster.articles.length} noticias relacionadas en ${topic.toLowerCase()}.`,
    body: snippetLines.join(' ').slice(0, 460) || 'Se han agrupado varias noticias del mismo tema para revisión editorial.',
    meaning: 'Impacta en expectativas de tipos, inflación y decisiones de ahorro e inversión en España.',
    read_time_seconds: 40,
    sources_text: sources.slice(0, 3).join(' · ') || 'Fuentes múltiples',
  };
}

// ============================================================
// UTILIDADES
// ============================================================

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Agrupa artículos por similitud del coseno
function clusterArticles(articles, threshold = 0.78) {
  const clusters = [];
  for (const art of articles) {
    if (!art.embedding) continue;

    // Buscar cluster compatible
    let matched = null;
    for (const c of clusters) {
      // Comparamos contra el centroide (media de embeddings)
      const sim = cosineSim(art.embedding, c.centroid);
      if (sim > threshold) {
        matched = c;
        break;
      }
    }

    if (matched) {
      matched.articles.push(art);
      // Recalcular centroide
      for (let i = 0; i < matched.centroid.length; i++) {
        matched.centroid[i] =
          (matched.centroid[i] * (matched.articles.length - 1) + art.embedding[i])
          / matched.articles.length;
      }
    } else {
      clusters.push({
        centroid: [...art.embedding],
        articles: [art],
      });
    }
  }
  return clusters;
}

// Decide la categoría más probable según palabras clave
function detectTopic(titles) {
  const text = titles.join(' ').toLowerCase();
  const rules = [
    { topic: 'Política monetaria', kw: ['fed', 'powell', 'federal reserve', 'tipos de interés', 'interest rate'] },
    { topic: 'Macro Europa', kw: ['bce', 'ecb', 'eurozone', 'eurozona', 'lagarde', 'eurostat'] },
    { topic: 'Materias primas', kw: ['gold', 'oro', 'oil', 'petróleo', 'brent', 'gas'] },
    { topic: 'Cripto', kw: ['bitcoin', 'btc', 'ethereum', 'cripto', 'crypto'] },
    { topic: 'Tech', kw: ['nvidia', 'meta', 'google', 'apple', 'microsoft', 'ai', 'tecnol'] },
    { topic: 'España', kw: ['ibex', 'euríbor', 'euribor', 'banco de españa', 'españa'] },
    { topic: 'Energía', kw: ['oil', 'petróleo', 'gas', 'electricidad'] },
    { topic: 'Geopolítica', kw: ['war', 'guerra', 'israel', 'ucrania', 'china', 'eeuu', 'tarifas'] },
  ];
  for (const r of rules) {
    if (r.kw.some(k => text.includes(k))) return r.topic;
  }
  return 'Macro';
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'Falta ANTHROPIC_API_KEY en variables de entorno',
      });
    }
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    console.log('[generate] Starting generation pipeline...');

    // ============================================================
    // 1. Cargar artículos recientes sin embedding
    // ============================================================
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const { data: pending, error: pendErr } = await supabase
      .from('articles')
      .select('*')
      .gt('pub_date', yesterday)
      .is('embedding', null)
      .limit(200);

    if (pendErr) return res.status(500).json({ error: pendErr.message });

    const pendingArticles = pending || [];
    console.log(`[generate] ${pendingArticles.length} articles need embeddings`);

    // ============================================================
    // 2. Generar embeddings en batch
    // ============================================================
    if (pendingArticles.length > 0 && process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const texts = pendingArticles.map(a => `${a.title}. ${a.snippet || ''}`.slice(0, 2000));
        const emb = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: texts,
        });

        const updates = pendingArticles.map((art, i) => ({
          id: art.id,
          embedding: emb.data[i].embedding,
        }));

        // Actualizar en lotes de 50
        for (let i = 0; i < updates.length; i += 50) {
          const batch = updates.slice(i, i + 50);
          for (const u of batch) {
            await supabase.from('articles').update({ embedding: u.embedding }).eq('id', u.id);
          }
        }
        console.log(`[generate] ✓ ${updates.length} embeddings generados`);
      } catch (err) {
        console.warn('[generate] OpenAI embeddings no disponibles, activando fallback por keywords:', err.message);
      }
    }

    // ============================================================
    // 3. Cargar todos los artículos recientes (con o sin embedding)
    // ============================================================
    const { data: articles } = await supabase
      .from('articles')
      .select('id, title, snippet, source_name, embedding')
      .gt('pub_date', yesterday)
      .limit(500);

    // ============================================================
    // 4. Clustering
    // ============================================================
    const embeddedArticles = (articles || []).filter(a => Array.isArray(a.embedding));
    let significant = [];
    if (embeddedArticles.length >= 12) {
      const rawClusters = clusterArticles(embeddedArticles, 0.78);
      significant = rawClusters
        .map(c => ({
          ...c,
          topic: detectTopic(c.articles.map(a => a.title || '')),
          unique_sources: new Set(c.articles.map(a => a.source_name)).size,
        }))
        .filter(c => c.unique_sources >= 2)
        .sort((a, b) => b.unique_sources - a.unique_sources);
      console.log(`[generate] modo embeddings: ${significant.length} clusters significativos`);
    } else {
      significant = buildKeywordClusters(articles || [])
        .filter(c => c.unique_sources >= 2)
        .sort((a, b) => b.unique_sources - a.unique_sources);
      console.log(`[generate] modo fallback keywords: ${significant.length} clusters significativos`);
    }

    console.log(`[generate] ${significant.length} clusters significativos`);

    // ============================================================
    // 5. Priorización: top 6-7
    // ============================================================
    const topClusters = significant.slice(0, 7);

    // ============================================================
    // 6. Persistir clusters en BD y generar tarjetas con Claude
    // ============================================================
    const today = new Date().toISOString().split('T')[0];
    const generatedCards = [];

    for (const cluster of topClusters) {
      const titles = cluster.articles.map(a => a.title);
      const topic = cluster.topic || detectTopic(titles);

      // Persistimos cluster
      const { data: savedCluster } = await supabase
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

      if (!savedCluster) continue;

      // Actualizamos artículos con el cluster_id
      await supabase
        .from('articles')
        .update({ cluster_id: savedCluster.id })
        .in('id', cluster.articles.map(a => a.id));

      // Construimos prompt con las noticias del cluster
      const articlesContext = cluster.articles
        .slice(0, 8)
        .map(a => `[${a.source_name}] ${a.title}\n${a.snippet || ''}`)
        .join('\n\n');

      try {
        let card = null;
        const response = await claude.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `TEMA DETECTADO: ${topic}\n\nFUENTES DEL DÍA:\n${articlesContext}\n\nGenera la tarjeta en JSON. SOLO JSON, sin texto adicional.`,
          }],
        });

        const text = response.content[0].text.trim();
        // Limpiar por si Claude mete backticks
        const jsonText = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        card = JSON.parse(jsonText);

        // Guardar tarjeta en BD
        const { data: saved } = await supabase
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
            status: 'pending',  // esperando revisión humana
            edition_date: today,
            order_index: generatedCards.length,
          })
          .select()
          .single();

        if (saved) {
          generatedCards.push(saved);
          console.log(`[generate] ✓ Tarjeta generada: ${card.headline.replace(/<[^>]*>/g, '')}`);
        }
      } catch (err) {
        console.error('[generate] ✗ Error Claude:', err.message);
        try {
          const fallbackCard = buildFallbackCard(cluster, topic);
          const { data: savedFallback } = await supabase
            .from('cards')
            .insert({
              cluster_id: savedCluster.id,
              category: fallbackCard.category,
              headline: fallbackCard.headline,
              deck: fallbackCard.deck,
              body: fallbackCard.body,
              meaning: fallbackCard.meaning,
              sources_text: fallbackCard.sources_text,
              read_time_seconds: fallbackCard.read_time_seconds,
              status: 'pending',
              edition_date: today,
              order_index: generatedCards.length,
            })
            .select()
            .single();

          if (savedFallback) {
            generatedCards.push(savedFallback);
            console.log(`[generate] ✓ Tarjeta fallback creada para topic ${topic}`);
          }
        } catch (fallbackErr) {
          console.error('[generate] ✗ Error fallback card:', fallbackErr.message);
        }
      }
    }

    console.log(`[generate] Pipeline completo: ${generatedCards.length} tarjetas pendientes de revisión`);

    return res.status(200).json({
      clusters_detected: significant.length,
      clusters_selected: topClusters.length,
      cards_generated: generatedCards.length,
      cards: generatedCards.map(c => ({
        id: c.id,
        headline: c.headline,
        category: c.category,
      })),
    });
  } catch (err) {
    console.error('[generate] Fatal error:', err);
    return res.status(500).json({
      error: err?.message || 'Error interno en generate',
    });
  }
}
