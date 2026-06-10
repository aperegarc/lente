-- ============================================================
-- lente · Endurecimiento de seguridad (ejecutar 1× en Supabase SQL Editor)
-- Tras schema.sql + schema-plan-freemium.sql
-- ============================================================

-- ----- Tablas internas del pipeline: RLS ON, sin acceso anon/authenticated -----
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;

-- Denegar acceso directo vía PostgREST (solo service_role en Vercel)
-- No crear políticas para anon/authenticated = deny all

-- ----- profiles: evitar escalada plan / is_admin / Stripe -----
DROP POLICY IF EXISTS "profiles_own" ON profiles;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_reminder_enabled boolean DEFAULT false;

REVOKE UPDATE (plan, plan_expires_at, is_admin, stripe_customer_id, stripe_subscription_id, email)
  ON profiles FROM authenticated;

GRANT UPDATE (name, interests, streak_days, last_visit, daily_reminder_enabled)
  ON profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.block_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
       OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
       OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
       OR NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'privileged profile fields are server-only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_profile_escalation ON profiles;
CREATE TRIGGER trg_block_profile_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.block_profile_privilege_escalation();

-- ----- cards: sin lectura masiva directa (paywall solo vía /api/feed con service_role) -----
DROP POLICY IF EXISTS "cards_public_read" ON cards;

REVOKE SELECT ON cards FROM anon;
REVOKE SELECT ON cards FROM authenticated;

-- ----- RPC match_articles: no expuesta a anon -----
REVOKE ALL ON FUNCTION public.match_articles(vector, float, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_articles(vector, float, int) FROM anon;
REVOKE ALL ON FUNCTION public.match_articles(vector, float, int) FROM authenticated;

-- Si la firma difiere (embedding opcional), revocar también la versión con defaults:
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.match_articles(vector, double precision, integer) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.match_articles(vector, double precision, integer) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.match_articles(vector, double precision, integer) FROM authenticated';
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;
