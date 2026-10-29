-- Additive public profile fields and normalized social links for companies.
-- The existing empresas_catalog_revision_trigger from migration 0007 remains
-- authoritative; only the new social-links table needs an additional trigger.
ALTER TABLE empresas
  ADD COLUMN descripcion varchar(500),
  ADD COLUMN website_url varchar(2048);

CREATE TABLE empresa_redes_sociales (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id integer NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plataforma text NOT NULL CONSTRAINT empresa_redes_sociales_plataforma_check
    CHECK (plataforma IN (
      'FACEBOOK',
      'INSTAGRAM',
      'WHATSAPP',
      'TIKTOK',
      'YOUTUBE',
      'LINKEDIN'
    )),
  url varchar(2048) NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  orden smallint NOT NULL DEFAULT 0
    CONSTRAINT empresa_redes_sociales_orden_check CHECK (orden >= 0),
  CONSTRAINT empresa_redes_sociales_empresa_plataforma_key
    UNIQUE (empresa_id, plataforma)
);

CREATE TRIGGER empresa_redes_sociales_catalog_revision_trigger
AFTER INSERT OR UPDATE OR DELETE ON empresa_redes_sociales
FOR EACH STATEMENT EXECUTE FUNCTION bump_catalog_revision();
