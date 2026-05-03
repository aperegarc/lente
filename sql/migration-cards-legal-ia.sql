-- ============================================================
-- lente · Tarjetas: huella legal / transparencia IA (ejecutar 1× en Supabase)
-- ============================================================

ALTER TABLE cards ADD COLUMN IF NOT EXISTS primary_source_url text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS legal_tag text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_ai_generated boolean DEFAULT true;

COMMENT ON COLUMN cards.primary_source_url IS 'URL principal del artículo citado (agregación / cita)';
COMMENT ON COLUMN cards.legal_tag IS 'Etiqueta de transparencia IA mostrada al usuario';
COMMENT ON COLUMN cards.is_ai_generated IS 'true si el texto de la tarjeta se generó o asistió con IA';
