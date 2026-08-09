// ============================================================
// lib/cron/generate.js — Tarjetas del día con Claude (vía /api/crons?job=generate)
// ============================================================
// Pipeline: RSS recientes → dedupe por titular → un solo prompt a Claude
// → JSON con varias tarjetas + article_ids → clusters + cards en Supabase.

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin, isValidCronRequest } from '../../api/_lib/clients.js';

const MODEL = 'claude-sonnet-4-5-20250929';
const WINDOW_HOURS = 72;
const MAX_ARTICLES_IN_PROMPT = 90;
const MAX_CARDS = 10;
const MIN_CARDS = 7;
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
CATEGORÍAS — elige UNA por tarjeta (copia el texto EXACTO). Criterio de desempate: elige la más ESPECÍFICA.

Orden de prioridad si varias encajan:
1) Cripto — Bitcoin, Ethereum, exchanges, regulación cripto, tokens
2) Política monetaria — BCE, Fed, tipos oficiales, QT/QE, discursos de banqueros centrales
3) Bolsa — índices, cotizaciones, resultados empresariales, OPVs, M&A bursátil, Wall Street/IBEX como mercado
4) Materias primas — oro, petróleo/Brent, gas natural como commodity, metales, agrícolas
5) Energía — electricidad, utilities, renovables, red eléctrica (si el foco es el sector energético, no el precio del barril)
6) Tech — Big Tech, chips, regulación digital, IA como industria
7) España — impacto DIRECTO y principal en economía/hogar/mercado español (Euríbor España, PIB España, bancos españoles, empleo España). Si solo menciona España de pasada → otra categoría
8) Macro Europa — dato o decisión centrada en zona euro / UE (sin ser solo tipos del BCE)
9) Geopolítica — guerra, aranceles, sanciones, elecciones con efecto económico claro
10) Macro — resto: inflación global, PIB mundial, divisas/forex, empleo EEUU, etc.

Reglas anti-mezcla de categorías:
- Resultados de Apple/Nvidia → Tech (no Bolsa), salvo que el ángulo sea solo el movimiento del índice.
- Subida del petróleo → Materias primas (no Energía), salvo foco en factura eléctrica/utilities.
- Decisión de tipos del BCE/Fed → Política monetaria (no Macro).
- IBEX o bancos españoles por cotización → Bolsa; si el ángulo es hipoteca/Euríbor del hogar → España.
- Entre ${MIN_CARDS} y ${MAX_CARDS} tarjetas, busca variedad: evita que más de ~40% sean la misma categoría.`;

const FIELD_CONTRACT = `
CAMPOS DE CADA TARJETA — roles EXCLUSIVOS (no repitas el mismo contenido en dos campos):

1) "headline" = TITULAR
   - Máximo 12 palabras. Hecho o ángulo en seco.
   - Sin preguntas. Sin «qué significa». Sin consejos.
   - Opcional: UNA sola palabra entre <em></em> para énfasis.
   - Ejemplo bueno: «El BCE <em>mantuvo</em> los tipos en el 2%»
   - Ejemplo malo: «Qué implica para tu hipoteca la decisión del BCE» ← eso es meaning

2) "deck" = ENGANCHE (1 frase, máx. 28 palabras)
   - Solo contextualiza el titular: por qué importa HOY a nivel noticia.
   - NO cuentes el hecho completo (eso es body).
   - NO hables en segunda persona ni digas «para ti» (eso es meaning).
   - Ejemplo bueno: «La pausa llega tras un ciclo de recortes y mantiene la presión sobre el Euríbor.»
   - Ejemplo malo: repetir el headline o empezar el resumen de «qué ha pasado».

3) "body" = EXPLICACIÓN («Qué ha pasado»)
   - Máximo 80 palabras. Hechos + contexto + por qué ocurre.
   - Tercera persona. Tono informativo. Sin «tú» / «tu cartera» / «tu hipoteca».
   - Transforma: no copies el titular del medio ni parafrasees línea a línea.
   - Sin jerga sin explicar en la misma frase.
   - NO cierres con «esto significa que…» orientado al lector (eso es meaning).

4) "meaning" = ¿QUÉ SIGNIFICA PARA TI? (perfil: inversor pasivo en España)
   - Máximo 60 palabras. Segunda persona (tú).
   - SOLO impacto práctico para alguien que invierte pasivo (fondos indexados/ETFs), vive en España y no opera intradía.
   - Conecta con 1–2 de: horizonte largo, volatilidad de cartera global, Euríbor/hipoteca variable, depósitos/tipos, inflación y poder adquisitivo, pensiones.
   - Adapta el ángulo a la categoría (ej. Cripto → diversificación/volatilidad; Política monetaria → tipos/hipoteca/depósitos; Bolsa → no reaccionar a un día; España → bolsillo o mercado local).
   - Prohibido: repetir el body, repetir el deck, dar órdenes de compra/venta, citar tickers para «entrar».

