// POST /api/stripe/webhook — sin JSON parseado (firma Stripe)
// Variables: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import Stripe from 'stripe';
import getRawBody from 'raw-body';
import { getSupabaseAdmin } from '../_lib/clients.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const secret = process.env.STRIPE_SECRET_KEY?.trim();

  if (!webhookSecret || !secret) {
    console.error('[stripe webhook] Falta STRIPE_WEBHOOK_SECRET o STRIPE_SECRET_KEY');
    return res.status(500).send('Config error');
  }

  let buf;
  try {
    buf = await getRawBody(req);
  } catch (e) {
    console.error('[stripe webhook] body:', e.message);
    return res.status(400).send('Bad body');
  }

  const sig = req.headers['stripe-signature'];
  const stripe = new Stripe(secret);

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe webhook] firma:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (e) {
    console.error('[stripe webhook] supabase:', e.message);
    return res.status(500).json({ error: e.message });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const userId =
          session.metadata?.supabase_user_id || session.client_reference_id;
        if (!userId) {
          console.warn('[stripe webhook] checkout sin user id');
          break;
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id;

        if (!subscriptionId || !customerId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        await admin
          .from('profiles')
          .update({
            plan: 'premium',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_expires_at: periodEnd,
          })
          .eq('id', userId);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        const active = sub.status === 'active' || sub.status === 'trialing';
        const ended =
          sub.status === 'canceled' ||
          sub.status === 'unpaid' ||
          sub.status === 'incomplete_expired';

        if (ended) {
          await admin
            .from('profiles')
            .update({
              plan: 'free',
              plan_expires_at: new Date().toISOString(),
              stripe_subscription_id: null,
            })
            .eq('id', userId);
        } else if (active) {
          const periodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;
          await admin
            .from('profiles')
            .update({
              plan: 'premium',
              stripe_subscription_id: sub.id,
              plan_expires_at: periodEnd,
            })
            .eq('id', userId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        await admin
          .from('profiles')
          .update({
            plan: 'free',
            plan_expires_at: new Date().toISOString(),
            stripe_subscription_id: null,
          })
          .eq('id', userId);
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error('[stripe webhook]', e);
    return res.status(500).json({ error: e.message });
  }

  return res.status(200).json({ received: true });
}
