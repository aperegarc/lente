-- ============================================================
-- lente · Mercados favoritos por usuario (ejecutar 1× en Supabase SQL Editor)
-- Tras security-hardening.sql. Sin esta migración los favoritos
-- funcionan igual, pero solo en el dispositivo (localStorage).
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS favorite_markets text[] NOT NULL DEFAULT '{}';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_favorite_markets_size;
ALTER TABLE profiles ADD CONSTRAINT profiles_favorite_markets_size CHECK (
  cardinality(favorite_markets) <= 80
  AND coalesce(length(array_to_string(favorite_markets, ',')), 0) <= 2400
);

COMMENT ON COLUMN profiles.favorite_markets IS 'Símbolos de /api/markets fijados por el usuario (orden = orden de pantalla)';

GRANT UPDATE (favorite_markets) ON profiles TO authenticated;
