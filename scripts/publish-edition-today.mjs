/**
 * Borra tarjetas pending y publica la edición de hoy.
 * Uso: node --env-file=.env.local scripts/publish-edition-today.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const editionDate = new Date().toISOString().slice(0, 10);

const cards = [
  {
    category: 'Bolsa',
    headline: 'El Ibex 35 supera los 20.100 puntos',
    deck: 'La bolsa española continúa marcando máximos históricos, impulsada por el buen comportamiento del sector bancario, el optimismo en torno a la inteligencia artificial y un mejor sentimiento global en los mercados.',
    meaning:
      'Vida personal: Un mercado fuerte suele reflejar mayor confianza económica, lo que puede favorecer el empleo y la actividad empresarial.\n\nComo inversor: Si inviertes en fondos indexados europeos o en empresas españolas, este entorno puede beneficiar tu cartera, aunque conviene evitar comprar solo por el entusiasmo del mercado.',
  },
  {
    category: 'Macro Europa',
    headline: 'La economía de la eurozona acelera su crecimiento',
    deck: 'El PMI de la eurozona registró su mejor dato desde el inicio del conflicto en Irán. España destacó como una de las economías con mayor crecimiento gracias al sector servicios y al turismo.',
    meaning:
      'Vida personal: Un mayor crecimiento suele traducirse en más oportunidades laborales y mayor consumo.\n\nComo inversor: Es una señal positiva para empresas europeas, especialmente las relacionadas con consumo, turismo e industria.',
  },
  {
    category: 'Bolsa',
    headline: 'Santander recibe autorización para comprar Webster Financial',
    deck: 'La Reserva Federal de EE. UU. ha aprobado la adquisición de Webster Financial por parte de Santander, reforzando la presencia internacional del banco español.',
    meaning:
      'Vida personal: Si eres cliente de Santander, el impacto inmediato será limitado.\n\nComo inversor: La operación puede aumentar el potencial de crecimiento y diversificación del banco a medio y largo plazo.',
  },
  {
    category: 'Materias primas',
    headline: 'El petróleo Brent rebota por encima de los 80 dólares',
    deck: 'El precio del petróleo recuperó terreno tras las expectativas de un posible acuerdo geopolítico en Oriente Medio.',
    meaning:
      'Vida personal: Un petróleo más caro puede encarecer combustible, transporte y algunos productos.\n\nComo inversor: Las empresas energéticas suelen beneficiarse, mientras que sectores intensivos en combustible pueden sufrir más presión en costes.',
  },
  {
    category: 'Macro',
    headline: 'Allianz compra UOB Asset Management',
    deck: 'Allianz Global Investors adquirirá la gestora UOB Asset Management por unos 376 millones de euros para reforzar su presencia en Asia-Pacífico.',
    meaning:
      'Vida personal: No tiene un impacto directo inmediato.\n\nComo inversor: Refleja que Asia continúa siendo una región estratégica para el crecimiento de la gestión de activos.',
  },
  {
    category: 'España',
    headline: 'Porcelanosa mantiene beneficios pese al entorno internacional',
    deck: 'La compañía española logró mantener unos resultados sólidos gracias al mercado ibérico y a su apuesta por la construcción industrializada, compensando la incertidumbre exterior.',
    meaning:
      'Vida personal: Es una señal positiva para el sector de la construcción y el empleo industrial en España.\n\nComo inversor: Demuestra que empresas con ventajas competitivas pueden resistir entornos económicos complicados.',
  },
  {
    category: 'Bolsa',
    headline: 'Las bolsas asiáticas cierran con fuertes subidas',
    deck: 'Los mercados asiáticos avanzaron impulsados por el buen comportamiento de las empresas tecnológicas y el optimismo internacional.',
    meaning:
      'Vida personal: No tiene un efecto inmediato.\n\nComo inversor: Es una señal favorable para fondos globales y ETFs con exposición a Asia y tecnología.',
  },
  {
    category: 'Macro',
    headline: 'El sector servicios de EE. UU. sigue creciendo',
    deck: 'Los últimos indicadores muestran que el sector servicios estadounidense mantiene una expansión moderada, apoyando la fortaleza de la mayor economía del mundo.',
    meaning:
      'Vida personal: Una economía estadounidense sólida suele beneficiar al crecimiento global.\n\nComo inversor: Es una noticia positiva para compañías estadounidenses y fondos indexados al S&P 500.',
  },
  {
    category: 'Inmobiliario',
    headline: 'El mercado inmobiliario español seguirá encareciéndose',
    deck: 'Las previsiones apuntan a una caída en las compraventas, pero también a un incremento significativo del precio de la vivienda durante 2026.',
    meaning:
      'Vida personal: Comprar vivienda podría resultar más caro si la tendencia continúa.\n\nComo inversor: Los activos inmobiliarios y las empresas del sector podrían mantener un comportamiento sólido, aunque con menos volumen de operaciones.',
  },
  {
    category: 'Bolsa',
    headline: 'El sector bancario continúa liderando la bolsa española',
    deck: 'Los bancos siguen siendo el principal motor del Ibex gracias a beneficios elevados, dividendos y recompras de acciones, impulsando al índice a nuevos máximos.',
    meaning:
      'Vida personal: La fortaleza bancaria suele reflejar un sistema financiero estable, aunque los tipos de interés pueden seguir siendo elevados.\n\nComo inversor: Si inviertes mediante ETFs del Ibex o acciones bancarias, este sector sigue siendo uno de los principales impulsores de rentabilidad en España.',
  },
];

const rows = cards.map((c, i) => ({
  category: c.category,
  headline: c.headline,
  deck: c.deck,
  body: `${c.deck}\n\nCómo puede afectarte:\n\n${c.meaning}`,
  meaning: c.meaning,
  sources_text: 'lente · edición editorial',
  read_time_seconds: 45,
  status: 'published',
  published_at: new Date().toISOString(),
  edition_date: editionDate,
  order_index: i + 1,
  is_ai_generated: false,
  legal_tag: 'Edición editorial humana',
}));

const { count: pendingBefore, error: countErr } = await sb
  .from('cards')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'pending');
if (countErr) {
  console.error('Error contando pending:', countErr.message);
  process.exit(1);
}

console.log(`Pending a borrar: ${pendingBefore}`);

// Borrado por lotes (PostgREST limita deletes grandes)
let deleted = 0;
for (;;) {
  const { data: batch, error: selErr } = await sb
    .from('cards')
    .select('id')
    .eq('status', 'pending')
    .limit(200);
  if (selErr) {
    console.error('Error listando pending:', selErr.message);
    process.exit(1);
  }
  if (!batch?.length) break;
  const ids = batch.map((r) => r.id);
  const { error: delErr } = await sb.from('cards').delete().in('id', ids);
  if (delErr) {
    console.error('Error borrando pending:', delErr.message);
    process.exit(1);
  }
  deleted += ids.length;
  console.log(`  borrados ${deleted}…`);
}

const { error: insErr } = await sb.from('cards').insert(rows);
if (insErr) {
  console.error('Error insertando edición:', insErr.message);
  process.exit(1);
}

console.log(`OK: borrados ${deleted} pending; publicadas ${rows.length} tarjetas para ${editionDate}`);
