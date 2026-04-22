# 🛠️ Desarrollo en local — Guía rápida

Esta guía te deja la app corriendo en tu máquina con todo funcionando: frontend + APIs + base de datos real. Cambias un archivo, refrescas el navegador, y ves el cambio. Sin redeploys.

---

## Antes de nada: arregla lo comprometido

**5 minutos, hazlo ya:**

1. **Rota la API key de Anthropic**
   - https://console.anthropic.com/settings/keys
   - Borra la key `sk-ant-api03-g7xm...`
   - Pulsa "Create Key", nombre: `lente-dev`
   - Cópiala a un sitio seguro

2. **Carga saldo en OpenAI** (la app no funciona sin esto)
   - https://platform.openai.com/settings/organization/billing
   - Add payment method → añade tarjeta
   - Add to credit balance → mete $5 mínimo
   - https://platform.openai.com/api-keys → Create new secret key → nombre `lente-dev`
   - Cópiala a un sitio seguro

3. **Rota CRON_SECRET**
   - En PowerShell:
     ```powershell
     -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 48 | % {[char]$_})
     ```
   - Copia lo que saca

---

## Paso 1 — Reemplaza los archivos de tu proyecto

Yo te he generado los archivos corregidos. Cópialos a tu proyecto **reemplazando** los que ya hay:

```
Archivos a REEMPLAZAR en tu proyecto:
  api/feed.js
  api/markets.js
  api/cron/ingest.js
  api/cron/generate.js
  api/cron/markets.js
  api/admin/cards.js
  api/admin/trigger-ingest.js
  api/admin/trigger-generate.js

Archivos NUEVOS que hay que AÑADIR:
  api/_lib/clients.js       ← crear la carpeta _lib
  api/health.js             ← endpoint de diagnóstico
```

En PowerShell, desde la carpeta de tu proyecto, una vez descomprimido el zip de fixes:

```powershell
# Copiar archivos corregidos encima de los existentes
Copy-Item -Path "..\lente-fixes\api\*" -Destination ".\api\" -Recurse -Force
```

---

## Paso 2 — Configura tu `.env.local`

Abre `.env.local` en VS Code y déjalo **exactamente así** (con tus valores reales):

```
SUPABASE_URL=https://eijmaggyxscpbnsbqrwu.supabase.co
SUPABASE_ANON_KEY=[la publishable/anon que ya tienes]
SUPABASE_SERVICE_KEY=[la secret/service_role]
ANTHROPIC_API_KEY=[la NUEVA key de Anthropic]
OPENAI_API_KEY=[tu key de OpenAI con saldo]
CRON_SECRET=[cadena aleatoria de 48 chars]
```

**Puntos críticos:**
- Sin comillas alrededor de los valores
- Sin espacios alrededor del `=`
- **Sin backticks `` ` `` al inicio o final** (esto te rompió el .env antes)
- Nada de `http://localhost:3000` en SUPABASE_URL

Si tu `.env.local` tiene una línea `VERCEL_OIDC_TOKEN=...` al principio, **bórrala**. Esa línea la mete `vercel env pull` automáticamente y no hace falta para trabajar en local.

---

## Paso 3 — Arranca el servidor local

```powershell
# Primera vez: instala dependencias
npm install

# Arrancar
vercel dev
```

Cuando arranque, te dirá:
```
> Ready! Available at http://localhost:3000
```

Abre **http://localhost:3000/api/health** en el navegador. Deberías ver un JSON así:

```json
{
  "environment": "local",
  "vars": {
    "SUPABASE_URL": "✓ https://ei...rwu.co (40 chars)",
    "ANTHROPIC_API_KEY": "✓ sk-ant-api...AAA (108 chars)",
    ...
  },
  "supabase": "✓ OK — 8 fuentes en la tabla 'sources'",
  "ready": true,
  "errors": []
}
```

**Si sale `ready: false`** te dirá exactamente qué variable está mal.

---

## Paso 4 — Probar el flujo completo

Con el servidor corriendo:

1. **Abrir la app pública:** http://localhost:3000/
   - Debería cargar pero saldrá vacía ("Sin contenido todavía"). Es lo esperado al principio.

2. **Ir al admin:** http://localhost:3000/admin
   - Login con tu email, enlace mágico
   - En Supabase, ve a Table Editor → `profiles` → busca tu usuario → pon `is_admin = true`
   - Recarga `/admin`, ahora deberías entrar

