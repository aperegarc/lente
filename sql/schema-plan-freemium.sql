-- ============================================================
-- Freemium: plan en profiles + guardar solo Premium (RLS)
-- Ejecutar una vez en Supabase SQL Editor tras schema.sql
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

COMMENT ON COLUMN profiles.plan IS 'free | premium';
COMMENT ON COLUMN profiles.plan_expires_at IS 'Fin suscripción premium (null = sin caducidad manual)';

-- Políticas saved_cards: lectura/borrado propios; alta solo si premium activo
DROP POLICY IF EXISTS "saved_own" ON saved_cards;

CREATE POLICY "saved_select_own" ON saved_cards
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "saved_delete_own" ON saved_cards
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "saved_insert_premium" ON saved_cards
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.plan, 'free') = 'premium'
        AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())
    )
  );

CREATE POLICY "saved_update_own" ON saved_cards
  FOR UPDATE USING (auth.uid() = user_id);
