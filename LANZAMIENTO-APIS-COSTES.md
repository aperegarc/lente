# Análisis de APIs y costes operativos — lente

Guía para entender **qué servicios usa la app**, **cuánto cuestan** y **qué conviene mantener** antes del lanzamiento.  
Complementa `LANZAMIENTO-SEGURIDAD.md` (solo hardening).

**Escenario de referencia:** ~**1.000 usuarios activos al mes (MAU)** con uso típico de PWA de noticias (no trading en tiempo real).

---

## Resumen ejecutivo

| Servicio | Rol | ¿API key? | Coste mensual estimado (1k MAU) |
|----------|-----|-----------|----------------------------------|
| **Vercel** | Hosting, serverless, crons | No | **0 €** (Hobby) · **~20 $** (Pro recomendado) |
| **Supabase** | Auth, BD, RLS | Sí (anon + service) | **0 €** (Free) · **~25 $** si creces |
| **Anthropic Claude** | Generar 7–10 tarjetas/día | Sí | **~3–8 €** |
| **RSS (8 medios)** | Ingest de noticias | No | **0 €** |
| **Yahoo Finance** | Mercados + gráficos | No | **0 €** (riesgo rate limit) |
| **Frankfurter** | Tipos de cambio (ECB) | No | **0 €** |
| **CoinGecko** | Precios cripto | No (tier público) | **0 €** (límite de llamadas) |
| **Stripe** | Suscripciones Premium | Sí | **% sobre ingresos** (~2,9 % + 0,25 €) |
| **jsDelivr (ECharts)** | Gráficos en cliente | No | **0 €** |

**Total infra fijo (sin ingresos Stripe):** ~**0–30 €/mes** según plan Vercel/Supabase.  
**Coste variable dominante:** Claude (~**0,10–0,25 €/día** de generación).

La arquitectura actual ya eliminó **Finnhub** y **OpenAI** (embeddings). Es la configuración acordada: **noticias = RSS + IA**, **mercados = Yahoo + Frankfurter + CoinGecko**.

---

## Mapa de APIs en la app

```
                    ┌─────────────────────────────────────────┐
                    │              USUARIO (PWA)               │
                    └─────────────────────────────────────────┘
                      │           │              │
              /api/feed      /api/markets    /api/candles
                      │           │              │
         ┌────────────┴───┐   ┌────┴─────┐   ┌────┴──────┐
         │   Supabase     │   │ Yahoo   │   │  Yahoo    │
         │  (service_role)│   │Frankfurter│  │  v8 chart │
         │                │   │CoinGecko │   │           │
         └────────────────┘   └──────────┘   └───────────┘

CRON 06:00 UTC (Vercel)
  ingest (RSS ×8) → generate (Claude 1×)     markets (Yahoo × ~22/día)
```

### Por endpoint interno

| Endpoint | Origen externo | Cuándo se llama |
|----------|----------------|-----------------|
| `GET /api/feed` | Supabase | Cada apertura / refresh del feed |
| `GET /api/cards` | Supabase | Guardados (Premium) |
| `GET /api/feed-history` | Supabase | Premium, histórico |
| `GET /api/markets?view=universe` | Supabase + Frankfurter + CoinGecko | Pestaña Mercados |
| `GET /api/markets?series=1` | Frankfurter / CoinGecko / Yahoo | Históricos (si se usa) |
| `GET /api/candles` | Yahoo Finance v8 | Al abrir gráfico o cambiar periodo |
| `POST /api/stripe/session` | Stripe | Checkout / portal |
| `POST /api/stripe/webhook` | Stripe → Supabase | Tras pago / cancelación |
| `GET /api/crons?job=ingest` | 8 feeds RSS | 1×/día (cron) |
| `GET /api/crons?job=generate` | Anthropic Claude | Tras ingest (1×/día) |
| `GET /api/crons?job=markets` | Yahoo (`yahoo-finance2`) | 1×/día (cron) |

---

## Detalle por servicio

### 1. Anthropic Claude (único coste de IA)

**Modelo en código:** `claude-sonnet-4-20250514` (`lib/cron/generate.js`).

**Qué hace:** Un solo prompt al día con hasta **90 artículos RSS** (snippet ~320 chars) → JSON con **7–10 tarjetas** (`MAX_CARDS = 10`, `MIN_CARDS = 7`).

