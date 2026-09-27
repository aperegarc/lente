# Auditoría de seguridad y escala

Revisión de todo el código (septiembre 2026): 14 funciones de `api/`, crons de `lib/cron/`, SQL de `sql/`, front (`public/`) y cabeceras de `vercel.json`.

## Corregido en el código

| Riesgo | Qué pasaba | Qué se hizo |
|---|---|---|
| Amplificación contra Supabase Auth | `feed`, `feed-history` y `cards` validaban el token (llamada de red a Supabase) **antes** de contar la petición. Un script con tokens falsos generaba una llamada a Auth por petición, sin límite. | `rateLimitRoute` cuenta primero. Auth solo se consulta cuando se supera el cupo público, y como mucho hasta el cupo de admin. |
| Abuso del pago | `/api/stripe/session` no tenía límite: se podían crear sesiones de Checkout sin parar. | 10 peticiones/min por IP. |
| Fugas de información | Varias rutas devolvían `err.message` de Supabase/Stripe (nombres de tablas, columnas, variables de entorno). | Respuesta genérica («Error interno»); el detalle queda en los logs de Vercel. |
| Diagnóstico abierto en previews | `/api/health` solo se cerraba en producción; en una preview pública mostraba cuántos usuarios hay. | Cerrado (404 salvo admin) en cualquier despliegue de Vercel. |
| Secreto del cron | Comparación con `!==` (filtra información por tiempo). | `crypto.timingSafeEqual`. |
| Historial sin límite | `feed-history` leía todas las tarjetas publicadas; con el tiempo, lento y truncado a 1000 filas por Supabase. | Ordenado y acotado, sin recuentos falsos en el corte. |
| HTML sin escapar | La inicial del email en el perfil se insertaba sin escapar. | `escapeHtml`. |
| Cabeceras | Faltaba `object-src 'none'` y HSTS explícito. Google Fonts obligaba a abrir la CSP a dominios de Google. | Añadidos; fuentes servidas desde `/fonts`, CSP sin terceros salvo Supabase. |

## Preparado para muchos usuarios

| Punto | Antes | Ahora |
|---|---|---|
| Feed sin sesión | Cada visita = 2 consultas a Supabase (`?_t=` rompía cualquier caché). | CDN de Vercel 60 s + 5 min *stale-while-revalidate*: 10.000 visitas/min ≈ 1 consulta/min. Con sesión se usa `?auth=1` y nunca se cachea (no se puede envenenar la caché de Premium). |
| Mercados | `?_t=` en cada carga. | Usa la caché CDN que ya tenía la API (120 s). |
| Gráficos | `from`/`to` al segundo: cada usuario una URL distinta → una llamada a Yahoo por usuario. | Tramos de 5 min: todos comparten URL y la CDN responde. |
| APIs externas | Sin timeout: si Yahoo/CoinGecko se colgaban, las funciones esperaban hasta el máximo (coste y bloqueo). Frankfurter: hasta 7 peticiones en serie. | Timeout de 6 s en todas; Frankfurter en 1 petición. |
| Vídeo de la web | 8,9 MB. | 5,3 MB (640 px), caché de 1 día en el navegador. Fuentes con caché inmutable de 1 año. |

Pruebas: `tests/security.test.mjs` (10 casos) cubre todo lo anterior. Suite completa: 85/85 unitarias, 15/15 feed, 11/11 app, 2/2 web.

## Pendiente (requiere tu acción o una decisión)

1. **Plan de Vercel.** El plan Hobby es solo para uso personal no comercial; con suscripciones de pago hay que pasar a **Pro**. Además Hobby tiene ~100 GB/mes de transferencia: con el vídeo, ~10.000 visitas a la web ya consumen la mitad.
2. **Límite distribuido.** El limitador vive en memoria de cada instancia: un ataque desde muchas IPs lo esquiva. Activa reglas de *rate limiting* en **Vercel Firewall** para `/api/*` (p. ej. 120/min por IP).
3. **Supabase.** Ejecuta los *security advisors* del panel (RLS de todas las tablas, funciones `SECURITY DEFINER`). El `REVOKE` por columnas de `profiles` no tiene efecto mientras exista el `GRANT` de tabla; lo que realmente protege `plan`/`is_admin` es el trigger `block_profile_privilege_escalation` — no lo borres. Aplica `sql/migration-favorite-markets.sql`.
4. **Plan gratuito de Supabase**: 50.000 usuarios activos/mes y 500 MB; el proyecto se pausa tras 7 días sin actividad. Para producción de pago, plan Pro.
5. **CSP sin `unsafe-inline`.** Requiere quitar los `onclick="…"` del HTML generado en `app.js` y pasar a `addEventListener` o nonces. Reduce mucho el impacto de un XSS futuro.
6. **Verificación local del JWT** (`supabase.auth.getClaims()` o JWKS) para no llamar a Supabase Auth en cada petición autenticada.
7. **Cuotas de terceros**: CoinGecko gratuito ~30 llamadas/min; Yahoo puede bloquear IPs de Vercel sin aviso. La caché CDN lo mitiga, pero para un producto de pago conviene un proveedor con contrato (ver estudio legal).
