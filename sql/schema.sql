-- ============================================================
-- lente · Schema de base de datos (Supabase / PostgreSQL)
-- ============================================================
-- Ejecuta este archivo en el SQL Editor de Supabase
-- (Panel izquierdo → SQL → New query → pega todo → Run)
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- Para embeddings (clustering semántico)

-- ============================================================
-- FUENTES RSS CONFIGURADAS
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  url         text NOT NULL UNIQUE,
  language    text DEFAULT 'es',
  weight      float DEFAULT 1.0,   -- peso para priorización
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO sources (name, url, language, weight) VALUES
  ('Expansión',             'https://e00-expansion.uecdn.es/rss/portada.xml',                                      'es', 1.2),
  ('El País Economía',      'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada',   'es', 1.1),
  ('Cinco Días',            'https://feeds.elpais.com/mrss-s/pages/ep/site/cincodias.elpais.com/portada',           'es', 1.1),
  ('The Guardian Business', 'https://www.theguardian.com/business/rss',                                           'en', 1.2),
  ('Financial Times',       'https://www.ft.com/rss/home',                                                        'en', 1.3),
  ('Bloomberg Mkts',        'https://feeds.bloomberg.com/markets/news.rss',                                        'en', 1.2),
  ('CNBC',                  'https://www.cnbc.com/id/100003114/device/rss/rss.html',                               'en', 1.0),
  ('BBC Business',          'https://feeds.bbci.co.uk/news/business/rss.xml',                                      'en', 1.0)
ON CONFLICT (url) DO NOTHING;

-- ============================================================
-- ARTÍCULOS (noticias crudas)
-- ============================================================
CREATE TABLE IF NOT EXISTS articles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid REFERENCES sources(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  title       text NOT NULL,
  snippet     text,
  link        text NOT NULL UNIQUE,
  pub_date    timestamptz,
  embedding   vector(1536),             -- OpenAI text-embedding-3-small
  cluster_id  uuid,
  ingested_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_pub_date_idx ON articles (pub_date DESC);
CREATE INDEX IF NOT EXISTS articles_cluster_idx  ON articles (cluster_id);
-- Índice vectorial para búsqueda por similitud
CREATE INDEX IF NOT EXISTS articles_embedding_idx
  ON articles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- CLUSTERS (temas agrupados del día)
-- ============================================================
CREATE TABLE IF NOT EXISTS clusters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text,                     -- etiqueta legible, ej: "La Fed mantiene tipos"
  topic       text,                     -- Política monetaria, Materias primas, etc.
  size        int DEFAULT 0,
  score       float DEFAULT 0,          -- puntuación de priorización
  selected    boolean DEFAULT false,    -- si se ha seleccionado para generar tarjeta
  created_at  timestamptz DEFAULT now(),
  date        date DEFAULT current_date
);

CREATE INDEX IF NOT EXISTS clusters_date_idx ON clusters (date DESC);

-- ============================================================
-- TARJETAS (el contenido final publicable)
-- ============================================================
CREATE TABLE IF NOT EXISTS cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id      uuid REFERENCES clusters(id) ON DELETE SET NULL,
  category        text NOT NULL,        -- Política monetaria, Materias primas...
  headline        text NOT NULL,
  deck            text NOT NULL,
  body            text NOT NULL,
  meaning         text NOT NULL,
  sources_text    text,                 -- "Reuters · FT · Bloomberg"
  primary_source_url text,              -- enlace a la noticia original (cita / agregación)
  legal_tag       text,                 -- etiqueta transparencia IA (p. ej. EU AI Act)
  is_ai_generated boolean DEFAULT true,
  read_time_seconds int DEFAULT 40,
  status          text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','published')),
  generated_at    timestamptz DEFAULT now(),
  published_at    timestamptz,
  edition_date    date DEFAULT current_date,  -- fecha de la edición del feed
  order_index     int DEFAULT 0           -- orden en el feed
);

CREATE INDEX IF NOT EXISTS cards_status_idx      ON cards (status);
CREATE INDEX IF NOT EXISTS cards_edition_idx     ON cards (edition_date DESC);

-- ============================================================
-- MERCADOS (cotizaciones en vivo)
-- ============================================================
CREATE TABLE IF NOT EXISTS markets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol        text NOT NULL UNIQUE,     -- ^IBEX, GC=F, BTC-USD...
  name          text NOT NULL,            -- IBEX 35, Oro, Bitcoin...
  description   text,                     -- España · 35 mayores empresas
  category      text NOT NULL,            -- indices, materias, divisas, cripto, bonos
  price         numeric,
  change_pct    numeric,
  change_abs    numeric,
  sparkline     jsonb,                    -- array de 24 puntos para mini-gráfico
  updated_at    timestamptz DEFAULT now()
);

INSERT INTO markets (symbol, name, description, category) VALUES
  ('^IBEX',   'IBEX 35',     'España · 35 mayores empresas',     'indices'),
  ('^GSPC',   'S&P 500',     'EE.UU. · 500 grandes',             'indices'),
  ('^NDX',    'Nasdaq 100',  'EE.UU. · tech',                    'indices'),
  ('^STOXX50E','EuroStoxx 50','Europa · grandes',                'indices'),
  ('GC=F',    'Oro',         'Por onza · USD',                   'materias'),
  ('BZ=F',    'Brent',       'Petróleo · USD/barril',            'materias'),
  ('TTF=F',   'Gas TTF',     'Gas europeo · EUR/MWh',            'materias'),
  ('EURUSD=X','EUR / USD',   'Euro vs Dólar',                    'divisas'),
  ('EURGBP=X','EUR / GBP',   'Euro vs Libra',                    'divisas'),
  ('BTC-USD', 'Bitcoin',     'BTC · USD',                        'cripto'),
  ('ETH-USD', 'Ethereum',    'ETH · USD',                        'cripto')
ON CONFLICT (symbol) DO NOTHING;

-- ============================================================
-- USUARIOS (extiende auth.users de Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text,
  name         text,
  is_admin     boolean DEFAULT false,
  streak_days  int DEFAULT 0,
  last_visit   date,
  interests    jsonb DEFAULT '[]'::jsonb,  -- ["Macro", "España", ...]
  created_at   timestamptz DEFAULT now()
);

-- Trigger: crear perfil al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TARJETAS GUARDADAS POR USUARIO
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_cards (
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id    uuid REFERENCES cards(id) ON DELETE CASCADE,
  saved_at   timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (quién puede leer/escribir qué)
-- IMPORTANTE: ejecutar también sql/security-hardening.sql en producción
-- ============================================================

-- Cards: RLS ON; lectura pública solo vía API (service_role). Ver security-hardening.sql
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
-- Política legacy (sustituida por REVOKE en security-hardening.sql):
-- CREATE POLICY "cards_public_read" ON cards FOR SELECT USING (status = 'published');

-- Markets: leíbles por todos
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "markets_public_read" ON markets
  FOR SELECT USING (true);

-- Profiles: el usuario sólo ve/edita el suyo
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Saved cards: el usuario sólo ve/edita lo suyo
ALTER TABLE saved_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_own" ON saved_cards
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- FUNCIÓN DE BÚSQUEDA VECTORIAL (para clustering)
-- ============================================================
CREATE OR REPLACE FUNCTION match_articles(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.78,
  match_count int DEFAULT 20
)
RETURNS TABLE (id uuid, title text, similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT id, title, 1 - (embedding <=> query_embedding) AS similarity
  FROM articles
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- ============================================================
-- DONE ✓
-- Siguiente paso: verifica en Supabase → Table Editor
-- que todas las tablas se han creado correctamente
-- ============================================================