**Frecuencia:** 1 llamada/día (+ regeneraciones manuales desde admin si las usas).

**Estimación de tokens por ejecución:**

| Componente | Tokens aprox. |
|------------|---------------|
| System prompt + reglas editoriales | ~2.000 |
| 90 artículos (título + snippet) | ~12.000–18.000 |
| Respuesta JSON (7–10 tarjetas) | ~3.000–6.000 |

**Coste (tarifa Sonnet ~3 $/M input · 15 $/M output, junio 2026):**

| Escenario | Input | Output | Coste/día | Coste/mes |
|-----------|-------|--------|-----------|-----------|
| Normal | ~15k | ~5k | ~$0,12 | **~$3,60 (~3,30 €)** |
| Día cargado + reintentos | ~20k | ~8k | ~$0,18 | ~$5,40 |
| Admin regenera 2× extra/mes | — | — | — | **+~1 €** |

**Conclusión:** Con 1 edición diaria, Claude cuesta **menos que un café al mes**. No escala linealmente con usuarios salvo que dispares regeneraciones.

**Optimizaciones posibles (no urgentes):**

- Prompt caching en el `system` (ahorro ~90 % en input repetido).
- Batch API de Anthropic (50 % descuento) si pasas el cron a cola async.
- `claude-haiku-4-5` para borrador + Sonnet solo si falla calidad (más complejo).

---

### 2. RSS — noticias (gratis)

**Fuentes en `schema.sql` (8 activas):**

| Medio | Idioma |
|-------|--------|
| Expansión | es |
| El Economista | es |
| Cinco Días | es |
| Reuters Business | en |
| Financial Times | en |
| Bloomberg Markets | en |
| CNBC | en |
| BBC Business | en |

**Frecuencia:** 8 peticiones HTTP/día en cron ingest (+ filtro blocklist en código).

**Coste:** **0 €**. Riesgo: algún feed caiga o cambie URL → revisar logs del cron.

**No hace falta:** Finnhub, NewsAPI, OpenAI para noticias.

---

### 3. Yahoo Finance (gratis, sin clave)

**Usos:**

| Uso | Llamadas/día (fijo) | Variable (usuarios) |
|-----|---------------------|---------------------|
| Cron `markets` | ~11 símbolos × 2 (quote + chart 24h) ≈ **22** | — |
| `GET /api/candles` | — | 1–3 por gráfico abierto |
| `GET /api/markets?series=1` | — | 1 por histórico (Yahoo si no es divisa/cripto) |

**Catálogo UI:** ~**60 activos** en `markets-universe.js`; solo **11** se actualizan en cron diario (tabla `markets` en Supabase). El resto usa Frankfurter/CoinGecko en la vista universo o queda sin precio en vivo.

**Coste:** **0 €** (API no oficial / endpoints públicos v8).

**Riesgos:**

- **Rate limiting** si muchos usuarios abren gráficos a la vez (principal cuello de botella a escala).
- **ToS / estabilidad:** Yahoo puede cambiar endpoints; ya tienes fallbacks en `yahoo-chart.js`.
- No es tiempo real; adecuado para app educativa/referencia.

**Mitigación recomendada antes de mucho tráfico:**

- Mantener `Cache-Control` en `/api/candles` (ya: 60 s).
- Considerar cache en Supabase o KV para series más consultadas (^IBEX, BTC).
- No añadir polling en cliente.

---

### 4. Frankfurter (gratis)

**Qué hace:** Tipos EUR → USD, GBP, JPY, etc. (datos tipo ECB).

**Llamadas:** En `view=universe`: 1× `latest` + hasta 7 intentos de día anterior; en series históricas: 1 request por rango.

**Coste:** **0 €**, sin API key, uso razonable permitido.

---

### 5. CoinGecko (gratis, tier público)

**Qué hace:** Precios cripto en EUR + históricos (`market_chart`).

**Llamadas:** 1 batch en universo (~12 ids); 1 por gráfico de cripto si usas `series=1`.

**Límites tier gratuito (orientativo):** ~**10–30 req/min** según endpoint; suficiente para 1k MAU si no abusas de refrescos.

**Coste:** **0 €** al inicio. Si creces: plan Analyst ~**129 $/mes** (solo si ves 429 frecuentes).

---

### 6. Supabase

