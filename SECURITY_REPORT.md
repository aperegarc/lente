# Informe de auditoría de seguridad — lente (auditoría completa #2)

**Fecha:** 2 de junio de 2026  
**Alcance:** PWA (`public/`), API Vercel (`api/`), SQL Supabase (`sql/`), Stripe, crons, service worker  
**Contexto:** Segunda auditoría tras hardening de código (junio 2026). Evalúa estado **actual del repo** + riesgos **operativos** (SQL no ejecutado en cloud, claves históricas).

---

## Resumen ejecutivo

| Severidad | Abiertas | Mitigadas en código | Requieren acción manual |
|-----------|----------|---------------------|-------------------------|
| **Crítica** | 3 | 4 (anteriores) | 2 |
| **Alta** | 5 | 6 | 1 |
| **Media** | 8 | 5 | 3 |
| **Baja** | 6 | — | — |

**Prioridad inmediata:** (1) cerrar bypass del paywall en RLS de `cards`, (2) ejecutar `sql/security-hardening.sql` en Supabase, (3) rotar claves si estuvieron en Git.

---

## 1. SUPABASE — Row Level Security (RLS)

### Tablas y estado

| Tabla | RLS en schema | Tras `security-hardening.sql` | Políticas actuales en repo |
|-------|---------------|-------------------------------|----------------------------|
| `cards` | ✅ | Sin cambio | `cards_public_read` — **SELECT si published** |
| `markets` | ✅ | Sin cambio | SELECT público (OK) |
| `profiles` | ✅ | Políticas reemplazadas | `profiles_own` FOR ALL → **vulnerable en schema.sql base** |
| `saved_cards` | ✅ | Sin cambio | Premium en INSERT (`schema-plan-freemium.sql`) |
| `articles` | ❌ | ✅ RLS ON, deny all | Sin políticas anon |
| `sources` | ❌ | ✅ RLS ON, deny all | Sin políticas anon |
| `clusters` | ❌ | ✅ RLS ON, deny all | Sin políticas anon |

### ✅ Corregido en repo (pendiente ejecutar en Supabase)

**Archivo:** `sql/security-hardening.sql`

```sql
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
-- profiles: REVOKE UPDATE columnas sensibles + trigger anti-escalada
```

### ❌ CRÍTICO — Paywall bypass: RLS de `cards` demasiado permisiva

**Archivo:** `sql/schema.sql` líneas 175–177  
**CVSS:** 8.2 (High/Critical)

**Código vulnerable:**

```sql
CREATE POLICY "cards_public_read" ON cards
  FOR SELECT USING (status = 'published');
```

**Riesgo:** Cualquier persona con la anon key (pública en `/config.js`) puede ejecutar desde la consola del navegador:

```javascript
const { data } = await supabase.from('cards')
  .select('*')
  .eq('status', 'published')
  .eq('edition_date', '2026-06-02');
// → Todas las tarjetas del día, sin límite de 5 ni Premium
```

El límite freemium solo existe en `/api/feed.js` (servidor), **no en la base de datos**. La app también consulta tarjetas desde el cliente:

```907:907:lente/public/app.js
    const { data: rows, error } = await supabaseClient.from('cards').select('*').in('id', ids).eq('status', 'published');
```

**Corrección recomendada (elegir una):**

**Opción A — Revocar acceso directo (recomendada):**

```sql
DROP POLICY IF EXISTS "cards_public_read" ON cards;
REVOKE SELECT ON cards FROM anon, authenticated;
-- El feed pasa a usar service_role en el API (cambio en api/feed.js)
```

```javascript
// api/feed.js — usar cliente admin en lugar de anon
import { getSupabaseAdmin, getUserFromToken } from './_lib/clients.js';
// ...
const supabase = getSupabaseAdmin();
```

**Opción B — Política RLS con límite + premium:**

```sql
DROP POLICY "cards_public_read" ON cards;
CREATE POLICY "cards_read_freemium" ON cards FOR SELECT USING (
  status = 'published'
  AND (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.plan = 'premium'
        AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
    )
    OR order_index < 5  -- alinear con FREE_CARD_LIMIT; frágil si cambia orden
  )
);
```

*(Usuarios anónimos: `auth.uid()` es NULL → solo `order_index < 5`; validar que `order_index` refleja el orden del feed.)*

---

### ⚠️ CRÍTICO operativo — `security-hardening.sql` no aplicado automáticamente

