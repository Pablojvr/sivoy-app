const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');

const { discoverMigrations, runMigrations } = require('../migration-runner');

function assertSafeDatabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${error.message}`);
  }

  const allowedProtocols = new Set(['postgres:', 'postgresql:']);
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error(
      `Refusing execution: DATABASE_URL protocol must be postgres: or postgresql:, got: ${parsed.protocol}`
    );
  }

  const normalizedHostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const allowedHostnames = new Set(['localhost', '127.0.0.1', '::1']);
  if (!allowedHostnames.has(normalizedHostname)) {
    throw new Error(
      `Refusing execution: DATABASE_URL hostname must be localhost, 127.0.0.1, or ::1, got: ${parsed.hostname}`
    );
  }
}

test('ephemeral postgres migrations: apply 0001-0007, verify ledger idempotency and schema integrity', async () => {
  const sentinel = process.env.MIGRATION_TEST_SENTINEL;
  if (sentinel !== 'allow_ephemeral_migration_test') {
    throw new Error(
      'Refusing to run migration integration tests without explicit sentinel: MIGRATION_TEST_SENTINEL=allow_ephemeral_migration_test'
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required for ephemeral migration integration tests');
  }

  // Reject unsafe/remote targets without performing any network call
  assertSafeDatabaseUrl(databaseUrl);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });

  try {
    // 1. Verify exact target ephemeral database before any schema modification
    const dbRes = await pool.query('SELECT current_database() AS current_db');
    const currentDb = dbRes.rows[0]?.current_db;
    assert.equal(
      currentDb,
      'sivoy_migrations_ci',
      `Refusing execution: expected current_database() to be sivoy_migrations_ci, got: ${currentDb}`
    );

    // 2. Apply baseline schema (fails immediately if database is not clean; no IF EXISTS)
    const baselinePath = path.join(__dirname, '../test/fixtures/legacy-schema.sql');
    const baselineSql = fs.readFileSync(baselinePath, 'utf8');
    await pool.query(baselineSql);

    // 3. First run: apply exactly 0001-0007
    const migrationsDir = path.join(__dirname, '../migrations');
    const diskMigrations = discoverMigrations(migrationsDir);
    assert.equal(diskMigrations.length, 7, 'Expected exactly 7 migrations on disk');
    assert.deepEqual(
      diskMigrations.map((m) => m.version),
      ['0001', '0002', '0003', '0004', '0005', '0006', '0007'],
      'Disk migrations must match versions 0001 through 0007'
    );

    const firstRun = await runMigrations(pool, { directory: migrationsDir });
    assert.equal(firstRun.length, 7, 'First run must apply exactly 7 migrations');
    assert.deepEqual(
      firstRun.map((m) => m.version),
      ['0001', '0002', '0003', '0004', '0005', '0006', '0007'],
      'First run must apply versions 0001 through 0007 in order'
    );

    // 4. Verify exact ledger matching discoverMigrations()
    const ledgerRes1 = await pool.query(
      'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version'
    );
    assert.equal(ledgerRes1.rows.length, 7, 'Ledger must contain exactly 7 applied versions');
    for (let i = 0; i < 7; i++) {
      const row = ledgerRes1.rows[i];
      const disk = diskMigrations[i];
      assert.equal(row.version, disk.version, `Ledger version mismatch at index ${i}`);
      assert.equal(row.name, disk.name, `Ledger name mismatch at index ${i}`);
      assert.equal(row.checksum.trim(), disk.checksum, `Ledger checksum mismatch for migration ${disk.version}`);
      assert.ok(row.applied_at instanceof Date || typeof row.applied_at === 'string', 'applied_at must be populated');
    }

    // 5. Capture full relevant ledger snapshot and verify idempotency on second run
    const ledgerSnapshot = ledgerRes1.rows.map((r) => ({
      version: r.version,
      name: r.name,
      checksum: r.checksum.trim(),
      applied_at: new Date(r.applied_at).toISOString()
    }));

    const secondRun = await runMigrations(pool, { directory: migrationsDir });
    assert.deepEqual(secondRun, [], 'Second run must return 0 applied migrations (idempotent)');

    const ledgerRes2 = await pool.query(
      'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version'
    );
    const ledgerSnapshot2 = ledgerRes2.rows.map((r) => ({
      version: r.version,
      name: r.name,
      checksum: r.checksum.trim(),
      applied_at: new Date(r.applied_at).toISOString()
    }));
    assert.deepEqual(ledgerSnapshot2, ledgerSnapshot, 'Ledger snapshot must be strictly identical after second run');

    // 6. Verify concurrent indexes exist in public schema and are valid (indisvalid = true)
    const expectedIndexes = [
      'agencias_empresa_id_idx',
      'agencias_id_destino_uidx',
      'horarios_operativos_agencia_id_idx',
      'reglas_entrega_agencia_id_idx',
      'agencias_catalog_location_idx',
      'agencias_catalog_name_idx'
    ];
    const indexRes = await pool.query(
      `SELECT c.relname AS index_name, i.indisvalid
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = ANY($1::text[])
       ORDER BY c.relname`,
      [expectedIndexes]
    );
    const actualIndexes = Object.fromEntries(
      indexRes.rows.map((row) => [row.index_name, row.indisvalid])
    );
    assert.deepEqual(actualIndexes, {
      agencias_catalog_location_idx: true,
      agencias_catalog_name_idx: true,
      agencias_empresa_id_idx: true,
      agencias_id_destino_uidx: true,
      horarios_operativos_agencia_id_idx: true,
      reglas_entrega_agencia_id_idx: true
    });

    // 7. Verify NOT NULL columns on legacy relations (attnotnull = true)
    const notNullRes = await pool.query(`
      SELECT c.relname AS table_name, a.attname AS column_name, a.attnotnull
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND ((c.relname = 'agencias' AND a.attname = 'empresa_id')
          OR (c.relname = 'horarios_operativos' AND a.attname = 'agencia_id')
          OR (c.relname = 'reglas_entrega' AND a.attname = 'agencia_id'))
      ORDER BY c.relname, a.attname
    `);
    const actualNotNulls = notNullRes.rows.map((row) => ({
      table: row.table_name,
      column: row.column_name,
      notNull: row.attnotnull
    }));
    assert.deepEqual(actualNotNulls, [
      { table: 'agencias', column: 'empresa_id', notNull: true },
      { table: 'horarios_operativos', column: 'agencia_id', notNull: true },
      { table: 'reglas_entrega', column: 'agencia_id', notNull: true }
    ]);

    // 8. Verify baseline FK constraints in public schema: mapping, contype='f', convalidated=true
    const expectedFks = {
      agencias_empresa_id_fkey: {
        sourceTable: 'agencias',
        targetTable: 'empresas',
        contype: 'f',
        convalidated: true
      },
      horarios_operativos_agencia_id_fkey: {
        sourceTable: 'horarios_operativos',
        targetTable: 'agencias',
        contype: 'f',
        convalidated: true
      },
      reglas_entrega_agencia_id_fkey: {
        sourceTable: 'reglas_entrega',
        targetTable: 'agencias',
        contype: 'f',
        convalidated: true
      }
    };
    const fkRes = await pool.query(
      `SELECT
         con.conname AS constraint_name,
         src_tbl.relname AS source_table,
         ref_tbl.relname AS target_table,
         con.contype,
         con.convalidated
       FROM pg_constraint con
       JOIN pg_class src_tbl ON src_tbl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = src_tbl.relnamespace
       JOIN pg_class ref_tbl ON ref_tbl.oid = con.confrelid
       WHERE n.nspname = 'public'
         AND con.conname = ANY($1::text[])
       ORDER BY con.conname`,
      [Object.keys(expectedFks)]
    );
    const actualFks = Object.fromEntries(
      fkRes.rows.map((row) => [
        row.constraint_name,
        {
          sourceTable: row.source_table,
          targetTable: row.target_table,
          contype: row.contype,
          convalidated: row.convalidated
        }
      ])
    );
    assert.deepEqual(actualFks, expectedFks);
  } finally {
    await pool.end();
  }
});