**Qué usa la app:**

- Auth (email/password)
- Tablas: `profiles`, `cards`, `articles`, `sources`, `clusters`, `markets`, `saved_cards`
- PostgREST desde servidor (service role en feed/admin/crons)

**Plan Free (límites relevantes):**

| Recurso | Límite Free | Uso estimado 1k MAU |
|---------|-------------|---------------------|
| MAU Auth | 50.000 | OK |
| Base de datos | 500 MB | OK (MVP) |
| Egress | 5 GB/mes | Vigilar si feed muy pesado |
| API requests | Generoso en Free | OK |

**Coste:** **0 €** al lanzar. **Pro ~25 $/mes** cuando necesites más espacio, backups PITR o soporte.

**Nota:** El embedding `vector(1536)` en `articles` ya no se usa (pipeline solo Claude). Ocupa espacio pero no genera coste OpenAI.

---

### 7. Vercel

**Functions:** `api/*`, crons, rewrites.

**Crons configurados (`vercel.json`):**

| Cron | Horario | Acción |
|------|---------|--------|
| `/api/cron/ingest` | 06:00 UTC diario | RSS → encadena `generate` |
| `/api/cron/markets` | 06:00 UTC diario | Yahoo → Supabase |

**Plan Hobby:**

- Hosting estático + serverless
- Crons diarios (límite de jobs)
- **0 €**

**Plan Pro (~20 $/mes):** recomendable si quieres más crons, mejor observabilidad, protección de previews o tráfico sostenido.

**Invocaciones estimadas (1k MAU, ~8 sesiones/usuario/mes ≈ 8.000 sesiones):**

| Ruta | Req/mes aprox. |
|------|----------------|
| `/api/feed` | ~8.000 |
| `/api/markets?universe` | ~3.000 (40 % abre Mercados) |
| `/api/candles` | ~4.000–6.000 (gráficos + cambio timeframe) |
| Crons | ~60 |
| Auth/config | incluido en carga inicial |

Total serverless: **~15.000–20.000/mes** → dentro de Hobby para MVP.

---

### 8. Stripe (solo comisiones)

**Precios producto:** 5 €/mes · 20 €/año (`STRIPE_SETUP.md`).

**Comisión típica UE (tarjeta):** ~**1,5 % + 0,25 €** (Stripe standard EU) a ~**2,9 % + 0,25 €** según método.

**Ejemplo ingresos vs comisión:**

| Supuestos | Cálculo |
|-----------|---------|
| 1.000 MAU, **5 % Premium** mensual | 50 × 5 € = **250 €/mes** bruto |
| Comisión Stripe (~3 %) | **~7–8 €/mes** |
| Neto tras Stripe | **~242 €/mes** |
| Claude + infra | **~5–30 €/mes** |
| **Margen operativo** (solo APIs) | **>200 €/mes** en ese escenario |

Stripe **no tiene cuota fija**; solo pagas por transacción exitosa.

---

## Posibles ingresos (Premium)

**Modelo freemium:** cuenta gratis = **5 noticias/día**. Premium desbloquea el resto del día, **guardar** noticias e **histórico** de ediciones.

**Precios (Stripe):**

| Plan | Precio | Equivale a |
|------|--------|------------|
| Mensual | **5 €/mes** | 5 €/mes por suscriptor |
| Anual | **20 €/año** | ~1,67 €/mes (cobro único anual) |

**Comisión Stripe (orientativa, tarjeta UE):** ~**1,5 % + 0,25 €** por cobro → en 5 € pierdes ~**0,33 €**; en 20 € ~**0,55 €**.

### Ingresos brutos mensuales (solo plan 5 €/mes)

Supuesto: todos los Premium pagan el plan mensual (escenario conservador para comparar).

| Usuarios activos/mes | % que paga | Suscriptores | Bruto/mes |
|----------------------|------------|--------------|-----------|
| 500 | 2 % | 10 | **50 €** |
| 500 | 5 % | 25 | **125 €** |
| 500 | 10 % | 50 | **250 €** |
| **1.000** | **2 %** | **20** | **100 €** |
| **1.000** | **5 %** | **50** | **250 €** |
| **1.000** | **10 %** | **100** | **500 €** |

### Ingresos netos (después de Stripe + costes técnicos)

