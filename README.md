# 🔍 lente · App PWA de noticias económicas

Una app web instalable (PWA) que publica 5-7 noticias económicas diarias, explicadas en lenguaje llano para inversores pasivos. Genera contenido automáticamente con IA, permite revisión humana, y se publica al feed en minutos.

**Precio objetivo:** 12€/año  
**Público:** Inversores pasivos españoles que quieren entender mercados sin jerga  
**Tecnología:** PWA vanilla + Vercel serverless + Supabase + Claude API (generación por lotes sin embeddings)

---

## 🚀 Inicio rápido

### Requisitos previos

- **Node.js** v18+ — https://nodejs.org/
- **Git** — https://git-scm.com/
- **Cuentas creadas:**
  - GitHub — https://github.com/signup
  - Supabase — https://supabase.com (proyecto creado)
  - Vercel — https://vercel.com (conectada a GitHub)
  - Anthropic — https://console.anthropic.com (con saldo)

### Estructura de carpetas

```
lente/
├── api/                      # Endpoints serverless (Vercel)
│   ├── _lib/clients.js       # Librería compartida (config + validación)
│   ├── health.js             # Endpoint de diagnóstico
│   ├── feed.js               # Feed público
│   ├── markets.js            # Mercados en vivo
│   ├── cron/
│   │   ├── ingest.js         # Ingestión RSS (2x día)
│   │   ├── generate.js       # Claude: lista RSS → tarjetas (JSON)
│   │   └── markets.js        # Yahoo Finance
│   └── admin/
│       ├── cards.js          # CRUD admin
│       ├── trigger-ingest.js # Dispara ingestión manual
│       └── trigger-generate.js
├── public/                   # PWA (frontend)
│   ├── index.html
│   ├── admin.html
│   ├── app.js
│   ├── config.js             # Credenciales Supabase (públicas)
│   ├── styles.css
│   ├── manifest.json         # Instalable en móvil
│   ├── sw.js                 # Service worker
│   └── icon-*.png
├── sql/
│   └── schema.sql            # Schema de Supabase (ejecutar 1x)
├── .env.example              # Plantilla
├── .gitignore
├── package.json
├── vercel.json               # Config de Vercel (crons, rewrites)
└── README.md                 # Este archivo
```

---

## 🔧 Setup local (desarrollo)

### Paso 1 — Preparar credenciales

**Si compartiste keys, rótalas:**

1. **Anthropic:** https://console.anthropic.com/settings/keys → Delete → Create new
2. **CRON_SECRET:** En PowerShell: `-join ((65..90)+(97..122)+(48..57) | Get-Random -Count 48 | % {[char]$_})`

### Paso 2 — Clonar proyecto

```bash
git clone https://github.com/TU-USUARIO/lente.git
cd lente
npm install
```

### Paso 3 — Configurar `.env.local`

```bash
cp .env.example .env.local
```

Abre `.env.local` y rellena con tus valores:

```
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-api03-...
CRON_SECRET=[cadena-aleatoria-48-chars]
```

**Puntos críticos:**
- Sin comillas alrededor de valores
- Sin espacios: `KEY=value`
- Sin backticks pegados

### Paso 4 — Verificar conexión

```bash
vercel dev
```

Abre: **http://localhost:3000/api/health**

Debe salir `"ready": true`.

### Paso 5 — Ejecutar schema SQL

1. Supabase → SQL Editor → New query
2. Abre `sql/schema.sql`, copia todo
3. Pega en Supabase → Run
4. Espera a que termine

### Paso 6 — Probar flujo completo

1. **App:** http://localhost:3000/
2. **Admin:** http://localhost:3000/admin
   - Login con tu email
   - Supabase → profiles → `is_admin = true`
   - Recarga
3. **Disparar:** Admin → "Disparar ingestión"
4. **Esperar:** 2-3 min (mira los logs)
5. **Revisar:** Admin → "Pendientes" → aprueba/rechaza
6. **Publicar:** "Publicar aprobadas"
7. **Ver:** Recarga http://localhost:3000/ → feed con tarjetas reales

---

## 📱 Deploy a producción (Vercel)

### Paso 1 — Subir a GitHub

```bash
git add .
git commit -m "lente PWA MVP - ready for production"
git push
```

### Paso 2 — Conectar Vercel

1. https://vercel.com/dashboard → Add New → Project
2. Importa repo de GitHub
3. Framework: "Other" | Build: vacío | Output: "public"

