// POST /api/stripe/create-portal-session
// Header: Authorization: Bearer <supabase_jwt>

import Stripe from 'stripe';
import { getUserFromToken, getDeploymentUrl, getSupabaseAdmin } from '../_lib/clients.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret || secret.includes('...')) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY no configurada' });
  }

  const user = await getUserFromToken(req);
  if (!user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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

  const stripe = new Stripe(secret);
  const base = getDeploymentUrl(req).replace(/\/$/, '');

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
