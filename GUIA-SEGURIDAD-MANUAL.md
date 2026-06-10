# Guía de pasos manuales — seguridad lente

Después del deploy del código corregido, **tú** debes completar estos pasos en dashboards externos. Sin ellos, la app sigue expuesta.

---

## 1. Supabase — SQL de endurecimiento (obligatorio)

1. Abre [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto → **SQL Editor**.
2. Copia y ejecuta **todo** el archivo `sql/security-hardening.sql`.
3. Verifica en **Table Editor** → cada tabla:
   - `articles`, `sources`, `clusters` → **RLS enabled** (sin políticas públicas).
   - `profiles`, `cards`, `markets`, `saved_cards` → **RLS enabled**.

**Comprobar que funciona:**

```sql
-- Como test (con anon key en SQL editor no aplica igual), desde la app:
-- Un usuario logueado NO debe poder ejecutar:
-- UPDATE profiles SET plan = 'premium' WHERE id = auth.uid();
```

---

## 2. Rotar claves filtradas (obligatorio si el repo fue compartido)

Si alguna vez subiste claves reales a Git (`.env.example` antiguo o `config.js`):

| Clave | Dónde rotar |
|-------|-------------|
| **SUPABASE_SERVICE_KEY** | Supabase → Settings → API → **Reset service role key** |
| **SUPABASE_ANON_KEY** | Supabase → Settings → API → **Reset anon key** (opcional pero recomendado) |
| **ANTHROPIC_API_KEY** | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **CRON_SECRET** | Genera uno nuevo (48 chars) y actualiza en Vercel + `.env.local` |
| **STRIPE_SECRET_KEY / WEBHOOK** | Stripe Dashboard → Developers → API keys / Webhooks |

Después de rotar, actualiza **Vercel → Settings → Environment Variables** y tu `.env.local`, y haz **Redeploy**.

---

## 3. Vercel — variables de entorno

Confirma que existen en **Production** (y Preview si usas previews):

| Variable | Notas |
|----------|--------|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | Se sirve al cliente vía `/config.js` → `/api/public-config` |
| `SUPABASE_SERVICE_KEY` | **Solo servidor** — nunca en frontend |
| `ANTHROPIC_API_KEY` | Solo servidor |
| `CRON_SECRET` | Mínimo 32 caracteres aleatorios; Vercel Cron lo envía como Bearer |
| `STRIPE_*` | Si usas pagos |

**Preview deployments:** usa proyecto Supabase de **staging** o desactiva previews públicos (Settings → Deployment Protection).

---

## 4. Supabase Auth

1. **Authentication → URL Configuration:** añade tus dominios de producción y `/admin` en redirect URLs.
2. **Authentication → Providers → Email:** activa **Confirm email** si quieres exigir verificación antes de suscribirse.
3. **Authentication → Rate limits:** revisa límites de login/registro (anti fuerza bruta).

---

## 5. Stripe

1. Webhook apuntando a `https://TU-DOMINIO/api/stripe/webhook` (POST).
2. Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Copia el **Signing secret** (`whsec_…`) a `STRIPE_WEBHOOK_SECRET` en Vercel.

---

## 6. Admin de la app

Tu usuario debe tener en Supabase:

```sql
UPDATE profiles SET is_admin = true WHERE email = 'tu-email@ejemplo.com';
```

Solo usuarios con `is_admin = true` pueden usar `/admin` y `/api/health` en producción.

---

## 7. Comprobaciones post-deploy

| Prueba | Resultado esperado |
|--------|-------------------|
| Abrir `/config.js` | JavaScript con `SUPABASE_URL` desde env (no vacío) |
| `/api/health` sin login (prod) | **404** |
| `/api/health` con JWT admin | JSON con `ready` |
| Login usuario normal → intentar Premium sin pagar | Solo 5 tarjetas en feed |
| Panel admin con usuario no admin | Mensaje “sin permisos” |
| Crons 06:00 UTC | Ingest + markets ejecutan (revisar logs Vercel) |

---

## 8. Opcional (recomendado)

- **Vercel Firewall / Rate limiting** en `/api/stripe/session` y rutas auth.
- **Supabase → Logs** para detectar consultas anómalas a `articles`.
- **`npm audit fix`** periódico (dependencias de `vercel` CLI en dev).
- Si el repo fue público con secretos: considera `git filter-repo` o BFG para limpiar historial Git.

---

## Qué ya hizo el código (no repetir)

- RLS SQL preparado en `sql/security-hardening.sql`
- Config cliente desde servidor (`/api/public-config` + rewrite `/config.js`)
- XSS escapado en feed y admin
- Admin verifica `is_admin` real
- `/api/health` oculto en producción
- Cabeceras CSP / X-Frame-Options en `vercel.json`
- Crons reforzados (secret + header Vercel o trigger admin)
- Validación en `/api/admin/cards` y `/api/feed`
