// ============================================================
// /api/cron/generate.js — Tarjetas del día con Claude (sin embeddings)
// ============================================================
// Pipeline: RSS recientes → dedupe por titular → un solo prompt a Claude
// → JSON con varias tarjetas + article_ids → clusters + cards en Supabase.

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin, isValidCronRequest } from '../_lib/clients.js';

const MODEL = 'claude-sonnet-4-20250514';
const WINDOW_HOURS = 72;
const MAX_ARTICLES_IN_PROMPT = 90;
const MAX_CARDS = 7;
const SNIPPET_LEN = 320;

/** Etiqueta por defecto si el modelo no devuelve `legal_tag` (transparencia IA). */
const DEFAULT_LEGAL_TAG = 'Resumen asistido por IA · Contenido informativo';

/** Debe coincidir con admin.html y CATEGORY_COLORS en app.js */
const ALLOWED_CATEGORIES = [
  'Política monetaria',
  'Materias primas',
  'Macro Europa',
  'Macro',
  'Bolsa',
  'Cripto',
  'Energía',
  'España',
  'Tech',
  'Geopolítica',
];

/** Si el modelo devuelve una etiqueta cercana, la mapeamos al enum */
function normalizeCategory(raw) {
  const c = (raw || '').trim();
  if (ALLOWED_CATEGORIES.includes(c)) return c;
  const lower = c.toLowerCase();
  const aliases = [
    [/bolsa|equities|stocks|indices|índices|nasdaq|s&p|wall street|earnings|cotización bursátil/i, 'Bolsa'],
    [/cripto|bitcoin|btc|ethereum|blockchain/i, 'Cripto'],
    [/fed|bce|ecb|tipos|tasas|powell|lagarde|política monetaria|quantitative/i, 'Política monetaria'],
    [/petr[oó]leo|brent|oro|gas natural|materia prima|commodities/i, 'Materias primas'],
    [/eur[oó]zona|ue\b|bruselas|par[ií]s bourse|stoxx/i, 'Macro Europa'],
    [/españa|ibex|eur[ií]bor|hipoteca espa|banco de españa/i, 'España'],
    [/nvidia|apple|google|microsoft|meta|big tech|semiconductor/i, 'Tech'],
    [/ucrania|china|eeuu|guerra|aranceles|geopol/i, 'Geopolítica'],
    [/energ[ií]a|electricidad|renovable|petróleo.*energ/i, 'Energía'],
    [/divisas|forex|eur\/usd|tipo de cambio/i, 'Macro'],
    [/\binflaci[oó]n\b|\bpib\b|econom[ií]a global|datos macro/i, 'Macro'],
  ];
  for (const [re, canonical] of aliases) {
    if (re.test(lower)) return canonical;
  }
  return 'Macro';
}

const CATEGORY_RULES = `
CATEGORÍAS (elige UNA por tarjeta; copia el texto EXACTO):
- Política monetaria — BCE, Fed, tipos, liquidez
- Materias primas — oro, petróleo, gas, metales, commodities
- Macro Europa — zona euro, UE, datos europeos
- Macro — datos macro globales, divisas/forex como contexto amplio, inflación/PGB cuando no sea solo Europa
- Bolsa — índices (IBEX, S&P, Nasdaq…), resultados de empresa, movimientos de mercado, fusiones bursátiles, noticias tipo Finnhub/market news
- Cripto — activos digitales
- Energía — mercados eléctricos, utilities, transición (sin duplicar solo petróleo si ya es Materias primas; usa criterio)
- España — impacto directo en economía o mercado español
- Tech — sector tecnológico y regulación digital
- Geopolítica — conflictos, comercio internacional, elecciones con efecto económico

Si la noticia viene claramente de mercados/bolsa (titular sobre cotización, resultados, índices), usa **Bolsa**.`;

const LEGAL_EDITORIAL_RULES = `
CUMPLIMIENTO EDITORIAL Y TRANSPARENCIA (sin asesoramiento financiero):
- TRANSFORMACIÓN: No resumas ni parafrasees la noticia línea por línea. Explica con tus palabras el «por qué importa» y el contexto: análisis pedagógico breve que complemente al original, no lo sustituya por completo.
- NO ASESORAMIENTO: Prohibido imperativos de inversión («Compra», «Vende», «Invierte», «Apuesta por…»). Usa lenguaje descriptivo y condicional («podría afectar», «históricamente suele…», «en escenarios parecidos»). No prometas rentabilidades, ganancias fijas ni «seguridades» de mercado.
- FUENTES Y ATRIBUCIÓN: Cada tarjeta debe anclarse a los article_ids que recibes; "sources_text" debe reflejar esos medios (nombres recortados si hace falta). No atribuyas a un medio lo que solo dice otro.
- TRANSPARENCIA IA: Incluye siempre "legal_tag": una frase muy breve en español que deje claro que el texto es informativo y elaborado con asistencia de IA (p. ej. «Resumen asistido por IA — solo informativo»).`;

