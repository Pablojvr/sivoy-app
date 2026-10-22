-- Idempotent because non-transactional migrations may be retried after the
-- index is created but before the migration ledger is updated.
CREATE INDEX CONCURRENTLY IF NOT EXISTS agencias_catalog_name_trgm_idx
ON agencias USING gin (
  (translate(lower(nombre_destino), 'áéíóúüñ', 'aeiouun')) public.gin_trgm_ops
)
WHERE id_destino IS NOT NULL AND btrim(id_destino) <> '';
