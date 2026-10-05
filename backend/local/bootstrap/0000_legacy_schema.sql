-- Local-only baseline required before applying migrations 0001-0006.
-- It mirrors the public legacy columns consumed by the current application.
CREATE TABLE empresas (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  logo_url text
);

CREATE TABLE agencias (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_destino text,
  nombre_destino text NOT NULL,
  tipo text NOT NULL,
  empresa_id integer REFERENCES empresas(id) ON DELETE CASCADE,
  empresa text NOT NULL,
  maps_url text,
  departamento text NOT NULL,
  municipio text NOT NULL,
  direccion_referencia text,
  lat numeric(9, 6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric(9, 6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  imagen_referencia text
);

CREATE TABLE horarios_operativos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agencia_id integer REFERENCES agencias(id) ON DELETE CASCADE,
  dia_semana text NOT NULL,
  hora_apertura text NOT NULL,
  hora_cierre text NOT NULL,
  tipo_accion text NOT NULL DEFAULT 'ambos'
);

CREATE TABLE reglas_entrega (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agencia_id integer REFERENCES agencias(id) ON DELETE CASCADE,
  dia_entrega text NOT NULL,
  dia_corte_maximo text NOT NULL
);