Antiduplicado obligatorio:
- Si quitas "meaning", el resto debe seguir teniendo sentido como noticia.
- Si quitas "body", "meaning" no debe poder reconstruir los hechos.
- Ninguna frase de deck/body/meaning puede reaparecer casi igual en otro campo.`;

const LEGAL_EDITORIAL_RULES = `
CUMPLIMIENTO EDITORIAL Y TRANSPARENCIA (sin asesoramiento financiero):
- TRANSFORMACIÓN: No resumas ni parafrasees la noticia línea por línea. Explica con tus palabras hechos y contexto en "body"; el impacto personal SOLO en "meaning".
- NO ASESORAMIENTO: Prohibido imperativos de inversión («Compra», «Vende», «Invierte», «Apuesta por…»). Usa lenguaje descriptivo y condicional («podría afectar», «históricamente suele…», «en escenarios parecidos»). No prometas rentabilidades, ganancias fijas ni «seguridades» de mercado.
- FUENTES Y ATRIBUCIÓN: Cada tarjeta debe anclarse a los article_ids que recibes; "sources_text" debe reflejar esos medios (nombres recortados si hace falta). No atribuyas a un medio lo que solo dice otro.
- TRANSPARENCIA IA: Incluye siempre "legal_tag": una frase muy breve en español que deje claro que el texto es informativo y elaborado con asistencia de IA (p. ej. «Resumen asistido por IA — solo informativo»).`;

const SYSTEM_PROMPT = `Eres el editor jefe de lente, una app de noticias económicas diarias para inversores pasivos en España.

PERFIL ÚNICO DEL LECTOR (úsalo solo en "meaning"):
- Invierte de forma pasiva (fondos indexados, ETFs globales)
- No es trader ni sigue el mercado minuto a minuto
- Quiere claridad: qué ha pasado + qué le supone en la práctica

${LEGAL_EDITORIAL_RULES}

${FIELD_CONTRACT}

TAREA:
Te paso noticias RSS numeradas (solo esas fuentes; no inventes otras). Elige los temas MÁS RELEVANTES del día (entre ${MIN_CARDS} y ${MAX_CARDS} tarjetas; si hay poco contenido útil, menos de ${MIN_CARDS}). Prioriza diversidad de categorías.

${CATEGORY_RULES}

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks) con esta forma exacta:

{
  "cards": [
    {
      "category": "(uno de la lista exacta)",
      "headline": "Titular factual · máx 12 palabras · opcional <em>una</em> palabra",
      "deck": "Una frase de enganche · sin segunda persona · sin repetir el titular",
      "body": "Qué ha pasado: hechos y contexto · máx 80 palabras · tercera persona",
      "meaning": "Qué significa para ti (inversor pasivo en España) · máx 60 palabras · segunda persona · sin repetir body/deck",
      "legal_tag": "Frase breve: resumen asistido por IA, solo informativo",
      "read_time_seconds": 40,
      "sources_text": "Medio1 · Medio2",
      "article_ids": ["uuid-de-la-lista", "otro-uuid-opcional"]
    }
  ]
}

REGLAS FINALES:
- "category" EXACTO: ${ALLOWED_CATEGORIES.join(' | ')}
- "article_ids": solo IDs de la lista (copia exacta); 1-4 por tarjeta; agrupa notas del mismo hecho.
- No inventes cifras; si no hay dato fiable, omítelo.
- "sources_text" y "legal_tag" obligatorios.
- Responde SOLO el JSON.`;

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
      message: 'Sin artículos recientes. Ejecuta el job de ingest (POST /api/crons?job=ingest) primero.',
      pipeline: 'claude_batch',
    });
  }

  const allowedIds = new Set(articles.map((a) => a.id));
  const articleLines = buildArticleLines(articles);
  const userMessage = `Lista de noticias RSS (usa solo estos ids en article_ids).

Para cada tarjeta separa nítidamente:
- headline = titular factual
- deck = 1 frase de enganche (sin «tú»)
- body = qué ha pasado (hechos, 3ª persona)
- meaning = qué significa para un inversor pasivo en España (2ª persona; no repitas body/deck)

Clasifica con la categoría más específica. Sin asesoramiento imperativo. Incluye legal_tag.

${articleLines}

Genera entre ${MIN_CARDS} y ${MAX_CARDS} tarjetas en JSON. Varía categorías.`;

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
        hint: 'Genera una nueva en https://console.anthropic.com/settings/keys y reinicia npm run dev',
      });
    }
    if (err.status === 404 || /model:/i.test(err.message || '')) {
      return res.status(500).json({
        error: 'Modelo Claude no disponible',
        details: err.message,
        hint: `El modelo configurado (${MODEL}) no está habilitado en tu cuenta Anthropic`,
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
            // No reutilizar deck/body: mezclaba campos en la UI
            return 'Para un inversor pasivo en España, lo útil es situar esta noticia en tu horizonte largo y no reaccionar a un solo titular.';
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
