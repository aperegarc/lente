# ⚡ QUICKSTART — Arrancar en 15 minutos

Si quieres ver la app funcionando **ahora mismo**, sigue estos 5 pasos. El README tiene todos los detalles después.

## Paso 1 — Clonar y instalar

```bash
git clone https://github.com/TU-USUARIO/lente.git
cd lente
npm install
```

## Paso 2 — Configurar credenciales

**En `.env.local` (cópialo de `.env.example`):**

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJhbGci... (de Supabase → API Keys)
SUPABASE_SERVICE_KEY=eyJhbGci... (service_role)
ANTHROPIC_API_KEY=sk-ant-api03-... (de Anthropic)
OPENAI_API_KEY=sk-proj-... (de OpenAI)
CRON_SECRET=cadena-aleatoria-48-chars
```

## Paso 3 — Arrancar servidor

```bash
vercel dev
```

Espera a ver:
```
Ready! Available at http://localhost:3000
```

## Paso 4 — Verificar todo conecta

Abre en el navegador: **http://localhost:3000/api/health**

Si ves `"ready": true` → ¡todo bien!  
Si ves `"ready": false` → lee los `errors`, te dice qué falta.

## Paso 5 — Probar el flujo

1. **App:** http://localhost:3000/ (vacía, es normal)
2. **Admin:** http://localhost:3000/admin
   - Entra con tu email
   - En Supabase → profiles → marca `is_admin=true`
   - Recarga admin
3. **Disparar:**
   - Admin → sidebar → "Disparar ingestión"
   - Espera 2-3 min
4. **Ver resultado:**
   - Admin → "Pendientes" (verás 5-7 tarjetas)
   - Aprueba algunas, rechaza malas
   - "Publicar aprobadas"
5. **Refrescar app:**
   - http://localhost:3000/ → ¡verás tu feed con tarjetas reales!

---

## ¿Qué cuando algo falla?

| Problema | Solución |
|---|---|
| `/api/health` sale `"ready": false` | Lee los `errors` del JSON, te dice qué |
| "Could not load sources" | Ejecuta `schema.sql` en Supabase → SQL Editor |
| Tarjetas no se generan | Verifica que OpenAI tiene saldo ($5+) |
| Admin login no funciona | Supabase → profiles → marca `is_admin=true` |

---

## Siguiente: Deploy a Vercel

Cuando todo funcione en local:

1. `git push` a GitHub
2. Vercel → importa repo
3. Añade las mismas 6 variables en Settings → Environment Variables
4. Deploy automático
5. Tu app vive en https://lente-xxx.vercel.app

**Done.** La app está en internet y los crons corren automáticamente.

---

Más detalles: lee `README.md` completo.