Si **no** ejecutaste el SQL en Supabase Dashboard, siguen activos:

- Escalada `plan` / `is_admin` en `profiles` (`profiles_own` FOR ALL).
- Lectura/escritura de `articles` vía PostgREST.

→ Ver `GUIA-SEGURIDAD-MANUAL.md` sección 1.

---

### ⚠️ `schema.sql` base sigue creando política vulnerable

Instalaciones nuevas que solo ejecuten `schema.sql` quedan expuestas hasta correr `security-hardening.sql`.

**Corrección:** Fusionar hardening en `schema.sql` o documentar orden obligatorio de migraciones.

---

### ✅ `service_role` no aparece en frontend

**Verificado:** `getSupabaseAdmin()` solo en `api/_lib/clients.js` y rutas server. Cliente usa anon vía `/api/public-config`.

---

## 2. ENVIRONMENT VARIABLES & SECRETS

| Check | Estado |
|-------|--------|
| `.env.local` en `.gitignore` | ✅ |
| `.env.example` sin claves reales | ✅ (placeholders) |
| `public/config.js` sin claves | ✅ (vacío + aviso) |
| Anon key servida desde env | ✅ `/api/public-config.js` |
| Claves históricas en Git | ⚠️ **Manual:** rotar si repo fue compartido |
| `vercel.json` sin secretos | ✅ |

**Código actual (correcto):**

```javascript
// api/public-config.js
const config = {
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: anon,  // esperado: anon es pública con RLS estricto
  API: { feed: '/api/feed', ... },
};
```

**Riesgo residual:** `Cache-Control: public, max-age=300` en config — la anon key puede cachearse en CDN 5 min (bajo impacto si RLS es correcto).

---

## 3. API ROUTES & SERVER ACTIONS

| Ruta | Auth | Validación | Métodos |
|------|------|------------|---------|
| `/api/feed` | Opcional JWT | ✅ `edition_date` ISO | GET implícito |
| `/api/feed-history` | Premium JWT | ✅ límite | GET |
| `/api/admin/cards` | `requireAdmin` | ✅ UUID, límites texto | GET, POST |
| `/api/admin/trigger` | Admin | ✅ job enum | POST |
| `/api/crons` | CRON_SECRET + header | ✅ | GET/POST |
| `/api/health` | Admin en prod | ✅ | GET |
| `/api/stripe/session` | JWT | Parcial | POST |
| `/api/stripe/webhook` | Firma Stripe | ✅ | POST |
| `/api/markets`, `/api/candles` | Público | Parcial | GET |
| `/api/public-config` | Público | N/A | GET |

### ✅ Admin protegido

```125:155:lente/api/_lib/clients.js
export async function requireAdmin(req) {
  // JWT → getUser → is_admin via service client
  if (profileErr || !profile?.is_admin) return null;
}
```

### ⚠️ ALTA — Header interno de cron falsificable

**Archivo:** `api/_lib/clients.js` líneas 69–75

```javascript
const fromAdminTrigger = req.headers['x-lente-internal-trigger'] === '1';
```

Quien conozca `CRON_SECRET` puede añadir ese header y disparar ingest/generate (coste Anthropic). Mitigación: secret largo + rate limit; idealmente HMAC del body.

### ⚠️ MEDIA — `/api/feed` category sin whitelist

**Archivo:** `api/feed.js` línea 78

```javascript
if (category) visible = visible.filter((c) => c.category === category);
```

No hay validación de formato; riesgo bajo (solo filtra subset, no amplía).

---

## 4. AUTHENTICATION & SESSION

| Check | Estado |
|-------|--------|
| Rutas protegidas server-side | ⚠️ PWA estática; protección en API + RLS |
| Middleware | ❌ No existe (no Next.js) |
| JWT en localStorage | ⚠️ Supabase default — riesgo si XSS |
| Refresh de sesión | ✅ SDK Supabase |
| Email verification | ⚠️ Config Supabase Dashboard |
| Admin solo `is_admin` | ✅ Tras fix en `admin.html` |

**Código admin (corregido):**

```1076:1083:lente/public/admin.html
const { data: profile } = await client.from('profiles')
  .select('is_admin').eq('id', session.user.id).single();
state.isAdmin = !profileErr && profile?.is_admin === true;
```

---

## 5. SUBSCRIPTIONS & PAYMENTS (Stripe)

