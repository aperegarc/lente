# Guía de lanzamiento — seguridad (lente)

Checklist para dejar la app **lista para producción solo en seguridad**.  
Cuando marques todo lo obligatorio, puedes pasar al análisis de APIs y costes operativos.

**Tiempo estimado:** 45–90 minutos (primera vez).

---

## Estado del código (ya hecho en el repo)

No tienes que reimplementar esto; solo asegúrate de **desplegar la última versión** en Vercel:

- Config Supabase servida desde servidor (`/config.js` → `/api/public-config`)
- Paywall en servidor: `/api/feed` usa `service_role`; cliente no lee `cards` directo
- Guardados vía `/api/cards` (Premium + ids verificados)
- Admin exige `is_admin` en BD
- XSS mitigado en feed, guardados, mercados y perfil
- Stripe webhook con verificación de firma
- Crons protegidos (`CRON_SECRET` + header Vercel en prod)
- Cabeceras CSP, X-Frame-Options, etc. en `vercel.json`
- `/api/health` oculto en producción (solo admin)

**Sin los pasos manuales de abajo, la app en producción sigue siendo vulnerable aunque el código esté bien.**

---

## Orden recomendado

```
1. Deploy código en Vercel
2. Supabase — migraciones SQL (incl. security-hardening)
3. Rotar claves si hubo filtración
4. Variables de entorno en Vercel + redeploy
5. Auth Supabase
6. Stripe (webhook + live/test)
7. Usuario admin
8. Pruebas de aceptación de seguridad
9. (Opcional) Endurecimiento extra pre-escala
```

---

## Fase 1 — Supabase: base de datos y RLS

### 1.1 Orden de SQL (si el proyecto ya existía)

Ejecuta en **SQL Editor** solo lo que aún no hayas aplicado, en este orden:

| Orden | Archivo | ¿Cuándo? |
|-------|---------|----------|
| 1 | `sql/schema.sql` | Proyecto nuevo |
| 2 | `sql/schema-plan-freemium.sql` | Si usas Premium / guardados |
| 3 | `sql/schema-stripe.sql` | Si usas Stripe |
| 4 | `sql/migration-cards-legal-ia.sql` | Si faltan columnas legal en `cards` |
| 5 | **`sql/security-hardening.sql`** | **Siempre antes de lanzar** |

### 1.2 Ejecutar endurecimiento (obligatorio)

