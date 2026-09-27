# Estudio legal de lente

Revisión de todo lo que usa la app (datos, pagos, IA, contenidos, proveedores y código de terceros) frente a la normativa española y europea, a septiembre de 2026.

> Es un análisis técnico hecho a partir del código, no asesoramiento jurídico. Los puntos marcados como **bloqueantes** conviene revisarlos con un abogado o gestor antes de empezar a cobrar.

## Resumen: qué hacer y en qué orden

| Prioridad | Tema | Estado | Acción |
|---|---|---|---|
| Bloqueante | Identificación del titular (LSSI art. 10) | Las 5 páginas legales tienen `[NOMBRE / NIF / DOMICILIO / EMAIL]` | Rellenarlo. Sin esto la web incumple la LSSI (multa hasta 30.000 € para infracciones leves y más para graves). |
| Bloqueante | Datos de mercado de Yahoo Finance | Se usan endpoints no oficiales en una app de pago | Contratar un proveedor con licencia (ver §6). |
| Bloqueante | Fuentes RSS de FT y Bloomberg | Sus condiciones de RSS permiten solo uso personal no comercial | Quitarlas o licenciarlas (ver §5). |
| Bloqueante | Plan Hobby de Vercel | Solo permite uso no comercial | Pasar a Vercel Pro antes de cobrar. |
| Alta | IVA y facturas | Precios anunciados sin gestión de IVA | IVA incluido ya indicado; configurar Stripe Tax/OSS y facturas válidas (ver §3). |
| Alta | Desistimiento y cancelación | No figuraban | Añadido a Términos y al perfil; falta el mecanismo operativo (ver §3). |
| Media | Derechos de autor de los resúmenes | Riesgo moderado | Mantener hechos + enlace, no reproducir texto (ver §5). |
| Media | Marca «lente» | Sin registrar | Buscar anterioridades y registrar en OEPM/EUIPO. |
| Hecho | Google Fonts | Enviaba la IP de cada visitante a Google | Sustituido por fuentes propias en `/fonts`. |
| Hecho | Transparencia IA | Etiqueta en cada tarjeta + página | Correcto; mantener. |

---

## 1. Protección de datos (RGPD y LOPDGDD)

**Qué datos hay:** email y nombre opcional (Supabase Auth), perfil (ámbitos, favoritos, racha, plan), tarjetas guardadas, ID de cliente de Stripe, IP en memoria para limitar peticiones y en los logs de Vercel.

**Bien resuelto:**
- Minimización: no hay analítica, píxeles ni publicidad. La IA (Anthropic) solo recibe noticias públicas, nunca datos de usuarios.
- Base jurídica correcta: contrato (cuenta y Premium), interés legítimo (seguridad), obligación legal (facturación).
- Edad mínima 16 años, más estricta que los 14 del art. 7 LOPDGDD.
- Tras esta revisión la política nombra a Supabase, Vercel y Stripe, explica las transferencias a EE. UU. (Marco de Privacidad de Datos UE‑EE. UU., decisión de adecuación de julio de 2023, o cláusulas tipo) y fija la conservación de facturas (hasta 6 años, art. 30 del Código de Comercio).

**Pendiente:**
- Aceptar los **contratos de encargo (DPA, art. 28 RGPD)** de Supabase, Vercel y Stripe. Se aceptan en sus paneles o condiciones; guarda copia.
- Elegir **región UE** en Supabase (Fráncfort o Irlanda) si el proyecto no lo está ya.
- Tener un **registro de actividades de tratamiento** sencillo (art. 30 RGPD). La exención para menos de 250 empleados no aplica si el tratamiento es habitual, como aquí. Basta una hoja: qué datos, para qué, quién los recibe y cuánto tiempo se guardan.
- Procedimiento para atender derechos en un mes (art. 12 RGPD): borrar la cuenta en Supabase Auth, su perfil y los datos del cliente en Stripe (salvo facturas).
- Brechas: notificar a la AEPD en 72 h si afectan a datos personales (art. 33).

## 2. Cookies (LSSI art. 22.2 y guía de la AEPD)

Todo lo que se guarda es técnico y necesario:
- La cookie `lente_session` (HttpOnly, 400 días).
- En localStorage, la sesión de Supabase y los favoritos.
- La caché del service worker.

No hace falta pedir consentimiento. La política de cookies lo explica correctamente. Si algún día se añade analítica (Google Analytics, Vercel Analytics con cookies, Meta Pixel…), habrá que poner un banner con «Aceptar» y «Rechazar» al mismo nivel antes de cargarla.

La cookie dura 400 días, el máximo que permite Chrome. Es defendible porque la finalidad (mantener la sesión) está declarada y se borra al cerrar sesión.

## 3. Consumidores y suscripción (TRLGDCU, Real Decreto Legislativo 1/2007)

**Información previa (arts. 60 y 97):** precio final con impuestos, duración, renovación, cómo cancelar y derecho de desistimiento. Tras esta revisión:
- La web muestra «IVA incluido».
- El perfil de la app muestra «IVA incluido · se renueva automáticamente · cancela cuando quieras · 14 días de desistimiento» con enlace a Términos.
- Los Términos tienen una sección «Suscripción Premium» completa.

