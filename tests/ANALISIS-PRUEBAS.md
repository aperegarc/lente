# Análisis de pruebas · lente

Fecha: 26 sep 2026 · Node v26.8.2 · sin npm ni `.env.local` en la máquina.

## Cómo ejecutar

```bash
node local-demo/server.mjs     # app en http://localhost:3000 con datos simulados (npm run demo)
node --test tests/             # batería de pruebas (npm test)
node tests/e2e/feed-layout.e2e.mjs --shots   # feed en 13 pantallas + giro (capturas en tests/e2e/capturas/)
node tests/e2e/app-features.e2e.mjs          # favoritos de mercados y cookie de sesión
node promo/grabar-video.mjs    # regenera promo/lente-promo.mp4 (requiere el servidor demo, chromium y ffmpeg)
```

Ninguno de los tres necesita `npm install`.

## Estado de partida

- No había pruebas automáticas: ni script `test` en `package.json`, ni framework.
- `test-supabase.js` y `test-supabase-with-env.js` son scripts manuales de conexión a Supabase (necesitan dependencias y credenciales). No verifican nada de la app.

## Resultado

`node --test`: 91 pruebas, **85 pasan, 0 fallan, 6 pendientes** (`todo` = problemas reales detectados, documentados sin romper la suite).

| Bloque | Qué cubre | Resultado |
|---|---|---|
| Sintaxis | `node --check` de los 31 JS de `api/`, `lib/`, `public/`, `scripts/`, `local-demo/` | 31/31 |
| `validate.js` | `firstQuery`, `isUuid`, `clampInt`, `sanitizeText`, `isIsoDate` | 5/6 |
| `madrid-day.js` | fecha de Madrid, horario de verano e invierno, días de cambio de hora | 5/5 |
| `yahoo-chart.js` | mapeo de símbolos, intervalos, fallback `.MC` | 3/4 |
| Catálogo de mercados | símbolos únicos, categorías, ids de CoinGecko/Frankfurter | 2/2 |
| `vercel.json` | rewrites apuntan a archivos existentes, crons enrutados, máximo 12 funciones Hobby | 3/3 |
| PWA | assets del service worker e iconos del manifest existen | 2/2 |
| Categorías | coherencia entre la IA (`generate.js`) y la app (`app.js`) | 1/3 |
| Configuración | `.env.example`, `.gitignore`, criterio de `CRON_SECRET` | 3/3 |
| Servidor demo (integración HTTP) | páginas, rewrites, legal, APIs, validación de parámetros, path traversal | 14/14 |
| Seguridad (`security.test.mjs`) | el límite de peticiones cuenta antes de validar tokens (tokens falsos no llegan a Supabase Auth), cupo de admin acotado, secreto del cron en tiempo constante, caché CDN del feed solo para anónimos y nunca para 429, sin mensajes internos en respuestas públicas, timeouts en APIs externas | 10/10 |
| Sesión (`/api/session`) | cookie HttpOnly de 400 días, lectura, borrado, origen ajeno 403, token inválido 400 | 7/7 |
| Feed E2E (13 pantallas, 320×568 → 1920×1080) | la tarjeta ocupa todo su hueco y no se corta ni parte líneas; «Leer más» expande y vuelve a encajar; al abrir se ve el resumen; girar el móvil mantiene la tarjeta | 15/15 |
| Favoritos y sesión E2E | estrella en cada mercado, pestaña Favoritos, orden del ticker, persistencia, cookie que sobrevive a borrar localStorage y se borra al cerrar sesión | 11/11 |
| Web de presentación E2E (escritorio y móvil) | el vídeo del inicio avanza con el scroll y cambia de escena, sin bloqueos de CSP, imágenes rotas ni scroll horizontal; fuentes servidas desde el propio dominio | 2/2 |
| Recorrido E2E en Chromium | el grabador del vídeo recorre Hoy → Leer más → Mercados → Cripto → gráfico Bitcoin 1D/1M → Ámbitos → filtro Bolsa → login | OK (sin timeouts) |

## Problemas encontrados

Ordenados por impacto:

1. **Ámbitos desincronizado con las categorías de la IA.** `generate.js` genera «Política monetaria», «Materias primas» y «Macro Europa», que no tienen Ámbito, así que esas noticias no se pueden filtrar. Al revés, «Inmobiliario» y «Laboral» aparecen en Ámbitos pero la IA nunca las genera: siempre marcan «0 hoy».
2. **Gráficos de acciones españolas.** La app pide `SAN`, `BBVA`… a Yahoo; `SAN` y `BBVA` existen en NYSE (ADR en dólares), así que el gráfico no es el de la Bolsa de Madrid. El fallback a `.MC` solo actúa si no hay datos.
3. **El ticker de «Hoy» sale vacío** hasta que el usuario entra en Mercados (`loadMarkets` solo se llama al cambiar de pestaña). Se ve en el vídeo.
4. **`isIsoDate` acepta fechas imposibles** (`2026-13-45`). Bajo impacto: Supabase devolvería error o vacío.
5. **Límite de 10 peticiones/min en `/api/candles`.** Un usuario que cambia periodos y activos agota el cupo en segundos y ve «Demasiadas peticiones».

## Documentación desactualizada

- `QUICKSTART.md`, `DESARROLLO-LOCAL.md` e `INSTRUCCIONES-FINALES.txt` piden `OPENAI_API_KEY` y hablan de embeddings; el código ya no los usa. `sql/schema.sql` sigue creando la extensión `vector` y un índice `ivfflat`.
- `README.md`: precio de 12 €/año; la app cobra 5 €/mes o 20 €/año.
- `README.md`: «Markets cada 15 min»; `vercel.json` lo ejecuta una vez al día (06:00 UTC).
- Las guías usan comandos de PowerShell; en esta máquina (CachyOS) no aplican.

## Qué no se ha podido probar

Todo lo que necesita credenciales o dependencias npm: login y registro en Supabase, panel admin, ingesta RSS, generación con Claude, cron de mercados, Stripe (checkout, portal, webhook), RLS de Supabase y `rate-limit.js` (importa `@supabase/supabase-js`).

Para cubrirlo:

1. `sudo pacman -S npm && npm install`
2. Crear `.env.local` a partir de `.env.example`
3. `npm run dev` y comprobar `http://localhost:3000/api/health`
4. Añadir pruebas de los handlers con un cliente Supabase simulado, y un proyecto Supabase de pruebas para RLS.
