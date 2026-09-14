-- pgcrypto dostarcza gen_random_uuid() -- serwer generuje UUID tam, gdzie
-- rekord nie pochodzi z klienta offline (users, seed ćwiczeń globalnych).
-- Rekordy tworzone w Dexie (workouts, sets, ...) zawsze przychodzą z UUID
-- wygenerowanym po stronie klienta -- kolumna id nie jest wtedy nadpisywana.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm pod fuzzy search ćwiczeń po stronie serwera (GIN index w V3).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
