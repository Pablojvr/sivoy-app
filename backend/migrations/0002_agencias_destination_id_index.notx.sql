-- Idempotent because non-transactional migrations may be retried after interruption.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS agencias_id_destino_uidx ON agencias (id_destino);
