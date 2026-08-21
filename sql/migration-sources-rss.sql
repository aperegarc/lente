-- ============================================================
-- Parche de fuentes RSS (producción)
-- Probe 2026-08-17 (User-Agent lente-bot/1.0, timeout 12s):
--   200  Expansión, FT, Bloomberg, CNBC, BBC Business
--   200  Cinco Días (feeds.elpais.com …/cincodias.elpais.com/portada)
--   200  El País Economía, The Guardian Business
--   403  El Economista (rss-economia.php y rss-mercados.php — Akamai)
--   404  cincodias.elpais.com/rss/economia.xml
--   DNS  feeds.reuters.com (ya no resuelve)
-- Solo quedan URLs que respondieron 200.
-- ============================================================

UPDATE sources
SET active = false
WHERE url IN (
  'https://www.eleconomista.es/rss/rss-mercados.php',
  'https://www.eleconomista.es/rss/rss-economia.php',
  'https://cincodias.elpais.com/rss/economia.xml',
  'https://feeds.reuters.com/reuters/businessNews'
);

INSERT INTO sources (name, url, language, weight, active) VALUES
  ('Expansión',             'https://e00-expansion.uecdn.es/rss/portada.xml',                                    'es', 1.2, true),
  ('El País Economía',      'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada', 'es', 1.1, true),
  ('Cinco Días',            'https://feeds.elpais.com/mrss-s/pages/ep/site/cincodias.elpais.com/portada',         'es', 1.1, true),
  ('The Guardian Business', 'https://www.theguardian.com/business/rss',                                         'en', 1.2, true),
  ('Financial Times',       'https://www.ft.com/rss/home',                                                      'en', 1.3, true),
  ('Bloomberg Mkts',        'https://feeds.bloomberg.com/markets/news.rss',                                      'en', 1.2, true),
  ('CNBC',                  'https://www.cnbc.com/id/100003114/device/rss/rss.html',                             'en', 1.0, true),
  ('BBC Business',          'https://feeds.bbci.co.uk/news/business/rss.xml',                                    'en', 1.0, true)
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name,
  language = EXCLUDED.language,
  weight = EXCLUDED.weight,
  active = true;