3. **Disparar el pipeline:**
   - En el admin, sidebar izquierda, pulsa **"Disparar ingestión"**
   - Abre PowerShell y mira los logs en la terminal donde corre `vercel dev`. Verás cosas como:
     ```
     [ingest] Starting RSS ingestion...
     [ingest] ✓ Expansión: 30 items, 30 nuevos
     [ingest] ✓ Reuters Biz: 25 items, 25 nuevos
     ...
     [generate] Starting generation pipeline...
     [generate] ✓ 127 embeddings generados
     [generate] ✓ Tarjeta: La Fed mantiene tipos pero insinúa recortes
     ```
   - Espera 2-3 min.

4. **Revisar:**
   - Recarga `/admin`, verás tarjetas en "Pendientes"
   - Aprueba las que te gusten, rechaza las malas, edita las que haga falta
   - Pulsa **"Publicar aprobadas"**

5. **Ver en la app pública:**
   - Abre http://localhost:3000/ en otra pestaña
   - Tu feed con tus tarjetas reales

---

## Flujo de trabajo día a día

Una vez montado, tu rutina es:

```powershell
# 1. Arrancar servidor (se queda corriendo)
vercel dev

# 2. Abrir el navegador en http://localhost:3000
# 3. Editar archivos en VS Code
# 4. Refrescar el navegador para ver cambios
```

**Cuando el cambio es en el frontend** (HTML, CSS, JS en `/public/`):
→ Refresca con **Ctrl+Shift+R** para saltar la caché. Ya está.

**Cuando el cambio es en el backend** (archivos en `/api/`):
→ Vercel Dev recompila automáticamente. Refresca la página. Ya está.

**Cuando añades variables nuevas al `.env.local`:**
→ Reinicia `vercel dev` (Ctrl+C y `vercel dev` otra vez).

---

## Subir a producción cuando esté todo bien

```powershell
git add .
git commit -m "Fixes + local dev setup"
git push
```

Vercel desplegará automáticamente. **Importante:** las variables de entorno de producción son independientes de `.env.local`. Si añades una variable nueva al `.env.local`, tienes que añadirla también en:

**Vercel Dashboard → tu proyecto → Settings → Environment Variables**

---

## Solución de problemas

### `/api/health` dice "ready: false"
Lee los `errors` del JSON. Te dice qué variable falla.

### "Could not load sources"
No has ejecutado `schema.sql` en Supabase. Ve al SQL Editor de Supabase y corre el schema otra vez.

### "OPENAI_API_KEY no configurada"
Comprueba que en `.env.local` la línea no tiene `sk-proj-...` con puntos suspensivos. Esos son el placeholder, necesitas tu key real.

### Las tarjetas no se generan
1. Abre http://localhost:3000/api/health → debe salir todo ✓
2. Mira la consola de `vercel dev`. El log te dirá dónde falla:
   - Si dice "Embeddings error" → sin saldo en OpenAI
   - Si dice "401" en Anthropic → key inválida
   - Si dice "No articles to cluster" → ingest no ha traído nada, dispárala antes

### El admin no me deja entrar aunque marqué is_admin=true
Cierra sesión y vuelve a entrar. El token se cachea.

### `vercel dev` no arranca
```powershell
# Comprobar que la CLI está instalada
vercel --version

# Si no está:
npm install -g vercel

# Si dice que el proyecto no está linkeado:
vercel link
```

---

## ¿Qué hace cada endpoint?

| URL | Qué hace |
|---|---|
| `GET /` | App pública (feed) |
| `GET /admin` | Panel admin (requiere login) |
| `GET /api/health` | Diagnóstico — úsalo para ver qué falla |
| `GET /api/feed` | Feed del día (JSON) |
| `GET /api/markets` | Mercados en vivo (JSON) |
| `POST /api/cron/ingest` | Trae RSS (requiere `Bearer CRON_SECRET`) |
| `POST /api/cron/generate` | Clustering + Claude (requiere `Bearer CRON_SECRET`) |
| `POST /api/cron/markets` | Actualiza Yahoo Finance (requiere `Bearer CRON_SECRET`) |
| `GET /api/admin/cards` | Tarjetas (requiere admin) |
| `POST /api/admin/cards` | Aprobar/rechazar/editar (requiere admin) |
| `POST /api/admin/trigger-ingest` | Dispara ingest manualmente (requiere admin) |
| `POST /api/admin/trigger-generate` | Dispara generate manualmente (requiere admin) |

---

Si algo no funciona, abre http://localhost:3000/api/health **primero**. Casi todos los problemas están ahí.
