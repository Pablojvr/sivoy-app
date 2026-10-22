const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  assertNoInvalidUserIndexes,
  discoverMigrations,
  resolveMigrationDatabaseUrl,
  runMigrations,
  sha256
} = require('../migration-runner');

test('discovers numbered SQL migrations in deterministic order', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sivoy-migrations-'));

  try {
    fs.writeFileSync(path.join(directory, '0002_second.sql'), 'SELECT 2;');
    fs.writeFileSync(path.join(directory, '0003_index.notx.sql'), 'CREATE INDEX CONCURRENTLY example;');
    fs.writeFileSync(path.join(directory, 'README.md'), 'ignored');
    fs.writeFileSync(path.join(directory, '0001_first.sql'), 'SELECT 1;');

    const migrations = discoverMigrations(directory);

    assert.deepEqual(
      migrations.map(({ version, name }) => ({ version, name })),
      [
        { version: '0001', name: 'first' },
        { version: '0002', name: 'second' },
        { version: '0003', name: 'index' }
      ]
    );
    assert.equal(migrations[2].transactional, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('migration checksums are stable and sensitive to SQL changes', () => {
  assert.equal(sha256('SELECT 1;'), sha256('SELECT 1;'));
  assert.notEqual(sha256('SELECT 1;'), sha256('SELECT 2;'));
});

test('migration discovery ignores Windows versus Unix line endings', () => {
  const lfDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sivoy-migrations-lf-'));
  const crlfDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sivoy-migrations-crlf-'));
  try {
    fs.writeFileSync(path.join(lfDirectory, '0001_first.sql'), 'SELECT 1;\nSELECT 2;\n');
    fs.writeFileSync(path.join(crlfDirectory, '0001_first.sql'), 'SELECT 1;\r\nSELECT 2;\r\n');

    assert.equal(
      discoverMigrations(lfDirectory)[0].checksum,
      discoverMigrations(crlfDirectory)[0].checksum
    );
  } finally {
    fs.rmSync(lfDirectory, { recursive: true, force: true });
    fs.rmSync(crlfDirectory, { recursive: true, force: true });
  }
});

test('catalog revision migration installs bounded-query indexes and mutation triggers', () => {
  const migrationPath = path.join(__dirname, '../migrations/0007_catalog_query_foundation.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE(?: IF NOT EXISTS)? catalog_revision_state/i);
  assert.match(sql, /CREATE TRIGGER empresas_catalog_revision_trigger/i);
  assert.match(sql, /CREATE TRIGGER agencias_catalog_revision_trigger/i);
  assert.match(sql, /CREATE TRIGGER horarios_catalog_revision_trigger/i);
  assert.match(sql, /CREATE INDEX(?: IF NOT EXISTS)? agencias_catalog_location_idx/i);
  assert.match(sql, /CREATE INDEX(?: IF NOT EXISTS)? agencias_catalog_name_idx/i);
});

test('database timeout migration persists role defaults without hardcoded identities', () => {
  const migrationPath = path.join(__dirname, '../migrations/0008_database_timeout_defaults.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /current_user/i);
  assert.match(sql, /current_database\(\)/i);
  assert.match(sql, /statement_timeout/i);
  assert.match(sql, /idle_in_transaction_session_timeout/i);
  assert.doesNotMatch(sql, /neondb_owner/i);
});

test('catalog substring search migrations install pg_trgm and an idempotent concurrent index', () => {
  const migrationsDirectory = path.join(__dirname, '../migrations');
  const extensionSql = fs.readFileSync(
    path.join(migrationsDirectory, '0009_enable_pg_trgm.sql'),
    'utf8'
  );
  const indexSql = fs.readFileSync(
    path.join(migrationsDirectory, '0010_agencias_catalog_name_trgm.notx.sql'),
    'utf8'
  );

  assert.match(extensionSql, /CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public/i);
  assert.match(indexSql, /CREATE INDEX CONCURRENTLY IF NOT EXISTS agencias_catalog_name_trgm_idx/i);
  assert.match(indexSql, /USING gin/i);
  assert.match(indexSql, /public\.gin_trgm_ops/i);
  assert.match(indexSql, /translate\(lower\(nombre_destino\), 'áéíóúüñ', 'aeiouun'\)/i);
  assert.match(indexSql, /WHERE id_destino IS NOT NULL AND btrim\(id_destino\) <> ''/i);

  const migrations = discoverMigrations(migrationsDirectory);
  assert.equal(migrations.find(({ version }) => version === '0009').transactional, true);
  assert.equal(migrations.find(({ version }) => version === '0010').transactional, false);
});

test('migration runner prioritizes a direct URL and rejects pooled Neon endpoints', () => {
  assert.equal(resolveMigrationDatabaseUrl({
    DIRECT_DATABASE_URL: 'postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/db',
    DATABASE_URL: 'postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/db'
  }), 'postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/db');

  assert.equal(resolveMigrationDatabaseUrl({
    DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db'
  }), 'postgresql://user:pass@127.0.0.1:5432/db');

  assert.throws(
    () => resolveMigrationDatabaseUrl({
      DATABASE_URL: 'postgresql://user:pass@ep-example-pooler.us-east-2.aws.neon.tech/db'
    }),
    /DIRECT_DATABASE_URL/
  );
  assert.throws(
    () => resolveMigrationDatabaseUrl({
      DATABASE_URL: 'postgresql://user:pass@db.example.com/app?pgbouncer=true'
    }),
    /DIRECT_DATABASE_URL/
  );
  assert.throws(() => resolveMigrationDatabaseUrl({}), /required/i);
});

test('dry-run reports pending migrations without creating the ledger', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sivoy-migrations-'));
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
      return { rows: [] };
    },
    release() {}
  };

  try {
    fs.writeFileSync(path.join(directory, '0001_first.sql'), 'SELECT 1;');
    const result = await runMigrations({ connect: async () => client }, { directory, dryRun: true });

    assert.equal(result[0].status, 'pending');
    assert.deepEqual(queries.slice(0, 2), [
      "SET statement_timeout = '0'",
      "SET idle_in_transaction_session_timeout = '0'"
    ]);
    assert.equal(queries.some((sql) => sql.includes('CREATE TABLE schema_migrations')), false);
    assert.equal(queries.includes('SELECT 1;'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('non-transactional migrations run without BEGIN for concurrent indexes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sivoy-migrations-'));
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
      return { rows: [] };
    },
    release() {}
  };

  try {
    const statement = 'CREATE INDEX CONCURRENTLY example ON records (id);';
    fs.writeFileSync(path.join(directory, '0001_index.notx.sql'), statement);
    const result = await runMigrations({ connect: async () => client }, { directory });

    assert.equal(result[0].status, 'applied');
    assert.equal(queries.includes('BEGIN'), false);
    assert.equal(queries.includes(statement), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('non-transactional migrations never enter the ledger when an index is invalid', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sivoy-migrations-'));
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
      if (sql.includes('NOT i.indisvalid')) {
        return { rows: [{ schema_name: 'public', index_name: 'records_id_idx' }] };
      }
      return { rows: [] };
    },
    release() {}
  };

  try {
    fs.writeFileSync(
      path.join(directory, '0001_index.notx.sql'),
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS records_id_idx ON records (id);'
    );

    await assert.rejects(
      runMigrations({ connect: async () => client }, { directory }),
      /0001 left invalid indexes: public\.records_id_idx/
    );
    assert.equal(
      queries.some((sql) => sql.includes('INSERT INTO schema_migrations')),
      false,
      'an invalid concurrent index must never be recorded as applied'
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('invalid-index guard ignores no rows and reports bounded schema-qualified names', async () => {
  const client = {
    async query() {
      return { rows: [] };
    }
  };
  await assert.doesNotReject(assertNoInvalidUserIndexes(client, { version: '0010' }));
});
