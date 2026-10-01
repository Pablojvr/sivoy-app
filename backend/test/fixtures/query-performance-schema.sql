DROP SCHEMA IF EXISTS t14_query_perf CASCADE;
CREATE SCHEMA t14_query_perf;
SET search_path TO t14_query_perf, public;

CREATE TABLE empresas (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL
);

CREATE TABLE agencias (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_destino text NOT NULL,
  nombre_destino text NOT NULL,
  tipo text NOT NULL,
  empresa_id integer NOT NULL REFERENCES empresas(id),
  empresa text NOT NULL,
  maps_url text,
  departamento text,
  municipio text,
  direccion_referencia text,
  lat numeric(9, 6),
  lng numeric(9, 6),
  imagen_referencia text
);

CREATE TABLE horarios_operativos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agencia_id integer NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL,
  hora_apertura time NOT NULL,
  hora_cierre time NOT NULL,
  tipo_accion text NOT NULL DEFAULT 'ambos'
);

CREATE TABLE reglas_entrega (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agencia_id integer NOT NULL REFERENCES agencias(id) ON DELETE CASCADE,
  dia_entrega smallint NOT NULL,
  dia_corte_maximo smallint NOT NULL
);

CREATE UNIQUE INDEX agencias_id_destino_uidx ON agencias (id_destino);
CREATE INDEX agencias_empresa_id_idx ON agencias (empresa_id);
CREATE INDEX horarios_operativos_agencia_id_idx ON horarios_operativos (agencia_id);
CREATE INDEX reglas_entrega_agencia_id_idx ON reglas_entrega (agencia_id);

INSERT INTO empresas (nombre)
SELECT 'Empresa ' || lpad(series::text, 3, '0')
FROM generate_series(1, 100) AS series;

INSERT INTO agencias (
  id_destino,
  nombre_destino,
  tipo,
  empresa_id,
  empresa,
  departamento,
  municipio,
  direccion_referencia,
  lat,
  lng
)
SELECT
  'AG_' || lpad(series::text, 5, '0'),
  'Agencia ' || lpad(series::text, 5, '0'),
  CASE WHEN series % 4 = 0 THEN 'Bodega' ELSE 'Agencia' END,
  ((series - 1) % 100) + 1,
  'Empresa ' || lpad((((series - 1) % 100) + 1)::text, 3, '0'),
  'Departamento ' || (((series - 1) % 14) + 1),
  'Municipio ' || (((series - 1) % 262) + 1),
  'Referencia ' || series,
  13.000000 + (series % 1000) * 0.000100,
  -89.000000 - (series % 1000) * 0.000100
FROM generate_series(1, 10000) AS series;

INSERT INTO horarios_operativos (
  agencia_id,
  dia_semana,
  hora_apertura,
  hora_cierre,
  tipo_accion
)
SELECT
  agency_id,
  weekday,
  time '08:00',
  CASE WHEN weekday = 6 THEN time '12:00' ELSE time '17:00' END,
  'ambos'
FROM generate_series(1, 10000) AS agency_id
CROSS JOIN generate_series(1, 7) AS weekday;

INSERT INTO reglas_entrega (agencia_id, dia_entrega, dia_corte_maximo)
SELECT
  agency_id,
  delivery_day,
  CASE WHEN delivery_day = 1 THEN 5 ELSE delivery_day - 1 END
FROM generate_series(1, 10000) AS agency_id
CROSS JOIN (VALUES (1), (4)) AS days(delivery_day);

ANALYZE empresas;
ANALYZE agencias;
ANALYZE horarios_operativos;
ANALYZE reglas_entrega;

