# lente · MVP

Una app PWA de noticias económicas diarias explicadas para inversores pasivos españoles. Las noticias se generan automáticamente con IA a partir de fuentes RSS reales, pasan por revisión humana, y se publican al feed. Precio objetivo: 12€/año.

## Tecnologías

- **Frontend:** PWA vanilla (HTML + CSS + JS), instalable en móvil
- **Backend:** Vercel serverless functions
- **Base de datos:** Supabase (PostgreSQL + autenticación + vector store)
- **Generación:** Claude API (Anthropic) + OpenAI embeddings
- **Mercados:** Yahoo Finance (librería `yahoo-finance2`, gratis)
- **Deploy:** Vercel con cron jobs automáticos

## Estructura del proyecto

```
lente/
├── api/
│   ├── cron/
│   │   ├── ingest.js       ← RSS cada 12h
│   │   ├── generate.js     ← clustering + Claude
│   │   └── markets.js      ← Yahoo Finance cada 15 min
│   ├── admin/
│   │   ├── cards.js                ← CRUD de tarjetas
│   │   ├── trigger-ingest.js       ← disparar ingest a mano
│   │   └── trigger-generate.js     ← disparar generate a mano
│   ├── feed.js             ← feed público
│   └── markets.js          ← mercados público
├── public/
│   ├── index.html          ← app pública
│   ├── admin.html          ← panel editorial
│   ├── styles.css
│   ├── app.js              ← lógica de la PWA
│   ├── config.js           ← credenciales Supabase (public)
│   ├── manifest.json       ← PWA
│   ├── sw.js               ← service worker
│   └── icon-*.png          ← iconos PWA
├── sql/
│   └── schema.sql          ← esquema completo de Supabase
├── .env.example            ← variables de entorno
├── .gitignore
├── package.json
└── vercel.json             ← configuración deploy + crons
```

---

# Guía de deploy paso a paso (Windows)

Tiempo total: ~90 minutos si nunca has usado ninguno de estos servicios. 30 minutos si ya los conoces.

## Pre-requisitos

Antes de empezar, instala estos programas:

### 1. Node.js (v18 o superior)

Descárgalo desde https://nodejs.org/ (pilla la versión LTS). Instalador normal de Windows, siguiente-siguiente.

Verifica en PowerShell:
```powershell
node -v
npm -v
```

### 2. Git

Desde https://git-scm.com/download/win. Durante la instalación, acepta los valores por defecto.

Verifica:
```powershell
git --version
```

### 3. Editor de código

