const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_PATTERN = /^(\d{4})_([a-z0-9_]+)(\.notx)?\.sql$/;
const LOCK_KEY = 'sivoy_schema_migrations';

function resolveMigrationDatabaseUrl(env = process.env) {
  const connectionString = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_DATABASE_URL or DATABASE_URL is required');

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch (error) {
    throw new Error(`Invalid migration database URL: ${error.message}`);
  }
  if (!new Set(['postgres:', 'postgresql:']).has(parsed.protocol)) {
    throw new Error('Migration database URL must use postgres: or postgresql:');
  }
  const firstHostLabel = parsed.hostname.split('.')[0].toLowerCase();
  if (firstHostLabel.endsWith('-pooler') || parsed.searchParams.get('pgbouncer') === 'true') {
    throw new Error('Migrations require DIRECT_DATABASE_URL; transaction-pooled endpoints are unsafe for session advisory locks');
  }
  return connectionString;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function migrationChecksum(sql) {
  return sha256(sql.replace(/\r\n/g, '\n'));
}

function discoverMigrations(directory = path.join(__dirname, 'migrations')) {
  const seenVersions = new Set();
  return fs.readdirSync(directory)
    .filter((fileName) => MIGRATION_PATTERN.test(fileName))
    .sort()
    .map((fileName) => {
      const [, version, name, nonTransactional] = fileName.match(MIGRATION_PATTERN);
      if (seenVersions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
      seenVersions.add(version);
      const sql = fs.readFileSync(path.join(directory, fileName), 'utf8');
      return { version, name, fileName, sql, checksum: migrationChecksum(sql), transactional: !nonTransactional };
    });
}

async function assertNoInvalidUserIndexes(client, migration) {
  const result = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS index_name
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE (NOT i.indisvalid OR NOT i.indisready)
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY n.nspname, c.relname
    LIMIT 10
  `);
  if (result.rows.length === 0) return;
  const names = result.rows.map((row) => `${row.schema_name}.${row.index_name}`).join(', ');
  throw new Error(`Non-transactional migration ${migration.version} left invalid indexes: ${names}`);
}

async function runMigrations(pool, { directory, dryRun = false } = {}) {
  const migrations = discoverMigrations(directory);
  const client = await pool.connect();
  const appliedNow = [];
  try {
    await client.query("SET statement_timeout = '0'");
    await client.query("SET idle_in_transaction_session_timeout = '0'");
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
    const ledgerResult = await client.query("SELECT to_regclass('public.schema_migrations') AS ledger");
    const ledgerExists = Boolean(ledgerResult.rows[0].ledger);
    if (!ledgerExists && !dryRun) {
      await client.query(`CREATE TABLE schema_migrations (
        version varchar(4) PRIMARY KEY,
        name text NOT NULL,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    }
    const appliedRows = ledgerExists
      ? (await client.query('SELECT version, checksum FROM schema_migrations ORDER BY version')).rows
      : [];
    const applied = new Map(appliedRows.map((row) => [row.version, row.checksum.trim()]));
    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.version);
      if (existingChecksum && existingChecksum !== migration.checksum) {
        throw new Error(`Applied migration ${migration.version} has changed on disk`);
      }
      if (existingChecksum) continue;
      if (dryRun) {
        appliedNow.push({ ...migration, status: 'pending' });
        continue;
      }
      if (migration.transactional) await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        if (!migration.transactional) await assertNoInvalidUserIndexes(client, migration);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.name, migration.checksum]
        );
        if (migration.transactional) await client.query('COMMIT');
        appliedNow.push({ ...migration, status: 'applied' });
      } catch (error) {
        if (migration.transactional) await client.query('ROLLBACK');
        throw error;
      }
    }
    return appliedNow;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

async function main() {
  require('dotenv').config();
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: resolveMigrationDatabaseUrl(process.env),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  try {
    const results = await runMigrations(pool, { dryRun: process.argv.includes('--dry-run') });
    if (results.length === 0) console.log('Database schema is up to date.');
    for (const result of results) console.log(`${result.status}: ${result.fileName}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertNoInvalidUserIndexes,
  discoverMigrations,
  resolveMigrationDatabaseUrl,
  runMigrations,
  sha256
};
