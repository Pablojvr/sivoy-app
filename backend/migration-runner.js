const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const LOCK_KEY = 'sivoy_schema_migrations';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function discoverMigrations(directory = path.join(__dirname, 'migrations')) {
  const seenVersions = new Set();
  return fs.readdirSync(directory)
    .filter((fileName) => MIGRATION_PATTERN.test(fileName))
    .sort()
    .map((fileName) => {
      const [, version, name] = fileName.match(MIGRATION_PATTERN);
      if (seenVersions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
      seenVersions.add(version);
      const sql = fs.readFileSync(path.join(directory, fileName), 'utf8');
      return { version, name, fileName, sql, checksum: sha256(sql) };
    });
}

async function runMigrations(pool, { directory, dryRun = false } = {}) {
  const migrations = discoverMigrations(directory);
  const client = await pool.connect();
  const appliedNow = [];
  try {
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
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.name, migration.checksum]
        );
        await client.query('COMMIT');
        appliedNow.push({ ...migration, status: 'applied' });
      } catch (error) {
        await client.query('ROLLBACK');
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
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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

module.exports = { discoverMigrations, runMigrations, sha256 };
