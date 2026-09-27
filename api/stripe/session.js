// POST /api/stripe/session
// Body checkout: { "mode": "checkout", "billing": "monthly" | "yearly" }
// Body portal:   { "mode": "portal" }
// Header: Authorization: Bearer <supabase_jwt>

import Stripe from 'stripe';
import {
  getUserFromToken,
  getDeploymentUrl,
  getSupabaseAdmin,
  getStripeSecretKey,
} from '../_lib/clients.js';
import { rateLimit } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!rateLimit(req, res, { max: 10, name: 'stripe-session' })) return;

  const secret = getStripeSecretKey();
  if (!secret) {
    console.error('[stripe session] STRIPE_SECRET_KEY no configurada');
    return res.status(500).json({ error: 'Pagos no disponibles ahora mismo' });
  }

  let body = {};
  try {
    body = await readJson(req);
  } catch (_) {
    body = {};
  }

  const mode = body.mode === 'portal' ? 'portal' : 'checkout';

  const user = await getUserFromToken(req);
  if (!user?.id) {
    return res.status(401).json({
      error: mode === 'checkout' ? 'Inicia sesión para suscribirte' : 'Unauthorized',
    });
  }

  const stripe = new Stripe(secret);
  const base = getDeploymentUrl(req).replace(/\/$/, '');

  if (mode === 'portal') {
    let admin;
    try {
      admin = getSupabaseAdmin();
    } catch (e) {
      console.error('[stripe portal] supabase', e.message);
      return res.status(500).json({ error: 'Error interno' });
    }

    const { data: prof, error } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (error || !prof?.stripe_customer_id) {
      return res.status(400).json({
        error: 'No hay cuenta de facturación. Suscríbete primero desde Premium.',
      });
    }

    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: prof.stripe_customer_id,
        return_url: `${base}/`,
      });
      return res.status(200).json({ url: portal.url });
    } catch (err) {
      console.error('[stripe portal]', err.message);
      return res.status(500).json({ error: 'No se pudo abrir el portal de facturación' });
    }
  }

  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY?.trim();
  const priceYearly = process.env.STRIPE_PRICE_YEARLY?.trim();
  let billing = 'monthly';
  if (body?.billing === 'yearly') billing = 'yearly';
  const envPriceName =
    billing === 'yearly' ? 'STRIPE_PRICE_YEARLY' : 'STRIPE_PRICE_MONTHLY';
  const priceId = billing === 'yearly' ? priceYearly : priceMonthly;
  if (!priceId || !priceId.startsWith('price_')) {
    // prod_… es el error típico: Checkout necesita el Price ID (price_…) del producto.
    console.error(`[stripe checkout] ${envPriceName} vacío o no es un Price ID (price_…)`);
    return res.status(500).json({ error: 'Pagos no disponibles ahora mismo' });
  }

  const metadata = { supabase_user_id: user.id };

  const sessionParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/?checkout=success`,
    cancel_url: `${base}/?checkout=cancel`,
    client_reference_id: user.id,
    metadata,
    subscription_data: { metadata },
    allow_promotion_codes: true,
  };

  if (user.email) {
    sessionParams.customer_email = user.email;
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: prof } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();
    if (prof?.stripe_customer_id) {
      sessionParams.customer = prof.stripe_customer_id;
      delete sessionParams.customer_email;
    }
  } catch (_) {
    /* sin perfil o env */
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[stripe checkout]', err.message);
    return res.status(500).json({ error: 'No se pudo iniciar el pago' });
  }
}

async function readJson(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const { default: getRawBody } = await import('raw-body');
  const buf = await getRawBody(req, { length: req.headers['content-length'], limit: '1mb' });
  const raw = buf.toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}