### Paso 3 — Variables de entorno

Settings → Environment Variables → Añade 5:

| Name | Value |
|---|---|
| SUPABASE_URL | https://TU-PROYECTO.supabase.co |
| SUPABASE_ANON_KEY | eyJhbGci... |
| SUPABASE_SERVICE_KEY | eyJhbGci... |
| ANTHROPIC_API_KEY | sk-ant-api03-... |
| CRON_SECRET | cadena-aleatoria-48-chars |

### Paso 4 — Verificar en producción

Vercel te da URL tipo: `https://lente-xxx.vercel.app`

Abre:
- `https://lente-xxx.vercel.app/api/health` → debe salir `"ready": true`
- `https://lente-xxx.vercel.app/` → app pública
- `https://lente-xxx.vercel.app/admin` → panel admin

### Paso 5 — Crons automáticos

Ya están en `vercel.json`:
- Ingest: 06:00 UTC cada día
- Markets: cada 15 min (08:00-22:00 UTC)

Vercel los ejecuta automáticamente.

### Paso 6 — Dominio propio (opcional)

1. Compra dominio en Cloudflare/Namecheap (~10€/año)
2. Vercel → Settings → Domains → Añade dominio
3. Configura DNS (Vercel te dice cómo)
4. Espera propagación (5 min - 24h)
5. HTTPS automático

---

## 🛠️ Flujo de trabajo diario

### Desarrollo local

Cambias archivo → refrescas navegador → ves cambio.

```bash
# Terminal: servidor corriendo
vercel dev

# Editor: editas y guardas (Ctrl+S)
# Navegador: F5 para refrescar
```

### Deploy a producción

```bash
git add .
git commit -m "tu cambio"
git push
```

Vercel deploya automáticamente en 1-2 min.

---

## 🔍 Diagnóstico de errores

### `/api/health` sale `"ready": false`

Lee los `errors` del JSON. Te dice exactamente qué falta.

**Casos comunes:**
- SUPABASE_URL apunta a localhost → cambiar a URL real
- Key tiene `...` → rellenar con valor real
- "Could not load sources" → ejecutar schema.sql

### Tarjetas no se generan

1. Abre http://localhost:3000/api/health → verifica ✓
2. Mira logs en terminal
3. Busca errores:
   - "401" / Anthropic → API key inválida o sin saldo
   - "Sin artículos recientes" → ejecuta ingest primero
   - JSON inválido → revisa logs de Claude; reintenta generar

---

## 📊 Arquitectura

### Pipeline automático (2x/día)

```
1. RSS Ingest → artículos en BD
2. Dedupe de titulares + ventana 72h
3. Un prompt Claude → varias tarjetas (JSON + ids de artículo)
4. Revisión humana → aprueba/rechaza
5. Publicación → aparece en feed
```

### Base de datos (Supabase)

- **articles** — noticias RSS
- **clusters** — grupos temáticos
- **cards** — tarjetas (status: pending/approved/rejected/published)
- **markets** — cotizaciones
- **profiles** — usuarios + permisos
- **saved_cards** — favoritos

Todas con Row Level Security (RLS).

---

## 💰 Costes operativos

| Servicio | Coste/mes |
|---|---|
| Vercel (Hobby) | 0€ |
| Supabase (Free) | 0€ |
| Claude API | ~8€ |
| Dominio | ~1,25€ (anualizado) |
| **Total** | **~9€/mes** |

Facturación: 12€/año × 1.000 usuarios = 12.000€/año  
Margen bruto: ~90%

---

## 🚨 Seguridad

- `.env.local` nunca sube a Git (en `.gitignore`)
- Variables en Vercel son privadas
- Supabase RLS protege datos públicos
- Magic links para login (sin contraseñas)
- CRON_SECRET protege endpoints automáticos

---

## 📚 Recursos

- Supabase: https://supabase.com/docs
- Claude: https://docs.anthropic.com
- Vercel: https://vercel.com/docs
- PWA: https://web.dev/progressive-web-apps/

---

## 🤝 Próximos pasos

- **Fase B:** Monetización (Stripe, paywall)
- **Fase C:** Retención (notificaciones push, rachas)
- **Fase D:** Legal (términos, privacidad, disclaimer)
- **Fase E:** Nativo (React Native para App Store/Play)

---

**Versión:** 1.0 — MVP funcional con ingestión automática, IA y admin panel  
**Última actualización:** 22 de abril de 2026
