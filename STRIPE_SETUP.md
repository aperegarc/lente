# Stripe — guía de configuración (lente)

Esta app usa **Stripe Checkout** (suscripción) y **el portal de facturación de Stripe** para que el usuario cancele o cambie el plan. El backend actualiza `profiles` en Supabase vía **webhook**.

## 1. Cuenta y dashboard

1. Crea o entra en [https://dashboard.stripe.com](https://dashboard.stripe.com).
2. Activa el **modo test** (interruptor *Test mode*) mientras pruebas; pasa a **Live** solo cuando tengas dominio, variables y legales listos.

## 2. Producto y precios (5 €/mes y 20 €/año)

1. **Product catalog** → **Add product** → nombre: `lente Premium` (o similar).
2. Añade **dos precios recurrentes** en **EUR**:
   - **Mensual** — 5,00 € / **month**
   - **Anual** — 20,00 € / **year**
3. Copia el **Price ID** de cada uno (empiezan por `price_...`).

En Vercel y en `.env.local` (nunca en el frontend):

| Variable | Valor |
|----------|--------|
| `STRIPE_SECRET_KEY` | *Secret key* (sk_test_… o sk_live_…) — API keys en el panel |
| `STRIPE_PRICE_MONTHLY` | `price_...` del plan mensual |
| `STRIPE_PRICE_YEARLY` | `price_...` del plan anual |
| `STRIPE_WEBHOOK_SECRET` | lo obtienes al crear el endpoint del webhook (paso 4) |

## 3. Portal de facturación (gestionar / cancelar)

1. **Settings** → **Billing** → **Customer portal**.
2. Actívalo y en **Products** permite al menos **cambiar plan** o **cancelar** según tu política.
3. Guarda. Sin esto, el botón **Gestionar suscripción** fallará.

## 4. Webhook (obligatorio para activar Premium en la base de datos)

1. **Developers** → **Webhooks** → **Add endpoint**.
2. **URL** (producción):
   - `https://TU-DOMINIO.vercel.app/api/stripe/webhook`
3. **Events to send** — añade al menos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Crea el endpoint y copia el **Signing secret** (`whsec_...`) → variable `STRIPE_WEBHOOK_SECRET`.

**Local con `vercel dev`:** usa [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

El CLI mostrará un `whsec_...` de prueba; úsalo en `.env.local` mientras desarrollas.

> Si en producción el webhook devuelve error de **firma**, asegúrate de que la URL es **HTTPS** y de que `STRIPE_WEBHOOK_SECRET` coincide con el endpoint que acabas de crear (test vs live).

## 5. Supabase (SQL)

1. Si no lo hiciste: ejecuta `sql/schema-plan-freemium.sql` (columnas `plan`, `plan_expires_at`, `stripe_customer_id`).
2. Ejecuta `sql/schema-stripe.sql` (columna `stripe_subscription_id`).

El webhook pone `plan = 'premium'`, `stripe_customer_id`, `stripe_subscription_id` y `plan_expires_at` según la suscripción.

## 6. Vercel

**Project → Settings → Environment Variables:** añade las cuatro variables Stripe para **Production** (y **Preview** si quieres staging).

Redeploy después de guardar.

## 7. Flujo que verás como usuario

1. Inicio de sesión en la PWA → perfil → **5 €/mes** o **20 €/año**.
2. Redirección a Stripe Checkout → pago.
3. Vuelta a la app con `?checkout=success` → el webhook actualiza el perfil (puede tardar unos segundos).
4. Con Premium activo aparece **Gestionar suscripción y facturas** (portal Stripe).

## 8. Test cards (modo test)

| Campo | Valor |
|-------|--------|
| Número | `4242 4242 4242 4242` |
| Fecha | cualquier futura |
| CVC | cualquier 3 dígitos |

## 9. Checklist rápido

- [ ] Precios `price_...` creados y copiados  
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` en Vercel  
- [ ] Webhook apuntando a `/api/stripe/webhook` + `STRIPE_WEBHOOK_SECRET`  
- [ ] Portal de cliente configurado  
- [ ] SQL de Supabase aplicado  
- [ ] Prueba en test mode antes de live  

## 10. Notas legales (fuera del código)

Para cobrar en la UE/España suele hacer falta **información clara del precio**, **condiciones de cancelación**, **factura** (Stripe ayuda) y cumplimiento de **RGPD**. Consulta con un asesor si vas a producción.
