-- Baseline DDL mínimo de compatibilidad estructural.
-- AVISO: Este archivo NO replica la base de datos de producción ni contiene datos ni secretos.
-- Su único propósito es permitir la validación en CI efímero de las migraciones diferenciales 0001–0006.
-- No utiliza IF EXISTS ni DROP TABLE para garantizar que la base de datos objetivo esté completamente limpia.
-- Contiene única y exclusivamente las tablas, columnas, claves y relaciones requeridas por 0001–0006.

CREATE TABLE empresas (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

CREATE TABLE agencias (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id integer,
  id_destino text,
  CONSTRAINT agencias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE TABLE horarios_operativos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agencia_id integer,
  CONSTRAINT horarios_operativos_agencia_id_fkey FOREIGN KEY (agencia_id) REFERENCES agencias(id) ON DELETE CASCADE
);

CREATE TABLE reglas_entrega (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agencia_id integer,
  CONSTRAINT reglas_entrega_agencia_id_fkey FOREIGN KEY (agencia_id) REFERENCES agencias(id) ON DELETE CASCADE
);