const SYSTEM_PROMPT = `Eres el editor jefe de lente, una app de noticias económicas diarias para inversores pasivos españoles.

TU LECTOR:
- Invierte de forma pasiva (fondos indexados, ETFs)
- No sigue los mercados en tiempo real como un trader
- Quiere entender el PORQUÉ y **qué le supone a él/ella en la práctica en España**

${LEGAL_EDITORIAL_RULES}

TAREA:
Te paso una lista numerada de noticias (RSS y APIs como Finnhub: fuentes con "(Finnhub)" suelen ser mercados/divisas). Elige los temas MÁS RELEVANTES del día (entre 3 y ${MAX_CARDS} tarjetas; si hay poco contenido útil, menos). Prioriza diversidad de categorías cuando tenga sentido.

${CATEGORY_RULES}

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks) con esta forma exacta:

{
  "cards": [
    {
      "category": "(uno de la lista exacta arriba)",
      "headline": "Máximo 12 palabras. UNA palabra entre <em></em> para énfasis.",
      "deck": "1-2 frases que enganchan y preparan el cuerpo.",
      "body": "Máximo 80 palabras. Sección «Qué ha pasado»: hechos y contexto. Sin jerga sin explicar.",
      "meaning": "Máximo 60 palabras. Redacta como respuesta directa a la pregunta «¿Qué significa esto para ti?»: segunda persona (tú), tono cercano. Conecta con vida real en España cuando aplique: fondos indexados y diversificación, Euríbor/hipoteca variable, depósitos y tipos, planes de pensiones, poder adquisitivo. NO recomiendes comprar ni vender valores concretos.",
      "legal_tag": "Frase breve: resumen asistido por IA, solo informativo (sin promesas de rentabilidad).",
      "read_time_seconds": 40,
      "sources_text": "Medio1 · Medio2",
      "article_ids": ["uuid-de-la-lista", "otro-uuid-opcional"]
    }
  ]
}

REGLAS:
- "category" debe ser EXACTAMENTE uno de estos strings: ${ALLOWED_CATEGORIES.join(' | ')}
- Cada "article_ids" debe contener SOLO IDs de la lista que te doy (copia exacta).
- Agrupa varias notas si cubren el mismo hecho; 1-4 IDs por tarjeta cuando tenga sentido.
- No inventes cifras; si no hay dato fiable, omítelo.
- "sources_text": medios tomados de los article_ids (recorta nombres largos).
- "legal_tag": obligatorio en cada tarjeta (una línea corta en español).
- Responde SOLO el JSON, sin texto antes ni después.`;

function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);
}

/** Una entrada por titular normalizado (se queda la más reciente). */
function dedupeByTitle(articles) {
  const map = new Map();
  for (const a of articles) {
    const key = normalizeTitle(a.title);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || new Date(a.pub_date) > new Date(prev.pub_date)) {
      map.set(key, a);
    }
  }
  return [...map.values()].sort(
    (x, y) => new Date(y.pub_date) - new Date(x.pub_date),
  );
}

function buildArticleLines(articles) {
  return articles.map((a, i) => {
    const sn = (a.snippet || '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LEN);
    return `${i + 1}. id=${a.id}\n   [${a.source_name}] ${a.title}\n   ${sn}`;
  }).join('\n\n');
}

function parseClaudeJson(text) {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
  }
  throw new Error('Respuesta no es JSON válido');
}

