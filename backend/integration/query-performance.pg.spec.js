'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');

const PERF_SCHEMA = 't14_query_perf';
const SAMPLE_COUNT = 5;

function assertSafeDatabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${error.message}`);
  }

  if (!new Set(['postgres:', 'postgresql:']).has(parsed.protocol)) {
    throw new Error(`Refusing execution: unsupported DATABASE_URL protocol ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!new Set(['localhost', '127.0.0.1', '::1']).has(hostname)) {
    throw new Error(`Refusing execution: non-local DATABASE_URL hostname ${parsed.hostname}`);
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function collectNodeTypes(plan, result = []) {
  result.push(plan['Node Type']);
  for (const child of plan.Plans || []) collectNodeTypes(child, result);
  return result;
}

function parseExplainDocument(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  assert.ok(Array.isArray(parsed) && parsed.length === 1, 'EXPLAIN JSON must contain one document');
  const document = parsed[0];
  assert.ok(document.Plan && typeof document.Plan === 'object', 'EXPLAIN JSON must contain a root Plan');
  assert.ok(Number.isFinite(document['Planning Time']), 'Planning Time must be numeric');
  assert.ok(Number.isFinite(document['Execution Time']), 'Execution Time must be numeric');
  return document;
}

async function explain(client, sql, params) {
  const result = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) ${sql}`,
    params
  );
  return parseExplainDocument(result.rows[0]['QUERY PLAN']);
}

function summarize(name, documents, expectedRows) {
  const plans = documents.map((document) => document.Plan);
  for (const plan of plans) {
    assert.equal(plan['Actual Rows'], expectedRows, `${name} returned an unexpected row count`);
  }

  const planningMedian = median(documents.map((document) => document['Planning Time']));
  const executionMedian = median(documents.map((document) => document['Execution Time']));
  const representativeDocument = documents.find(
    (document) => document['Execution Time'] === executionMedian
  );
  const representative = representativeDocument.Plan;
  return {
    name,
    samples: documents.length,
    planning_ms_median: planningMedian,
    execution_ms_median: executionMedian,
    root_node: representative['Node Type'],
    node_types: [...new Set(collectNodeTypes(representative))],
    plan_rows: representative['Plan Rows'],
    actual_rows: representative['Actual Rows'],
    // PostgreSQL upper-level buffer counters already include every child node.
    shared_hit_blocks: representative['Shared Hit Blocks'] || 0,
    shared_read_blocks: representative['Shared Read Blocks'] || 0
  };
}

test('T14 baseline: measure current public-search query shapes on representative PostgreSQL data', async () => {
  assert.equal(
    process.env.MIGRATION_TEST_SENTINEL,
    'allow_ephemeral_migration_test',
    'Refusing execution without the migration test sentinel'
  );
  assert.equal(
    process.env.QUERY_PERF_TEST_SENTINEL,
    'allow_ephemeral_query_performance_test',
    'Refusing execution without the query performance sentinel'
  );

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the query performance baseline');
  assertSafeDatabaseUrl(databaseUrl);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 1
  });

  let client;
  let safeTargetConfirmed = false;
  try {
    client = await pool.connect();
    const databaseResult = await client.query('SELECT current_database() AS current_db');
    assert.equal(
      databaseResult.rows[0]?.current_db,
      'sivoy_migrations_ci',
      'Refusing execution outside the exact ephemeral CI database'
    );
    safeTargetConfirmed = true;

    const fixturePath = path.join(__dirname, '../test/fixtures/query-performance-schema.sql');
    await client.query(fs.readFileSync(fixturePath, 'utf8'));

    const queryCases = [
      {
        name: 'agency_lookup_by_name_or_id',
        sql: 'SELECT * FROM agencias WHERE LOWER(nombre_destino) = $1 OR id::text = $2',
        params: ['agencia 05000', 'Agencia 05000'],
        expectedRows: 1
      },
      {
        name: 'all_agencies_ordered',
        sql: 'SELECT * FROM agencias ORDER BY nombre_destino',
        params: [],
        expectedRows: 10000
      },
      {
        name: 'all_schedules',
        sql: 'SELECT * FROM horarios_operativos',
        params: [],
        expectedRows: 70000
      },
      {
        name: 'all_delivery_rules',
        sql: 'SELECT * FROM reglas_entrega',
        params: [],
        expectedRows: 20000
      },
      {
        name: 'schedules_by_agency',
        sql: 'SELECT dia_semana, hora_apertura, hora_cierre FROM horarios_operativos WHERE agencia_id = $1',
        params: [5000],
        expectedRows: 7
      },
      {
        name: 'delivery_rules_by_agency',
        sql: 'SELECT dia_entrega, dia_corte_maximo FROM reglas_entrega WHERE agencia_id = $1',
        params: [5000],
        expectedRows: 2
      }
    ];

    const report = [];
    for (const queryCase of queryCases) {
      await explain(client, queryCase.sql, queryCase.params);
      const documents = [];
      for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
        documents.push(await explain(client, queryCase.sql, queryCase.params));
      }
      report.push(summarize(queryCase.name, documents, queryCase.expectedRows));
    }

    const reportDocument = {
      schema: PERF_SCHEMA,
      dataset: { agencies: 10000, schedules: 70000, delivery_rules: 20000 },
      measurements: report
    };
    const payload = JSON.stringify(reportDocument);
    console.log(`T14_QUERY_BASELINE=${payload}`);
    if (process.env.QUERY_PERF_REPORT_PATH) {
      fs.writeFileSync(path.resolve(process.env.QUERY_PERF_REPORT_PATH), `${payload}\n`, 'utf8');
    }
  } finally {
    if (client) {
      try {
        if (safeTargetConfirmed) await client.query(`DROP SCHEMA IF EXISTS ${PERF_SCHEMA} CASCADE`);
      } finally {
        client.release();
      }
    }
    await pool.end();
  }
});