**Botón de pago (art. 98.2):** debe indicar que implica pagar. Stripe Checkout usa «Suscribirse» / «Pagar», que es válido.

**Desistimiento (arts. 102–108):** el consumidor tiene 14 días. En servicios que empiezan a prestarse en ese plazo a petición del usuario, se puede descontar la parte ya disfrutada (art. 108.3). Así queda redactado en Términos.

Falta la parte operativa. Recomendación: en Stripe, activar la aceptación de términos en Checkout (`consent_collection.terms_of_service`, después de configurar la URL de Términos en el panel de Stripe) y tener un procedimiento de reembolso desde el panel de Stripe.

**Función de desistimiento online:** la Directiva (UE) 2023/2673 obliga, desde el 19 de junio de 2026, a ofrecer un «botón de desistimiento» en los contratos celebrados por internet. Comprueba con tu asesor cómo lo ha transpuesto España. Una solución simple es un enlace «Desistir del contrato» en el perfil que envíe la solicitud y un acuse por email.

**Cancelación tan fácil como el alta:** ya existe mediante el portal de Stripe («Gestionar suscripción y facturas»).

**Cláusula eliminada:** «el uso continuado implica aceptación» podía ser abusiva frente a consumidores (art. 85). Se ha sustituido por un preaviso de 30 días con derecho a cancelar.

**Resolución de litigios:** la plataforma europea ODR cerró en julio de 2025. El aviso legal ya no la menciona y remite a consumo y arbitraje.

**IVA:**
- Los servicios electrónicos a consumidores tributan en el país del cliente.
- Hasta 10.000 €/año de ventas a otros países de la UE se puede aplicar el IVA español (21 %). Por encima, se aplica el IVA de cada país mediante la ventanilla única (OSS).
- Stripe Tax lo automatiza.
- Con 5 € IVA incluido, tu ingreso neto es 4,13 € antes de la comisión de Stripe.

**Facturas:** deben cumplir el Reglamento de facturación (Real Decreto 1619/2012). Hacen falta tu NIF y numeración correlativa, que se configuran en Stripe Invoicing. El sistema Verifactu (Real Decreto 1007/2023) se aplazó a 2027; confírmalo con tu gestor.

## 4. Inteligencia artificial (Reglamento (UE) 2024/1689)

- **Art. 50.4**, aplicable desde el 2 de agosto de 2026: el texto generado por IA que se publica para informar al público sobre asuntos de interés público debe identificarse como tal. La excepción es que haya revisión humana y alguien asuma la responsabilidad editorial.
  - lente cumple por las dos vías: cada tarjeta se guarda como `pending` y solo se publica tras la aprobación de un admin, y además lleva la etiqueta «Resumen con asistencia de IA».
  - Mantener ambas cosas.
- **Art. 4 (alfabetización en IA)**, aplicable desde febrero de 2025: quien apruebe las tarjetas debe conocer los límites del modelo, como las alucinaciones o las cifras inventadas. Basta un documento interno de criterios de revisión.
- **Uso no de alto riesgo:** no puntúa créditos ni toma decisiones sobre personas. La página de Transparencia IA ya lo explica.
- **Condiciones de Anthropic:** la política de uso trata el asesoramiento financiero a consumidores como caso de alto riesgo y exige revisión humana y avisar del uso de IA. lente hace las dos cosas. Anthropic no entrena con datos de la API por defecto.

## 5. Contenidos de terceros: noticias y derechos de autor

**Qué hace la app:** lee titulares y extractos de RSS, genera un resumen propio con IA y enlaza el original.

- **Los hechos no están protegidos**; la expresión sí.
  - Un resumen redactado de nuevo, con los datos y el enlace «Leer original», tiene un riesgo bajo o moderado.
  - El riesgo sube si el texto se parece mucho al original.
  - Mantener la instrucción al modelo de no copiar frases y revisar en la aprobación.
- **Derecho de los editores de prensa** (art. 129 bis LPI, introducido por el Real Decreto-ley 24/2021): el uso en línea de publicaciones de prensa requiere autorización, salvo enlaces y «extractos muy breves».
  - Los extractos RSS guardados en `articles.snippet` deben ser breves y no mostrarse al público.
  - Hoy no se muestran: bien.
- **Minería de textos** (art. 67 del Real Decreto-ley 24/2021): permitida salvo que el titular se haya reservado el derecho de forma legible por máquina (robots.txt, `ai.txt`, meta `noai`). Conviene respetar esas reservas.
- **Condiciones de uso de los RSS:**
  - Financial Times y Bloomberg limitan sus feeds a uso personal no comercial.
  - El País / Cinco Días y Expansión (Unidad Editorial) reservan sus derechos.
  - Con una suscripción de pago esto es relevante. Recomendación:
    - Quitar FT y Bloomberg.
    - Pedir permiso o licencia a los medios españoles, o limitarse a titular + enlace.
    - Priorizar fuentes de reutilización libre: notas de prensa del BCE, Banco de España, INE, Eurostat, CNMV y Comisión Europea. Están amparadas por la Ley 37/2007 de reutilización de la información del sector público, citando la fuente.

