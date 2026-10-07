-- Global revision invalidates catalog cursors and future cache entries after any
-- public company, point, or operating-hours mutation.
CREATE TABLE IF NOT EXISTS catalog_revision_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO catalog_revision_state (singleton, revision)
VALUES (true, 1)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION bump_catalog_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE catalog_revision_state
  SET revision = revision + 1,
      updated_at = now()
  WHERE singleton = true;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS empresas_catalog_revision_trigger ON empresas;
CREATE TRIGGER empresas_catalog_revision_trigger
AFTER INSERT OR UPDATE OR DELETE ON empresas
FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_revision();

DROP TRIGGER IF EXISTS agencias_catalog_revision_trigger ON agencias;
CREATE TRIGGER agencias_catalog_revision_trigger
AFTER INSERT OR UPDATE OR DELETE ON agencias
FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_revision();

DROP TRIGGER IF EXISTS horarios_catalog_revision_trigger ON horarios_operativos;
CREATE TRIGGER horarios_catalog_revision_trigger
AFTER INSERT OR UPDATE OR DELETE ON horarios_operativos
FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_revision();

CREATE INDEX IF NOT EXISTS agencias_catalog_location_idx
ON agencias (lower(departamento), lower(municipio), lower(tipo), empresa_id);

CREATE INDEX IF NOT EXISTS agencias_catalog_name_idx
ON agencias (
  translate(lower(nombre_destino), 'áéíóúüñ', 'aeiouun'),
  id_destino
)
WHERE id_destino IS NOT NULL AND btrim(id_destino) <> '';
