-- pgcrypto provides gen_random_uuid() -- the server generates UUIDs where the
-- record does not come from the offline client (users, global exercise seed).
-- Records created in Dexie (workouts, sets, ...) always arrive with a UUID
-- generated on the client side -- the id column is then not overwritten.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm for server-side fuzzy search of exercises (GIN index in V3).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