| Check | Estado |
|-------|--------|
| Webhook verifica firma | ✅ `constructEvent` |
| Premium vía webhook, no cliente | ✅ `api/stripe/webhook.js` |
| Premium gated server-side feed API | ✅ `getUserFromToken` |
| **Premium gated RLS / DB** | ❌ **Bypass vía SELECT directo en `cards`** |
| Race checkout → webhook | ⚠️ UI avisa “puede tardar unos segundos” (OK) |

**Webhook (correcto):**

```javascript
event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
```

**Degradación plan expirado (correcto):**

```javascript
// getUserFromToken — service role actualiza plan a free si expiró
adminClient.from('profiles').update({ plan: 'free' }).eq('id', user.id);
```

---

## 6. INPUT VALIDATION & INJECTION

### ✅ Feed XSS — mitigado

**Archivo:** `public/app.js` — `escapeHtml` / `escapeAttr` en tarjetas del feed.

### ⚠️ ALTA — XSS residual en otras vistas

**Perfil — email sin escapar:**

```1047:1048:lente/public/app.js
<div style="font-size:15px;font-weight:500;">${email}</div>
```

**Mercados — nombre/descripción sin escapar:**

```476:477:lente/public/app.js
<div class="market-item-name">${m.name}</div>
<div class="market-item-desc">${m.description || ''}</div>
```

**Guardados — error sin escapar:**

```917:917:lente/public/app.js
savedList.innerHTML = `...<p>${err.message}</p>`;
```

**Corrección:**

```javascript
<div>${escapeHtml(email)}</div>
<div class="market-item-name">${escapeHtml(m.name)}</div>
savedList.innerHTML = `...<p>${escapeHtml(err.message)}</p>`;
```

### ✅ Admin cards — validación añadida

**Archivo:** `api/admin/cards.js` — UUID, límites de longitud, URLs http(s).

### ✅ Sin SQL raw — solo Supabase client

---

## 7. SUPABASE STORAGE

No hay buckets ni uploads en el código. **Revisar manualmente** en Supabase Dashboard → Storage.

---

## 8. CORS & HTTP HEADERS

