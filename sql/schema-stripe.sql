-- ============================================================
-- Stripe: ID de suscripción (portal / webhooks)
-- Ejecutar en Supabase SQL Editor si ya aplicaste schema-plan-freemium.sql
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

COMMENT ON COLUMN profiles.stripe_subscription_id IS 'sub_xxx de Stripe (cancelación / portal)';
