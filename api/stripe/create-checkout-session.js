// POST /api/stripe/create-checkout-session
// Body: { "billing": "monthly" | "yearly" }
// Header: Authorization: Bearer <supabase_jwt>

import Stripe from 'stripe';
import { getUserFromToken, getDeploymentUrl, getSupabaseAdmin } from '../_lib/clients.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY?.trim();
  const priceYearly = process.env.STRIPE_PRICE_YEARLY?.trim();

  if (!secret || secret.includes('...')) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY no configurada' });
  }

  let billing = 'monthly';
  try {
    const body = await readJson(req);
    if (body?.billing === 'yearly') billing = 'yearly';
  } catch (_) {
    /* default monthly */
  }

  const priceId = billing === 'yearly' ? priceYearly : priceMonthly;
  if (!priceId) {
    return res.status(500).json({
      error: 'Falta STRIPE_PRICE_MONTHLY o STRIPE_PRICE_YEARLY en el servidor',
    });
  }

  const user = await getUserFromToken(req);
  if (!user?.id) {
    return res.status(401).json({ error: 'Inicia sesión para suscribirte' });
  }

  const stripe = new Stripe(secret);

  const base = getDeploymentUrl(req).replace(/\/$/, '');
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