Recomiendo **VS Code** (https://code.visualstudio.com/). Lo usaremos para editar `.env.local` y ver los archivos del proyecto.

### 4. Cuenta en estos servicios

Regístrate en los 4 (todos tienen plan gratuito que basta para empezar):

- **GitHub** — https://github.com/signup
- **Supabase** — https://supabase.com (regístrate con GitHub, es más rápido)
- **Vercel** — https://vercel.com (regístrate con GitHub también)
- **Anthropic** — https://console.anthropic.com (para la API de Claude)
- **OpenAI** — https://platform.openai.com (solo para embeddings)

En Anthropic y OpenAI tendrás que **añadir una tarjeta de crédito** y cargar al menos $5 de saldo inicial. No es suscripción, es prepago. Los $5 te dan para meses.

---

## Paso 1 — Clonar el repositorio localmente

1. Pide a Dani el zip del proyecto. Descomprímelo en una ubicación cómoda, por ejemplo `C:\Users\Adrian\Projects\lente`.

2. Abre **PowerShell** y navega a la carpeta:
```powershell
cd C:\Users\Adrian\Projects\lente
```

3. Instala las dependencias:
```powershell
npm install
```

Esto descargará `rss-parser`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `openai`, `yahoo-finance2`. Unos 2 minutos.

---

## Paso 2 — Configurar Supabase

### 2.1 Crear el proyecto

1. Entra en https://supabase.com/dashboard
2. **New project**
3. Rellena:
   - **Name:** lente
   - **Database Password:** .twkDJ,M3PmnN+D
   - **Region:** `Europe West (Ireland)` — la más cercana a España
   - **Pricing plan:** Free
4. Pulsa **Create new project** y espera 2-3 minutos a que aprovisione.

### 2.2 Ejecutar el schema

1. En el panel lateral, pincha **SQL Editor**
2. Pulsa **New query**
3. Abre `sql/schema.sql` del proyecto en VS Code, copia todo, pega en el editor de Supabase
4. Pulsa **Run** (o `Ctrl+Enter`)

Debería salir "Success. No rows returned" sin errores rojos. Si hay error sobre la extensión `vector`, ve a **Database → Extensions** y activa manualmente `vector` y `pgcrypto`, luego vuelve a correr el schema.

### 2.3 Verificar tablas

Ve a **Table Editor** (panel lateral). Deberías ver estas tablas:
- `sources` (con 8 filas pre-cargadas)
- `articles`
- `clusters`
- `cards`
- `markets` (con 11 filas)
- `profiles`
- `saved_cards`

Si todas están, perfecto.

### 2.4 Copiar las credenciales

Ve a **Project Settings** (icono engranaje abajo a la izquierda) → **API**. Verás:

- **Project URL:** `https://eijmaggyxscpbnsbqrwu.supabase.co`  → será tu `SUPABASE_URL`
- **anon public:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpam1hZ2d5eHNjcGJuc2Jxcnd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NzIzMzUsImV4cCI6MjA5MjM0ODMzNX0.WGRSRs84tuD1m3vP7mWRsaEVbWbAIC82GteVFilvCyQ` → será tu `SUPABASE_ANON_KEY`
- **service_role (secret):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpam1hZ2d5eHNjcGJuc2Jxcnd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njc3MjMzNSwiZXhwIjoyMDkyMzQ4MzM1fQ.m96sokHbPjqoBGrNeXIihLFUhCtSgs5WfVLF2zy-RhU` → será tu `SUPABASE_SERVICE_KEY`

Guárdalas en un archivo temporal, las usaremos en el Paso 4.

---

## Paso 3 — Conseguir API keys de IA

### 3.1 Anthropic (Claude)

1. https://console.anthropic.com/settings/keys
2. Pulsa **Create Key**
3. Nombre: "lente-production"
4. Copia la key (empieza con `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`). **Guárdala ya, no la podrás volver a ver.**
5. Ve a **Billing** → carga al menos $10 (te durarán meses)

### 3.2 OpenAI (solo para embeddings)

1. https://platform.openai.com/api-keys
2. **Create new secret key** → nombre "lente-embeddings"
3. Copia la key (`sk-proj-...`)
4. Ve a **Billing** → añade $5 (suficiente para 50.000 embeddings)

### 3.3 Generar CRON_SECRET

En PowerShell, ejecuta:
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

Copia la cadena que sale HgAinys0vrDC3UItWjFkS9BpK8Mu4ba1ofdlNxGwJRVeTPzc. Será tu `CRON_SECRET` — protege los endpoints de cron para que nadie los llame desde fuera.

---

## Paso 4 — Configurar el frontend en local

1. Abre `public/config.js` en VS Code
2. Reemplaza los valores con los tuyos de Supabase:

```javascript
window.LENTE_CONFIG = {
  SUPABASE_URL:      'https://xxxxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',  // anon public
  API: {
    feed:    '/api/feed',
    markets: '/api/markets',
  },
};
```

**Importante:** aquí solo la `SUPABASE_ANON_KEY`, no el `SERVICE_KEY`. La service key es secreta, va solo en el backend.

---

## Paso 5 — Subir el código a GitHub

1. En GitHub, crea un repo nuevo llamado `lente` → **privado** (por si acaso)
2. No lo inicialices con README (ya tienes archivos locales)
3. En PowerShell, dentro de la carpeta del proyecto:

```powershell
git init
git add .
git commit -m "Initial commit - lente MVP"
git branch -M main
git remote add origin https://github.com/aperegarc/lente.git
git push -u origin main
```

Si es la primera vez que usas git en Windows, te pedirá configurar tu email y nombre:
```powershell
git config --global user.email "tu@email.com"
git config --global user.name "Adrian"
```

Y te pedirá loguearte en GitHub. Usa el navegador que abra automáticamente.

---

## Paso 6 — Deploy en Vercel

### 6.1 Importar el proyecto

1. https://vercel.com/dashboard → **Add New → Project**
2. Conecta tu cuenta de GitHub si no lo hiciste ya
3. Busca el repo `lente` → **Import**

### 6.2 Configurar el build

En la pantalla de configuración:
- **Framework Preset:** `Other`
- **Build Command:** (déjalo vacío)
- **Output Directory:** `public`
- **Install Command:** `npm install`

### 6.3 Variables de entorno

Desplega **Environment Variables** y añade TODAS estas (una por una, puedes pegar en `VALUE`):

| Name | Value |
|---|---|
| `SUPABASE_URL` | tu Project URL de Supabase |
| `SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_KEY` | service_role key (secreta) |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
| `OPENAI_API_KEY` | `sk-proj-...` |
| `CRON_SECRET` | la cadena aleatoria que generaste |

### 6.4 Deploy

Pulsa **Deploy**. Tarda 1-2 minutos.

Cuando acabe, te dará una URL tipo `https://lente-xxxx.vercel.app`. Ábrela y deberías ver la app (vacía, pero sin errores visuales).

### 6.5 Añadir la variable DEPLOYMENT_URL

Ahora que tienes la URL de Vercel:
1. Ve a **Settings → Environment Variables** del proyecto en Vercel
2. Añade `DEPLOYMENT_URL` = `https://lente-xxxx.vercel.app` (tu URL real, sin barra al final)
3. Ve a **Deployments** y pulsa los 3 puntos del último deploy → **Redeploy** para aplicar la variable

---

## Paso 7 — Darte permisos de admin

1. Abre la app en `https://lente-xxxx.vercel.app/admin`
2. Verás la pantalla de login. Pon tu email y pulsa **Enviar enlace**
3. Revisa tu bandeja (y spam). El email viene de Supabase.
4. Haz clic en el enlace. Te redirige a `/admin` pero saldrá el error "Tu usuario no tiene permisos de admin"
5. Vuelve a Supabase → **Table Editor → profiles**
6. Busca la fila con tu email. Edita el campo `is_admin` → marca como `true`
7. Vuelve a recargar `/admin` → ahora sí entras al panel

---

## Paso 8 — Primera ejecución manual

Hasta aquí la infraestructura está montada pero no hay contenido. Vamos a disparar el pipeline a mano por primera vez.

### Opción A — Desde el admin panel (recomendado)

1. En `/admin`, pulsa **"Disparar ingestión"** (barra lateral izquierda)
2. Espera 30-60 segundos. La ingestión traerá noticias de 8 fuentes RSS.
3. Recarga la página. Si todo va bien, deberías ver tarjetas en "Pendientes" después de 2-3 minutos.

### Opción B — Desde PowerShell (para debugging)

Si algo no va, puedes disparar los crons directamente:

```powershell
$url = "https://lente-xxxx.vercel.app"
$secret = "TU_CRON_SECRET"

# Ingestión RSS
Invoke-WebRequest -Uri "$url/api/cron/ingest" -Headers @{Authorization="Bearer $secret"}

# Esperar ~30s y después:
Invoke-WebRequest -Uri "$url/api/cron/generate" -Headers @{Authorization="Bearer $secret"}

# Mercados
Invoke-WebRequest -Uri "$url/api/cron/markets" -Headers @{Authorization="Bearer $secret"}
```

---

## Paso 9 — Revisar y publicar

1. En `/admin`, ve a **Pendientes**. Deberías ver 5-7 tarjetas generadas por Claude.
2. Revisa cada una. Si está bien, pulsa **Aprobar**. Si necesita cambios, **Editar**. Si es mala, **Rechazar**.
3. Cuando tengas las que quieras, pulsa **Publicar aprobadas** (arriba a la derecha).
4. Abre la app pública en otra pestaña (`https://lente-xxxx.vercel.app`) → verás el feed con las tarjetas publicadas.

---

## Paso 10 — Cron automático

El `vercel.json` ya tiene configurados los crons:
- **Ingest:** todos los días a las 06:00 y 14:00 UTC (07:00 y 15:00 España en invierno)
- **Markets:** cada 15 min entre las 8:00 y 22:00 UTC

Verificar que están activos:
1. Vercel → tu proyecto → **Settings → Crons**
2. Deberías ver los 2 crons listados

**Importante — plan de Vercel:** los crons están limitados en el plan Hobby gratuito a una vez al día como máximo para cada uno. Si quieres 2 veces al día para ingest, necesitas el plan **Pro** ($20/mes). Al principio, deja ingest en una sola ejecución diaria.

Si prefieres mantener el plan gratuito, edita `vercel.json` y cambia el schedule a `0 6 * * *` (solo 06:00).

---

## Paso 11 — Dominio propio (opcional)

Cuando quieras usar `lente.app` o similar en vez de la URL de Vercel:

1. Compra el dominio donde quieras (Cloudflare, Namecheap, Google Domains — el de Cloudflare es el más barato normalmente).
2. En Vercel → tu proyecto → **Settings → Domains → Add Domain**.
3. Vercel te dará instrucciones específicas: normalmente un registro `A` apuntando a `76.76.21.21` y/o un `CNAME` a `cname.vercel-dns.com`.
4. Espera propagación DNS (puede tardar 5 min a 24h).
5. Vercel te gestiona el certificado HTTPS automáticamente.

---

## Solución de problemas comunes

### "La ingestión no trae nada"

- Comprueba en Supabase → `articles` si hay filas después de disparar
- Si no hay, revisa Vercel → **Deployments → [último] → Functions** para ver logs
- Puede que un RSS esté caído temporalmente, no es grave — cuando corra el siguiente ciclo funcionará

### "El clustering genera tarjetas raras"

- Es normal al principio con pocos artículos. Necesita volumen (50+ artículos) para que los clusters tengan sentido
- Revisa el prompt en `api/cron/generate.js` — lo puedes ajustar

### "Las llamadas a Claude fallan"

- Comprueba que tienes saldo en https://console.anthropic.com/settings/billing
- Revisa los logs en Vercel

### "El service worker no actualiza la app"

- En el navegador, abre DevTools → Application → Service Workers → **Unregister** y recarga. En producción incrementa `VERSION` en `sw.js` cada deploy grande.

### "El admin no me deja entrar aunque soy admin"

- Verifica en Supabase que la fila de tu usuario en `profiles` tiene `is_admin = true`
- Cierra sesión y vuelve a entrar para refrescar el token

---

## Próximos pasos (Fase B en adelante)

Cuando la Fase A esté desplegada y funcionando:

1. **Monetización** — integrar Stripe para suscripciones anuales de 12€
2. **Paywall** — limitar a 2-3 tarjetas/día para no-suscriptores
3. **Notificaciones push** — avisar cuando se publica el resumen diario
4. **Analytics** — medir retención, lecturas por tarjeta, funnel de conversión
5. **Legal** — términos, privacidad, disclaimer financiero (necesario antes de cobrar)
6. **Mejoras del pipeline** — feedback loop con las tarjetas que más se leen

---

## Coste estimado operación

Para los primeros 1.000 usuarios mensuales:
- Supabase Free: 0€
- Vercel Hobby: 0€ (o Pro 20€ si necesitas más crons)
- Claude API: ~5-15€/mes (7 tarjetas/día × 30 días × ~0,05€)
- OpenAI embeddings: ~1-2€/mes
- Dominio: 10-15€/año

**Total: ~10-40€/mes** hasta que escales de verdad.

A 12€/año × 1.000 usuarios = 12.000€/año ingresos. Margen bruto muy sano.

---

¿Dudas? Pregunta a Claude abriendo una nueva conversación y pega el contexto del proyecto.
