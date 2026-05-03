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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = getStripeSecretKey();
  if (!secret) {
    return res.status(500).json({
      error: 'STRIPE_SECRET_KEY no configurada',
      hint:
        'En Vercel: guarda STRIPE_SECRET_KEY (Developers → API keys en Stripe) y haz Redeploy. En local: copia la misma línea en .env.local',
    });
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
      return res.status(500).json({ error: e.message });
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
      return res.status(500).json({ error: err.message || 'Stripe error' });
    }
  }

  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY?.trim();
  const priceYearly = process.env.STRIPE_PRICE_YEARLY?.trim();
  let billing = 'monthly';
  if (body?.billing === 'yearly') billing = 'yearly';
  const envPriceName =
    billing === 'yearly' ? 'STRIPE_PRICE_YEARLY' : 'STRIPE_PRICE_MONTHLY';
  const priceId = billing === 'yearly' ? priceYearly : priceMonthly;
  if (!priceId) {
    return res.status(500).json({
      error: `Falta ${envPriceName} en el servidor`,
    });
  }
  if (priceId.startsWith('prod_')) {
    return res.status(500).json({
      error: `${envPriceName} usa un ID de producto (prod_…). Stripe Checkout necesita el Price ID (price_…). En el dashboard: Product catalog → tu producto → Pricing → copia el ID que empieza por price_.`,
    });
  }
  if (!priceId.startsWith('price_')) {
    return res.status(500).json({
      error: `${envPriceName} debe ser un Price ID (empieza por price_). Revisa Stripe → Product catalog.`,
    });
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
    return res.status(500).json({ error: err.message || 'Stripe error' });
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