Costes técnicos: **~6 €/mes** (mínimo) o **~25 €/mes** (Vercel Pro). Stripe ~**3 %** del bruto.

| Escenario | Bruto | − Stripe (~3 %) | − Costes (mín / Pro) | **Neto/mes** |
|-----------|-------|-----------------|----------------------|--------------|
| 500 MAU · 2 % Premium | 50 € | −2 € | −6 / −25 € | **~42 € / ~23 €** |
| 500 MAU · 5 % Premium | 125 € | −4 € | −6 / −25 € | **~115 € / ~96 €** |
| 1.000 MAU · 2 % Premium | 100 € | −3 € | −6 / −25 € | **~91 € / ~72 €** |
| **1.000 MAU · 5 % Premium** | **250 €** | **−8 €** | **−6 / −25 €** | **~236 € / ~217 €** |
| 1.000 MAU · 10 % Premium | 500 € | −15 € | −6 / −25 € | **~479 € / ~460 €** |

*(Sin impuestos, contabilidad, marketing ni salarios.)*

### Plan anual (20 €/año)

Si parte de los Premium elige anual, el **flujo de caja** mejora al inicio (20 € de golpe), pero el ingreso mensual equivalente es menor:

| Suscriptores anuales | Cobro inmediato | ≈ €/mes repartidos |
|----------------------|-----------------|---------------------|
| 10 | 200 € | ~17 €/mes |
| 25 | 500 € | ~42 €/mes |
| 50 | 1.000 € | ~83 €/mes |

Mezcla realista (70 % mensual · 30 % anual) con **50 Premium** sobre 1.000 MAU:

- ~35 × 5 € = 175 €/mes  
- ~15 × 20 €/año ≈ 25 €/mes equivalente  
- **Bruto ~200 €/mes** (un poco menos que si todos fueran mensuales)

### Punto de equilibrio (solo costes técnicos)

| Costes/mes | Suscriptores a 5 €/mes (bruto) | % sobre 1.000 MAU |
|------------|----------------------------------|-------------------|
| ~6 € (mínimo) | **2** | 0,2 % |
| ~25 € (Pro) | **6** | 0,6 % |

Con **2–6 suscriptores** ya se cubren los gastos de infra + IA. El resto sería margen (menos comisiones Stripe).

### Ingresos anuales (referencia, 1.000 MAU)

| Conversión Premium | Bruto/año (mensual) | Neto/año aprox. (costes mín.) |
|--------------------|---------------------|-------------------------------|
| 2 % (20 subs) | ~1.200 € | ~1.000 € |
| 5 % (50 subs) | ~3.000 € | ~2.800 € |
| 10 % (100 subs) | ~6.000 € | ~5.700 € |

---

## Coste total mensual — tres escenarios

### A) Lanzamiento mínimo (Hobby + Supabase Free)

| Concepto | €/mes |
|----------|-------|
| Vercel Hobby | 0 |
| Supabase Free | 0 |
| Claude (1 edición/día) | ~3–5 |
| RSS + Yahoo + Frankfurter + CoinGecko | 0 |
| Dominio (prorrateado) | ~1 |
| **Total** | **~4–6 €/mes** |

### B) Producción cómoda (Vercel Pro + Supabase Free)

| Concepto | €/mes |
|----------|-------|
| Vercel Pro | ~18 |
| Supabase Free | 0 |
| Claude | ~3–8 |
| **Total** | **~21–26 €/mes** |

### C) 1.000 MAU con 5 % Premium (ingresos vs costes)

| | €/mes |
|---|-------|
| Ingresos brutos (50 × 5 €) | +250 |
| Stripe | −8 |
| Infra + IA | −25 |
| **Resultado neto operativo** | **~217 €** |

*(Sin contar impuestos, contabilidad, marketing ni tu tiempo.)*

---

## APIs eliminadas — confirmación

| Servicio | Estado | Motivo |
|----------|--------|--------|
| **Finnhub** | Eliminado | De pago / redundante con Yahoo |
| **OpenAI embeddings** | Eliminado | Pipeline simplificado a Claude batch |
| **TradingView widget** | No usado | ECharts + Yahoo (gratis) |

**No reintroducir** salvo necesidad clara de datos en tiempo real institucional.

---

## Qué mantener vs recortar

### Mantener (core del producto)