1. [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto → **SQL Editor** → New query.
2. Pega **todo** el contenido de `sql/security-hardening.sql`.
3. **Run**.

Qué hace:

- RLS en `articles`, `sources`, `clusters` (sin acceso público directo)
- Bloquea escalada de `plan`, `is_admin` y Stripe en `profiles`
- **Revoca lectura directa de `cards`** (paywall solo por API)
- Revoca RPC `match_articles` para anon/authenticated

### 1.3 Verificar en Table Editor

| Tabla | RLS | Políticas esperadas |
|-------|-----|---------------------|
| `articles` | ON | Ninguna para anon (deny all) |
| `sources` | ON | Ninguna para anon |
| `clusters` | ON | Ninguna para anon |
| `cards` | ON | Sin `cards_public_read` |
| `profiles` | ON | `profiles_select_own`, `profiles_update_own` |
| `saved_cards` | ON | Premium en INSERT |
| `markets` | ON | Lectura pública (OK) |

### 1.4 Comprobación rápida en SQL Editor

Tras el hardening, como usuario autenticado **no** debería poder:

```sql
-- Debe fallar tras security-hardening (desde cliente con JWT de usuario normal):
-- UPDATE profiles SET plan = 'premium' WHERE id = auth.uid();
```

---

## Fase 2 — Rotación de claves (obligatorio si el repo se compartió)

Si en algún momento subiste claves reales a Git (`.env.example` antiguo, `config.js` con JWT, etc.), **rota todo** aunque ya hayas borrado el archivo.

| Clave | Dónde rotar |
|-------|-------------|
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → Reset **service_role** |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → Reset **anon** (recomendado) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `CRON_SECRET` | Genera 48 caracteres aleatorios (PowerShell: ver `.env.example`) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Roll key |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → nuevo endpoint o roll secret |

Después de rotar: actualiza **Vercel** y **`.env.local`**, y haz **Redeploy**.

- [ ] Claves rotadas (o confirmado que nunca se filtraron)
- [ ] `.env.local` actualizado en local
- [ ] Vercel Environment Variables actualizadas

---

## Fase 3 — Vercel: deploy y variables

### 3.1 Deploy

- [ ] Último commit desplegado en **Production**
- [ ] Dominio propio configurado (opcional pero recomendado para Stripe live)

### 3.2 Variables obligatorias (Production)

| Variable | Uso |
|----------|-----|
| `SUPABASE_URL` | Servidor + config cliente |
| `SUPABASE_ANON_KEY` | Solo vía `/api/public-config` |
| `SUPABASE_SERVICE_KEY` | **Solo servidor** — feed, crons, admin, webhooks |
| `ANTHROPIC_API_KEY` | Cron generate |
| `CRON_SECRET` | Mín. **32 caracteres** aleatorios |

### 3.3 Variables Stripe (si lanzas con pagos)

| Variable | Uso |
|----------|-----|
| `STRIPE_SECRET_KEY` | `sk_live_…` en prod |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` del endpoint prod |
| `STRIPE_PRICE_MONTHLY` | `price_…` |
| `STRIPE_PRICE_YEARLY` | `price_…` |

### 3.4 Previews de Vercel

- [ ] **Opción A:** Desactivar preview público (Deployment Protection)
- [ ] **Opción B:** Proyecto Supabase **separado** para Preview (no la misma BD que prod)

Marca las variables también en **Preview** si usas previews con la misma BD (no recomendado).

---

## Fase 4 — Supabase Auth

1. **Authentication → URL Configuration**
   - [ ] Site URL: `https://tu-dominio.com`
   - [ ] Redirect URLs: `https://tu-dominio.com/**`, `https://tu-dominio.com/admin`

2. **Authentication → Providers → Email**
   - [ ] **Confirm email** activado (recomendado antes de cobrar)
   - [ ] Contraseña mínima coherente con la app (≥6 en UI; considera subir a 8 en Supabase)

3. **Authentication → Rate limits**
   - [ ] Revisar límites de signup / login / password reset

4. **Settings → API**
   - [ ] Confirmar que **service_role** no se usa nunca en el frontend

---

## Fase 5 — Stripe (seguridad de pagos)

Guía detallada: `STRIPE_SETUP.md`.

- [ ] Modo **test** probado end-to-end antes de live
- [ ] Webhook POST → `https://tu-dominio.com/api/stripe/webhook`
- [ ] Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] `STRIPE_WEBHOOK_SECRET` en Vercel (Production)
- [ ] Premium se activa **solo** tras webhook (no confiar en `?checkout=success` del cliente)
- [ ] Portal de facturación activado (cancelación / gestión)

**Prueba de seguridad:** usuario free no debe obtener Premium sin fila en `profiles` actualizada por webhook.

---

## Fase 6 — Admin

Solo tú (o editores de confianza) deben administrar tarjetas.

```sql
UPDATE profiles
SET is_admin = true
WHERE email = 'tu-email@ejemplo.com';
```

- [ ] Al menos un admin configurado
- [ ] Probado login en `https://tu-dominio.com/admin`
- [ ] Usuario **sin** `is_admin` ve mensaje de “sin permisos” (no el panel)

---

## Fase 7 — Pruebas de aceptación (obligatorias antes de lanzar)

Haz estas pruebas en **producción** (o staging idéntico) con dos cuentas: una normal y una admin.

### Config y superficie expuesta

