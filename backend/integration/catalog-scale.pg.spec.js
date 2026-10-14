'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Pool } = require('pg');

const { createCatalogRepository } = require('../src/infrastructure/postgres/catalog.repository');
const { createRouteLocationsRepository } = require('../src/infrastructure/postgres/route-locations.repository');

const SCHEMA = 't_catalog_scale';
const SCALES = [10_000, 100_000];
const PAGE_LIMIT = 20;
const MAX_EXECUTION_MS = 1_500;

test('catalog pages remain bounded at 10k and 100k points without cache', async () => {
  assert.equal(
    process.env.CATALOG_SCALE_TEST_SENTINEL,
    'allow_ephemeral_catalog_scale_test',
    'Refusing execution without the catalog scale test sentinel'
  );
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  assertSafeLocalDatabase(databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl, ssl: false, max: 1 });
  let client;
  let safeTargetConfirmed = false;
  try {
    client = await pool.connect();
    const database = await client.query('SELECT current_database() AS name');
    assert.equal(database.rows[0]?.name, 'sivoy_migrations_ci');
    safeTargetConfirmed = true;
    await client.query("SET statement_timeout = '60s'");
    await createFixture(client);

    const report = [];
    for (const scale of SCALES) {
      await populateFixture(client, scale);
      report.push(await measureScale(client, scale));
    }
    console.log(`CATALOG_SCALE_REPORT=${JSON.stringify(report)}`);
  } finally {
    if (client) {
      try {
        if (safeTargetConfirmed) await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      } finally {
        client.release();
      }
    }
    await pool.end();
  }
});

async function measureScale(client, scale) {
  const calls = [];
  const db = {
    query: async (text, values) => {
      calls.push({ text, values });
      return client.query(text, values);
    }
  };
  const repository = createCatalogRepository({ getDB: async () => db });

  const locationQuery = {
    companyId: null,
    department: 'Departamento 1',
    municipality: 'Municipio 1',
    pointType: null,
    q: null,
    matchMode: 'CONTAINS',
    limit: PAGE_LIMIT,
    cursor: null,
    position: null
  };

  const nameOrderQuery = {
    companyId: null,
    department: null,
    municipality: null,
    pointType: null,
    q: null,
    matchMode: 'CONTAINS',
    limit: PAGE_LIMIT,
    cursor: null,
    position: null
  };

  const containsQuery = {
    companyId: null,
    department: null,
    municipality: null,
    pointType: null,
    q: 'zona 042',
    matchMode: 'CONTAINS',
    limit: PAGE_LIMIT,
    cursor: null,
    position: null
  };

  await setCatalogIndexes(client, false);
  const locationBefore = await capturePointPlan(repository, calls, client, locationQuery);
  assert.equal(
    hasAgencySeqScan(locationBefore),
    true,
    'comparison baseline must demonstrate the unindexed agencias scan for location filters'
  );

  const nameBefore = await capturePointPlan(repository, calls, client, nameOrderQuery);
  assert.equal(
    hasAgencySeqScan(nameBefore),
    true,
    'comparison baseline must demonstrate the unindexed agencias scan for name ordering'
  );

  const containsBefore = await capturePointPlan(repository, calls, client, containsQuery);
  assert.equal(
    hasAgencySeqScan(containsBefore),
    true,
    'comparison baseline must demonstrate the unindexed agencias scan for contains queries'
  );

  await setCatalogIndexes(client, true);
  const locationAfter = await capturePointPlan(repository, calls, client, locationQuery);
  assert.equal(
    hasAgencySeqScan(locationAfter),
    false,
    'catalog location indexes must remove the agencias sequential scan'
  );
  assert.equal(
    usesIndex(locationAfter, 'agencias_scale_location_idx'),
    true,
    'location filtering must use the measured location index'
  );
  assert.ok(locationAfter.executionMs <= MAX_EXECUTION_MS, `location catalog page exceeded ${MAX_EXECUTION_MS}ms`);

  const nameAfter = await capturePointPlan(repository, calls, client, nameOrderQuery);
  assert.equal(
    hasAgencySeqScan(nameAfter),
    false,
    'catalog name index must remove the agencias sequential scan for ordering'
  );
  assert.equal(
    usesIndex(nameAfter, 'agencias_scale_name_idx'),
    true,
    'name ordering must use the measured normalized-name index'
  );
  assert.ok(nameAfter.executionMs <= MAX_EXECUTION_MS, `name order catalog page exceeded ${MAX_EXECUTION_MS}ms`);

  const containsAfter = await capturePointPlan(repository, calls, client, containsQuery);
  assert.equal(
    hasAgencySeqScan(containsAfter),
    false,
    'catalog trigram index must remove the agencias sequential scan for contains queries'
  );
  assert.equal(
    usesIndex(containsAfter, 'agencias_scale_name_trgm_idx'),
    true,
    'contains filtering must use the measured trigram index'
  );
  assert.ok(containsAfter.executionMs <= MAX_EXECUTION_MS, `contains catalog page exceeded ${MAX_EXECUTION_MS}ms`);

  calls.length = 0;
  const first = await repository.listPoints(locationQuery);
  assert.equal(calls.length, 2, 'one point query plus one schedule batch are required');
  assert.equal(first.points.length, PAGE_LIMIT);
  assert.equal(first.hasMore, true);
  assert.ok(Buffer.byteLength(JSON.stringify(first), 'utf8') < 75_000, 'page payload must remain bounded');

  const firstIds = new Set(first.points.map((point) => point.pointId));
  calls.length = 0;
  const last = first.points.at(-1);
  const second = await repository.listPoints({
    ...locationQuery,
    position: { normalizedName: last.normalizedName, pointId: last.pointId }
  });
  assert.equal(calls.length, 2, 'cursor pages must keep a constant query count');
  assert.equal(second.points.length, PAGE_LIMIT);
  assert.equal(second.points.some((point) => firstIds.has(point.pointId)), false, 'cursor pages must not overlap');

  calls.length = 0;
  const facets = await repository.listFacets({
    ...locationQuery,
    facet: 'municipality',
    department: null,
    municipality: null,
    q: 'municipio 1'
  });
  assert.equal(calls.length, 1, 'facets must use one bounded query');
  assert.ok(facets.items.length <= PAGE_LIMIT);

  calls.length = 0;
  const routeRepository = createRouteLocationsRepository({ getDB: async () => db });
  const routePoints = await routeRepository.getLocationsByIdentifiers([
    'AG_000001',
    `AG_${String(scale).padStart(6, '0')}`
  ]);
  assert.equal(calls.length, 3, 'route resolution must use one point query and two relation batches');
  assert.equal(routePoints.length, 2);
  const routePointQuery = calls[0];
  const routeExplain = await explainQuery(client, routePointQuery.text, routePointQuery.values);
  assert.ok(routeExplain.executionMs <= MAX_EXECUTION_MS, `route point resolution exceeded ${MAX_EXECUTION_MS}ms`);
  assert.equal(routeExplain.actualRows, 2);
  assert.equal(
    hasAgencySeqScan(routeExplain),
    false,
    'stable route identifiers must use the destination identity index'
  );

  return {
    scale,
    listQueries: 2,
    facetQueries: 1,
    routeQueries: 3,
    pageBytes: Buffer.byteLength(JSON.stringify(first), 'utf8'),
    forms: {
      location: {
        before: summarizePlan(locationBefore),
        after: summarizePlan(locationAfter)
      },
      nameOrder: {
        before: summarizePlan(nameBefore),
        after: summarizePlan(nameAfter)
      },
      contains: {
        before: summarizePlan(containsBefore),
        after: summarizePlan(containsAfter)
      }
    },
    before: summarizePlan(locationBefore),
    after: summarizePlan(locationAfter),
    routeExecutionMs: routeExplain.executionMs,
    routePlanNodes: [...new Set(routeExplain.relations.map((node) => node.type))]
  };
}

