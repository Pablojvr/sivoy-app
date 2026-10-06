# T14a: Línea base reproducible de consultas críticas

## Objetivo

Medir antes de optimizar las consultas PostgreSQL que sostienen la búsqueda
pública de puntos y rutas. Este slice produce evidencia sintética reproducible
con `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON)`; no cambia consultas,
índices, contratos HTTP ni lógica ETA.

La salida JSON se usa porque PostgreSQL la recomienda para análisis por
programas. Las tablas se cargan antes con datos deterministas y se ejecuta
`ANALYZE` para que el planificador disponga de estadísticas actuales.

## Consultas bajo medición

Se conservan las formas SQL actuales de
`backend/src/domains/ubicaciones/ubicaciones.repository.js`:

1. búsqueda de agencia por `LOWER(nombre_destino)` o `id::text`;
2. listado de agencias ordenado por `nombre_destino`;
3. listado completo de horarios operativos;
4. listado completo de reglas de entrega;
5. horarios filtrados por `agencia_id`;
6. reglas filtradas por `agencia_id`.

La línea base usa 10,000 agencias, 70,000 intervalos horarios y 20,000 reglas,
generados mediante SQL determinista dentro de un esquema dedicado. Los índices
del modelo vigente (`id_destino`, `empresa_id` y ambas FK hijas) se reproducen,
pero no se añaden índices experimentales.

## Seguridad y aislamiento

- Solo se ejecuta con
  `MIGRATION_TEST_SENTINEL=allow_ephemeral_migration_test` y
  `QUERY_PERF_TEST_SENTINEL=allow_ephemeral_query_performance_test`.
- `DATABASE_URL` debe usar `postgres:`/`postgresql:`, host local y la base exacta
  `sivoy_migrations_ci`.
- El test crea y elimina únicamente el esquema `t14_query_perf`; no toca el
  esquema `public`, producción ni datos compartidos.
- Partner, ETA, migraciones `0001`–`0006`, contratos y dependencias quedan fuera
  de alcance.

## Evidencia

Cada consulta se calienta una vez y se mide cinco veces. El reporte conserva:

- mediana de `Planning Time` y `Execution Time`;
- tipo del nodo raíz y tipos de nodos del árbol;
- filas reales y estimadas del nodo raíz;
- bloques compartidos leídos y encontrados en caché.

Los contadores de buffers se toman del nodo raíz porque PostgreSQL incluye en
los nodos superiores el uso de todos sus descendientes; sumarlos recursivamente
duplicaría la medición. El plan representativo corresponde a la muestra cuya
ejecución coincide con la mediana informada.

En GitHub Actions la prueba escribe el JSON únicamente en `RUNNER_TEMP` y un
publicador sin dependencias lo emite como una anotación `notice` titulada
`T14 PostgreSQL baseline`, recuperable desde el API público del check. Los
tiempos se registran como línea base, no como umbrales bloqueantes, porque un
runner compartido introduce variación.

## Criterios de aceptación

1. La prueba rechaza destinos remotos/no efímeros y limpia su esquema aun si
   falla.
2. Las seis consultas generan cinco planes JSON válidos y un reporte con las
   métricas descritas, sin cambiar código productivo ni índices.
3. Backend CI ejecuta el paso después de T35c y publica una anotación legible;
   el resto de los quality gates permanece verde.

## Archivos autorizados

1. `tasks/specs/T14-query-performance-baseline.md`
2. `backend/test/fixtures/query-performance-schema.sql`
3. `backend/integration/query-performance.pg.spec.js`
4. `backend/integration/publish-query-performance-report.js`
5. `.github/workflows/ci.yml`

## Validación

```bash
node --check backend/integration/query-performance.pg.spec.js
node --check backend/integration/publish-query-performance-report.js
corepack npm --prefix backend test
```

La integración real se ejecuta en CI con PostgreSQL 16 efímero; no se sustituye
por SQLite ni por mocks.

## Rollback

Eliminar los dos steps de T14a del workflow y los tres archivos de
fixture/prueba/publicador. El esquema temporal se elimina al finalizar y no
existe estado externo persistente.