### ✅ Implementado en `vercel.json`

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`, `Permissions-Policy`
- `Content-Security-Policy` (con `unsafe-inline` por onclick legacy)

### ⚠️ MEDIA — CSP permisiva

```json
"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net"
```

Necesario mientras haya `onclick="..."` inline. Mejora futura: event listeners + quitar `unsafe-inline`.

### ⚠️ MEDIA — Sin `Strict-Transport-Security` en vercel.json

Añadir en dominio propio con HTTPS:

```json
{ "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }
```

---

## 9. RATE LIMITING & ABUSE PREVENTION

| Vector | Protección |
|--------|------------|
| Login / signup | ❌ Solo límites Supabase Auth (config dashboard) |
| `/api/stripe/session` | ❌ |
| `/api/crons` | ⚠️ CRON_SECRET + header Vercel (prod) |
| `/api/feed` | ❌ Scraping posible |
| Generación Claude | ⚠️ Coste si CRON_SECRET filtrado |

**Recomendación:** Vercel Firewall o `@upstash/ratelimit` en rutas sensibles.

---

## 10. DEPENDENCY VULNERABILITIES

```bash
npm audit --audit-level=high
# → 22 high (principalmente paquete `vercel` CLI / devDependencies)
```

| Paquete runtime | Riesgo en producción |
|-----------------|----------------------|
| `@supabase/supabase-js` | Bajo — revisar versiones |
| `stripe`, `@anthropic-ai/sdk` | Bajo |
| `vercel` (dev) | No despliega a runtime |

**Acción:** `npm audit fix` periódico; separar CLI dev de runtime.

---

## 11. DATA EXPOSURE

| Issue | Estado |
|-------|--------|
| Feed API `select` campos explícitos | ✅ |
| Admin API `select('*')` | ⚠️ OK (solo admin) |
| Cliente `profiles.select('*')` | ⚠️ Usuario ve su `is_admin`, stripe ids |
| Health en prod | ✅ 404 sin admin |
| Errores genéricos en feed/admin | ✅ |
| Logs con PII | ⚠️ Reducido en requireAdmin |

**Corrección profiles cliente:**

```javascript
.select('plan, plan_expires_at, daily_reminder_enabled, name, streak_days')
// no exponer is_admin al cliente si no es necesario
```

---

## 12. VERCEL-SPECIFIC

| Check | Estado |
|-------|--------|
| Preview = misma BD prod | ⚠️ Configurar staging o Deployment Protection |
| Cron prod con header | ✅ `x-vercel-cron` |
| Preview/dev cron sin header | ⚠️ Solo CRON_SECRET (aceptable en dev) |
| SW cachea `/config.js` | ⚠️ SW excluye `/api/` — rewrite a public-config OK en red |
| `public: true` | ✅ Esperado PWA |

**Service worker (correcto para APIs):**

```javascript
if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return;
```

---

# FINAL DELIVERABLE

## Críticas (acción inmediata)

### C-01 · Bypass paywall vía RLS `cards`

- **Archivo:** `sql/schema.sql:175-177`, `public/app.js:907`
- **CVSS:** 8.2
- **Fix:** Revocar SELECT directo + feed con service role (ver sección 1)

### C-02 · SQL hardening no aplicado en Supabase cloud

- **Archivo:** `sql/security-hardening.sql` (no ejecutado en tu proyecto hasta que lo hagas tú)
- **CVSS:** 9.0 si sigue `profiles_own` + tablas sin RLS
- **Fix:** Ejecutar SQL en Dashboard

### C-03 · Rotación de claves históricas

- **CVSS:** 9.1 si service key estuvo en Git
- **Fix:** Rotar en Supabase + Vercel + `.env.local`

---

## Altas

| ID | Issue | CVSS | Fix |
|----|-------|------|-----|
| H-01 | XSS email/markets/errors | 6.5 | `escapeHtml` en app.js |
| H-02 | Cron header falsificable con secret | 7.0 | Rate limit + HMAC |
| H-03 | Sin rate limiting APIs/auth | 5.5 | Vercel Firewall |
| H-04 | Preview deployments = prod DB | 5.8 | Staging Supabase |
| H-05 | `profiles.select('*')` expone campos sensibles | 4.5 | Select mínimo |

---

## Medias

- CSP `unsafe-inline` (onclick legacy)
- JWT en localStorage
- Sin HSTS en vercel.json
- `schema.sql` vs hardening desincronizados
- npm audit high en devDependencies
- Email verification no forzada
- Categoría feed sin whitelist
- Cache público de `/config.js` 5 min

---

## Bajas / informativas

- Webhook Stripe responde 200 a GET
- `/admin.html` es HTML público (API protegida)
- `match_articles` revocada en hardening SQL
- Storage N/A en código
- localStorage cache perfil (`lente.profile`) — solo UI
- Logs `[requireAdmin] Admin verificado` en prod

---

## Lo que quedó bien tras el hardening

| Control | Estado |
|---------|--------|
| Finnhub/OpenAI eliminados | ✅ |
| Anon key vía servidor | ✅ |
| Admin `is_admin` real | ✅ |
| XSS feed principal | ✅ |
| Stripe webhook firmado | ✅ |
| Premium en `/api/feed` y `/api/feed-history` | ✅ |
| Security headers CSP/XFO | ✅ |
| Health oculto en prod | ✅ |
| Crons reforzados (secret ≥32 + header) | ✅ |
| RLS saved_cards premium | ✅ |
| Validación admin API | ✅ |

---

## Checklist auditoría (12 áreas)

| # | Área | Resultado |
|---|------|-----------|
| 1 | RLS todas las tablas | ⚠️ Código listo; **cards paywall + SQL cloud pendiente** |
| 2 | Secretos | ✅ Repo; ⚠️ rotación manual |
| 3 | API routes | ✅ Mayoría OK |
| 4 | Auth/session | ⚠️ PWA + localStorage |
| 5 | Stripe | ✅ Webhook; ❌ RLS cards |
| 6 | Input/XSS | ⚠️ Feed OK; otras vistas pendientes |
| 7 | Storage | N/A |
| 8 | Headers | ✅ Parcial (HSTS falta) |
| 9 | Rate limiting | ❌ |
| 10 | Dependencies | ⚠️ devDeps |
| 11 | Data exposure | ⚠️ profiles select * |
| 12 | Vercel | ⚠️ previews |

---

*Auditoría #2 — estado del repositorio a 2 jun 2026. Siguiente paso crítico: fix RLS `cards` + ejecutar `GUIA-SEGURIDAD-MANUAL.md`.*