| API | Por qué |
|-----|---------|
| **RSS + Claude** | Diferenciador editorial; coste bajo |
| **Yahoo (cron + candles)** | Gráficos e índices sin licencia |
| **Frankfurter** | Divisas fiables y gratis |
| **CoinGecko** | Cripto en EUR, tier free suficiente al inicio |
| **Supabase + Vercel + Stripe** | Stack actual |

### Vigilar (no recortar aún, monitorear)

| API | Señal de alerta |
|-----|-----------------|
| **Yahoo candles** | 429/403 en logs; lentitud en horario de mercado |
| **CoinGecko** | HTTP 429 en `/api/markets` |
| **RSS** | Cron ingest con muchos `errors[]` |

### Recortes posibles (solo si necesitas ahorrar o simplificar)

| Acción | Ahorro | Impacto |
|--------|--------|---------|
| Reducir fuentes RSS de 8 → 5 | 0 € (ya gratis) | Menos diversidad |
| Quitar acciones individuales del universo | 0 € | Catálogo más pequeño |
| Históricos solo vía cron (quitar candles on-demand) | Reduce riesgo Yahoo | Peor UX en gráficos |
| Pasar a Haiku para generate | ~50–70 % en IA | Posible bajada de calidad |

**No recomendado al lanzar:** quitar Yahoo ni Claude; son el núcleo funcional con coste acotado.

---

## Cuellos de botella por tráfico

| Tráfico | Primer límite probable | Acción |
|---------|------------------------|--------|
| 1k MAU | Ninguno crítico | Lanzar en Free/Hobby |
| 5k MAU | Yahoo candles, egress Supabase | Cache agresivo, Vercel Pro |
| 10k+ MAU | CoinGecko free, invocaciones Vercel | CoinGecko paid o cache BD |
| Picos virales | Rate limit Yahoo | Cola + respuestas cacheadas |

---

## Checklist pre-lanzamiento (APIs y costes)

- [ ] `ANTHROPIC_API_KEY` en Vercel Production con límite de gasto en [console.anthropic.com](https://console.anthropic.com)
- [ ] Crons probados: ingest → generate → tarjetas `pending` en admin
- [ ] Cron markets: precios actualizados en tabla `markets`
- [ ] Pestaña Mercados carga sin errores (Frankfurter + CoinGecko)
- [ ] Gráfico ^IBEX y BTC abren velas (Yahoo)
- [ ] Stripe test mode end-to-end antes de live
- [ ] Alertas: email Vercel deploy failed + revisar logs cron semanal
- [ ] (Opcional) Budget alert Anthropic: p. ej. **20 €/mes**

---

## Variables de entorno — resumen

| Variable | Servicio | Obligatoria |
|----------|----------|-------------|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Supabase | Sí |
| `ANTHROPIC_API_KEY` | Claude | Sí (contenido diario) |
| `CRON_SECRET` | Crons | Sí |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Stripe | Sí si cobras |
| Yahoo / Frankfurter / CoinGecko / RSS | — | **No** (sin keys) |

Plantilla: `.env.example`.

---

## Próximos pasos sugeridos

1. Completar `LANZAMIENTO-SEGURIDAD.md` (SQL hardening, claves, pruebas).
2. Lanzar en **Hobby + Supabase Free** con límite de gasto en Anthropic.
3. Tras 2–4 semanas de métricas reales: decidir **Vercel Pro** y si hace falta cache para Yahoo.
4. Revisar conversión Premium vs coste fijo (~25 € infra).

---

## Referencias en el repo

| Archivo | Contenido |
|---------|-----------|
| `lib/cron/ingest.js` | RSS diario |
| `lib/cron/generate.js` | Claude, 7–10 tarjetas |
| `lib/cron/markets.js` | Yahoo → Supabase |
| `api/markets.js` | Universo + Frankfurter + CoinGecko |
| `api/candles.js` | Gráficos Yahoo v8 |
| `api/_lib/markets-universe.js` | ~60 activos |
| `vercel.json` | Crons 06:00 UTC |
| `STRIPE_SETUP.md` | Pagos |
| `LANZAMIENTO-SEGURIDAD.md` | Seguridad pre-launch |

---

*Última actualización: junio 2026 — arquitectura RSS + Claude + Yahoo/Frankfurter/CoinGecko, sin Finnhub ni OpenAI.*