## 6. Datos de mercado

| Fuente | Uso en lente | Riesgo | Recomendación |
|---|---|---|---|
| Yahoo Finance (`query1.finance.yahoo.com`) | Índices, acciones, velas | **Alto.** API no oficial; las condiciones de Yahoo prohíben la redistribución y el uso comercial; puede cortarse sin aviso | Proveedor con licencia de redistribución: Twelve Data, Finnhub, EODHD, Alpha Vantage (planes comerciales) o BME Market Data para el IBEX 35 |
| CoinGecko (API gratuita) | Precio de cripto | Medio. El plan gratuito exige atribución y tiene límites de uso | Mostrar «Datos de CoinGecko» con enlace en la vista de cripto; revisar si su plan gratuito admite uso comercial o pasar a uno de pago |
| Frankfurter (tipos del BCE) | Divisas | Bajo. Los tipos de referencia del BCE se pueden reutilizar citando la fuente | Mantener «Fuente: BCE» |

Nombres como IBEX 35, S&P 500 o MSCI World son marcas registradas. Mostrar su valor es uso descriptivo, pero los datos en sí deben venir de un proveedor con licencia.

## 7. Información financiera (Ley 6/2023 de los Mercados de Valores y Reglamento (UE) 596/2014 sobre abuso de mercado)

- Dar **información general y educativa** es libre.
- La **recomendación personalizada** sobre instrumentos concretos es un servicio de inversión que requiere autorización de la CNMV.
- Las recomendaciones de inversión sobre valores concretos, aunque no sean personalizadas, tienen obligaciones de transparencia (art. 20 del Reglamento de abuso de mercado).

lente se queda del lado correcto: el disclaimer está en la app, en los términos y en el pie de la web, y el bloque «¿Qué significa para ti?» describe efectos generales.

En esta revisión se corrigió un ejemplo de la web que decía «si te ofrecen un depósito a plazo fijo alto, este puede ser buen momento», que sonaba a recomendación. Criterios para la revisión editorial:
- Nunca «compra/vende X».
- Nada de precios objetivo.
- Nada de «es buen momento para…».
- Siempre describir el mecanismo (sube el euríbor → sube la cuota).

## 8. Proveedores y licencias de software

| Componente | Licencia o condiciones | Obligación |
|---|---|---|
| Supabase JS (en `public/vendor/`) | MIT | Conservar el aviso de copyright en el archivo |
| Apache ECharts | Apache 2.0 | Conservar la licencia y el archivo NOTICE si se distribuye |
| Fuentes Manrope, Newsreader, JetBrains Mono, Inter, Fraunces | SIL OFL 1.1 | Permite servirlas desde el propio dominio (hecho); no venderlas sueltas |
| Vercel | Términos + política de uso justo | Hobby prohíbe el uso comercial → Pro |
| Supabase | Términos + DPA | Aceptar el DPA; región UE |
| Stripe | Stripe Services Agreement | Tarifas publicadas, SCA gestionado por Stripe |
| Anthropic | Commercial Terms + Usage Policy | Revisión humana y aviso de IA (cumplido) |

**Vídeo promocional y web:** muestran datos de demostración y nombres de empresas (Apple, Microsoft, Bitcoin) en uso descriptivo, lo cual es aceptable. Si añades música, que tenga licencia comercial.

## 9. Otros

- **Marca:** busca «lente» en OEPM, EUIPO y TMview para las clases 9 (app), 38/41 (información y publicación) y 42 (software como servicio) antes de invertir en marketing. «Lente» es una palabra común, así que el registro mixto (logotipo + palabra) es más viable.
- **Accesibilidad** (Ley 11/2023, que traspone la Ley Europea de Accesibilidad): exige accesibilidad a los servicios de comercio electrónico desde el 28 de junio de 2025. Las microempresas (menos de 10 trabajadores y como mucho 2 M€ de facturación) están exentas para servicios. Aun así, conviene cuidar el contraste y la navegación con teclado.
- **Emails comerciales:** hoy solo hay emails de servicio (acceso, contraseña). Si se envía un boletín, hará falta consentimiento previo (LSSI art. 21) y un enlace de baja.

## Cambios hechos en esta revisión

- `public/legal/terminos.html`: nueva sección de suscripción (precio con IVA, renovación, cancelación, desistimiento, pagos con Stripe), preaviso de 30 días para cambios y ley aplicable y reclamaciones.
- `public/legal/privacidad.html`: proveedores con nombre, transferencias internacionales, IP y logs, conservación de facturas, favoritos, fuentes sin terceros y Anthropic sin datos de usuarios.
- `public/legal/aviso.html`: sustituida la mención a la plataforma ODR (cerrada) por consumo y arbitraje.
- `public/presentacion.html` y `public/app.js`: «IVA incluido», renovación y desistimiento visibles antes de pagar; ejemplo de «plazo fijo» reformulado.
- Todas las páginas: Google Fonts sustituido por fuentes propias (`public/fonts/`).