function hasAgencySeqScan(plan) {
  return plan.relations.some((node) => node.relation === 'agencias' && node.type === 'Seq Scan');
}

function usesIndex(plan, indexName) {
  return plan.relations.some((node) => node.indexName === indexName);
}

async function capturePointPlan(repository, calls, client, query) {
  calls.length = 0;
  await repository.listPoints(query);
  assert.equal(calls.length, 2, 'measurement must keep one point query plus one schedule batch');
  const plan = await explainQuery(client, calls[0].text, calls[0].values);
  assert.equal(plan.actualRows, PAGE_LIMIT + 1);
  return plan;
}

function summarizePlan(plan) {
  return {
    executionMs: plan.executionMs,
    sharedHitBlocks: plan.sharedHitBlocks,
    sharedReadBlocks: plan.sharedReadBlocks,
    planNodes: [...new Set(plan.relations.map((node) => node.type))],
    indexes: [...new Set(plan.relations.map((node) => node.indexName).filter(Boolean))]
  };
}

async function explainQuery(client, sql, values) {
  const result = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) ${sql}`,
    values
  );
  const document = result.rows[0]['QUERY PLAN'][0];
  const relations = [];
  collectRelations(document.Plan, relations);
  return {
    executionMs: document['Execution Time'],
    actualRows: document.Plan['Actual Rows'],
    sharedHitBlocks: document.Plan['Shared Hit Blocks'] || 0,
    sharedReadBlocks: document.Plan['Shared Read Blocks'] || 0,
    relations
  };
}

function collectRelations(plan, result) {
  if (plan['Relation Name'] || plan['Index Name']) {
    result.push({
      relation: plan['Relation Name'] || null,
      type: plan['Node Type'],
      indexName: plan['Index Name'] || null
    });
  }
  for (const child of plan.Plans || []) collectRelations(child, result);
}

async function createFixture(client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public');
  await client.query(`
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    SET search_path TO ${SCHEMA}, public;

    CREATE UNLOGGED TABLE empresas (
      id integer PRIMARY KEY,
      nombre text NOT NULL,
      logo_url text
    );
    CREATE UNLOGGED TABLE agencias (
      id integer PRIMARY KEY,
      id_destino text NOT NULL,
      nombre_destino text NOT NULL,
      tipo text NOT NULL,
      empresa_id integer NOT NULL REFERENCES empresas(id),
      departamento text NOT NULL,
      municipio text NOT NULL,
      direccion_referencia text,
      lat numeric(9, 6),
      lng numeric(9, 6),
      imagen_referencia text,
      maps_url text
    );
    CREATE UNLOGGED TABLE horarios_operativos (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      agencia_id integer NOT NULL REFERENCES agencias(id),
      dia_semana text NOT NULL,
      hora_apertura time NOT NULL,
      hora_cierre time NOT NULL
    );
    CREATE UNLOGGED TABLE reglas_entrega (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      agencia_id integer NOT NULL REFERENCES agencias(id),
      dia_entrega text NOT NULL,
      dia_corte_maximo text NOT NULL
    );
    CREATE UNLOGGED TABLE catalog_revision_state (
      singleton boolean PRIMARY KEY,
      revision bigint NOT NULL
    );
    INSERT INTO catalog_revision_state VALUES (true, 1);

    CREATE UNIQUE INDEX agencias_scale_destination_uidx ON agencias (id_destino);
    CREATE INDEX horarios_scale_agency_idx ON horarios_operativos (agencia_id);
    CREATE INDEX reglas_scale_agency_idx ON reglas_entrega (agencia_id);
  `);
}

async function setCatalogIndexes(client, enabled) {
  if (!enabled) {
    await client.query(`
      DROP INDEX IF EXISTS agencias_scale_location_idx;
      DROP INDEX IF EXISTS agencias_scale_name_idx;
      DROP INDEX IF EXISTS agencias_scale_name_trgm_idx;
      ANALYZE agencias;
    `);
    return;
  }

  await client.query(`
    CREATE INDEX agencias_scale_location_idx
      ON agencias (lower(departamento), lower(municipio), lower(tipo), empresa_id);
    CREATE INDEX agencias_scale_name_idx
      ON agencias (
        translate(lower(nombre_destino), 'áéíóúüñ', 'aeiouun'),
        id_destino
      )
      WHERE id_destino IS NOT NULL AND btrim(id_destino) <> '';
    CREATE INDEX agencias_scale_name_trgm_idx
      ON agencias USING gin (
        (translate(lower(nombre_destino), 'áéíóúüñ', 'aeiouun')) public.gin_trgm_ops
      )
      WHERE id_destino IS NOT NULL AND btrim(id_destino) <> '';
    ANALYZE agencias;
  `);
}

async function populateFixture(client, scale) {
  await client.query(`
    TRUNCATE reglas_entrega, horarios_operativos, agencias, empresas RESTART IDENTITY CASCADE;
    INSERT INTO empresas (id, nombre)
    SELECT series, 'Empresa ' || lpad(series::text, 3, '0')
    FROM generate_series(1, 100) AS series;
  `);

  await client.query(`
    INSERT INTO agencias (
      id, id_destino, nombre_destino, tipo, empresa_id,
      departamento, municipio, direccion_referencia, lat, lng
    )
    SELECT
      series,
      'AG_' || lpad(series::text, 6, '0'),
      'Agencia ' || lpad(series::text, 6, '0') ||
        ' Zona ' || lpad(((((series - 1) % 100) + 1))::text, 3, '0'),
      CASE WHEN series % 4 = 0 THEN 'Bodega' ELSE 'Agencia' END,
      ((series - 1) % 100) + 1,
      'Departamento ' || ((((series - 1) % 100) % 14) + 1),
      'Municipio ' || (((series - 1) % 100) + 1),
      'Referencia ' || series,
      13.000000 + (series % 1000) * 0.000100,
      -89.000000 - (series % 1000) * 0.000100
    FROM generate_series(1, $1::integer) AS series;
  `, [scale]);

  await client.query(`
    INSERT INTO horarios_operativos (agencia_id, dia_semana, hora_apertura, hora_cierre)
    SELECT agency_id, day_name, time '08:00', time '17:00'
    FROM generate_series(1, $1::integer) AS agency_id
    CROSS JOIN (VALUES ('Lunes'), ('Sábado')) AS days(day_name);
  `, [scale]);

  await client.query(`
    INSERT INTO reglas_entrega (agencia_id, dia_entrega, dia_corte_maximo)
    SELECT agency_id, 'Lunes', 'Viernes'
    FROM generate_series(1, $1::integer) AS agency_id;
  `, [scale]);

  await client.query(`
    ANALYZE empresas;
    ANALYZE agencias;
    ANALYZE horarios_operativos;
    ANALYZE reglas_entrega;
  `);
}

function assertSafeLocalDatabase(rawUrl) {
  const parsed = new URL(rawUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(parsed.protocol));
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.replace(/^\[|\]$/g, '')));
}
