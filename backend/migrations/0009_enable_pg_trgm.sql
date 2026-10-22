-- pg_trgm provides index operator classes for bounded substring search.
-- Keep extension installation transactional and separate from the concurrent
-- index migration so each migration obeys the runner contract.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