| # | Prueba | Resultado esperado | ✓ |
|---|--------|-------------------|---|
| 1 | Abrir `/config.js` | JS con `SUPABASE_URL` y `SUPABASE_ANON_KEY` (no vacíos) | |
| 2 | `/api/health` sin token | **404** | |
| 3 | `/api/health` con JWT admin | JSON `ready: true/false` | |
| 4 | `.env.local` / service key | No accesible desde navegador | |

### Paywall y datos

| # | Prueba | Resultado esperado | ✓ |
|---|--------|-------------------|---|
| 5 | Usuario free / anónimo → feed | Máximo **5** tarjetas | |
| 6 | Consola: `supabase.from('cards').select('*')` | **Error / vacío** (sin bypass) | |
| 7 | Usuario Premium (tras pago test) → feed | Todas las tarjetas del día | |
| 8 | Histórico `/api/feed-history` sin Premium | **403** | |
| 9 | Guardar noticia sin Premium | Bloqueado (UI + RLS) | |

### Cuenta y privilegios

| # | Prueba | Resultado esperado | ✓ |
|---|--------|-------------------|---|
| 10 | Intentar `UPDATE profiles SET plan='premium'` desde cliente | **Fallo** | |
| 11 | `/admin` con usuario normal | Sin acceso al panel | |
| 12 | `/api/admin/cards` sin JWT admin | **401** | |

### Crons y coste

| # | Prueba | Resultado esperado | ✓ |
|---|--------|-------------------|---|
| 13 | GET `/api/crons?job=ingest` sin Bearer | **401** | |
| 14 | Logs Vercel tras cron 06:00 UTC | Ingest + markets OK | |
| 15 | Trigger manual desde admin (ingest/generate) | OK con admin logueado | |

### Stripe

| # | Prueba | Resultado esperado | ✓ |
|---|--------|-------------------|---|
| 16 | Checkout test → webhook recibido | `profiles.plan = premium` | |
| 17 | Cancelar en portal → webhook | `plan = free` | |

---

## Fase 8 — Opcional (recomendado antes de muchos usuarios)

No bloquean un lanzamiento controlado, pero conviene planificarlos:

| Medida | Dónde |
|--------|--------|
| Rate limiting en login y `/api/stripe/session` | Vercel Firewall o Upstash |
| HSTS en dominio propio | Vercel → dominio → HTTPS |
| Alertas Supabase (auth failures, API spikes) | Supabase Dashboard |
| `npm audit fix` | Local / CI |
| Limpiar historial Git si hubo secretos | `git filter-repo` / BFG |
| Revisar Storage buckets (si los creas después) | Supabase → Storage → private + RLS |

---

## Criterio de “listo para lanzar” (seguridad)

Puedes considerar la app **segura para lanzar** cuando:

1. **`security-hardening.sql` ejecutado** en Supabase prod  
2. **Claves rotadas** (si hubo riesgo de filtración)  
3. **Variables Vercel** completas y redeploy hecho  
4. **Todas las pruebas de la Fase 7** marcadas OK  
5. **Stripe webhook** verificado en el entorno que vayas a usar (test o live)  
6. **Al menos un admin** configurado  

---

## Qué queda fuera de esta guía (siguiente conversación)

- Análisis de APIs externas (Anthropic, Yahoo, CoinGecko, etc.)
- Costes operativos y proyección por usuarios
- Legal (privacidad, cookies, disclaimer CNMV) — no es hardening técnico
- Pentest externo / bug bounty

---

## Referencias en el repo

| Documento | Contenido |
|-----------|-----------|
| `SECURITY_REPORT.md` | Auditoría detallada y hallazgos |
| `GUIA-SEGURIDAD-MANUAL.md` | Resumen corto de pasos manuales |
| `sql/security-hardening.sql` | SQL obligatorio pre-lanzamiento |
| `STRIPE_SETUP.md` | Stripe paso a paso |
| `.env.example` | Plantilla de variables (sin secretos) |

---

*Última actualización: junio 2026 — alineado con hardening de paywall en `cards` y `/api/cards`.*