export default async function handler(req, res) {
  if (!isValidCronRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('...')) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });
  }

  let supabase;
  let claude;
  try {
    supabase = getSupabaseAdmin();
    claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
  } catch (err) {
    return res.status(500).json({ error: 'Config error', details: err.message });
  }

  console.log('[generate] Pipeline simplificado (solo Claude, sin embeddings)...');

  const cutoffMs = Date.now() - WINDOW_HOURS * 3600 * 1000;

  const { data: rawRows, error: fetchErr } = await supabase
    .from('articles')
    .select('id, title, snippet, source_name, pub_date, link')
    .order('pub_date', { ascending: false })
    .limit(500);

  if (fetchErr) {
    console.error('[generate] Error cargando artículos:', fetchErr);
    return res.status(500).json({ error: fetchErr.message });
  }

  const recent = (rawRows || []).filter((a) => {
    const ms = new Date(a.pub_date).getTime();
    return !Number.isNaN(ms) && ms > cutoffMs;
  });

  const pool = recent.length >= 8 ? recent : (rawRows || []).slice(0, 200);
  const articles = dedupeByTitle(pool).slice(0, MAX_ARTICLES_IN_PROMPT);

  console.log(`[generate] Artículos en ventana ${WINDOW_HOURS}h: ${recent.length}; tras dedupe (máx ${MAX_ARTICLES_IN_PROMPT}): ${articles.length}`);

  if (articles.length === 0) {
    return res.status(200).json({
      ok: true,
      message: 'Sin artículos recientes. Ejecuta /api/cron/ingest primero.',
      pipeline: 'claude_batch',
    });
  }

  const allowedIds = new Set(articles.map((a) => a.id));
  const articleLines = buildArticleLines(articles);
  const userMessage = `Lista de noticias (usa solo estos ids en article_ids). Las fuentes "(Finnhub)" suelen ser mercados/bolsa o macro — clasifica bien la categoría, cumple las reglas de transformación (no copiar literalmente) y sin asesoramiento imperativo. El campo "meaning" debe responder en segunda persona a «¿Qué significa esto para ti?» para alguien en España con inversiones pasivas. Incluye "legal_tag" en cada tarjeta.\n\n${articleLines}\n\nGenera entre 3 y ${MAX_CARDS} tarjetas en JSON. Varía categorías cuando haya temas distintos.`;

  let parsed;
  try {
    const response = await claude.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].text;
    parsed = parseClaudeJson(text);
  } catch (err) {
    console.error('[generate] Error Claude/JSON:', err.message);
    if (err.status === 401) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY inválida',
        hint: 'Genera una nueva en https://console.anthropic.com/settings/keys',
      });
    }
    return res.status(500).json({
      error: 'Fallo al generar tarjetas',
      details: err.message,
      pipeline: 'claude_batch',
    });
  }

  const rawCards = Array.isArray(parsed.cards) ? parsed.cards : [];
  const today = new Date().toISOString().split('T')[0];
  const generatedCards = [];

  for (let idx = 0; idx < rawCards.length && generatedCards.length < MAX_CARDS; idx++) {
    const card = rawCards[idx];
    const ids = (card.article_ids || []).filter((id) => allowedIds.has(id));
    const linkedArticles = ids.length
      ? articles.filter((a) => ids.includes(a.id))
      : [];

    if (ids.length === 0) {
      console.warn('[generate] Tarjeta sin article_ids válidos, se omite:', card.headline?.slice(0, 40));
      continue;
    }

    const uniqueSources = new Set(linkedArticles.map((a) => a.source_name)).size;
    const label = linkedArticles[0]?.title?.slice(0, 120) || card.headline?.slice(0, 120) || 'Tema del día';
    const topic = normalizeCategory(card.category);

    const { data: savedCluster, error: clusterErr } = await supabase
      .from('clusters')
      .insert({
        label,
        topic,
        size: ids.length,
        score: uniqueSources * 10,
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
      .in('id', ids);

    const sourcesFallback = [...new Set(linkedArticles.map((a) => a.source_name))]
      .slice(0, 4)
      .join(' · ');

    try {
      const primaryUrl = (linkedArticles[0]?.link || '').trim() || null;
    const legalTag = ((card.legal_tag || '').trim() || DEFAULT_LEGAL_TAG).slice(0, 280);

    const { data: saved, error: cardErr } = await supabase
        .from('cards')
        .insert({
          cluster_id: savedCluster.id,
          category: topic,
          headline: card.headline,
          deck: card.deck,
          body: card.body,
          meaning: (() => {
            const m = (card.meaning || '').trim();
            if (m) return m;
            const d = (card.deck || '').trim();
            if (d) return d;
            return 'Piensa en cómo este contexto encaja con tu horizonte de inversión pasiva y tu situación en España; evita decisiones impulsivas.';
          })(),
          sources_text: card.sources_text || sourcesFallback,
          primary_source_url: primaryUrl,
          legal_tag: legalTag,
          is_ai_generated: true,
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
    } catch (e) {
      console.error('[generate] ✗ Excepción insertando tarjeta:', e.message);
    }
  }

  console.log(`[generate] Hecho. ${generatedCards.length} tarjetas (pipeline claude_batch).`);

  return res.status(200).json({
    ok: true,
    pipeline: 'claude_batch',
    articles_in_prompt: articles.length,
    cards_generated: generatedCards.length,
    cards: generatedCards.map((c) => ({ id: c.id, headline: c.headline, category: c.category })),
  });
}
