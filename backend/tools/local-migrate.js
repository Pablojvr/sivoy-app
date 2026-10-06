const { Pool } = require('pg');

const { runMigrations } = require('../migration-runner');
const { assertLocalDatabaseUrl } = require('./import-public-catalog');

const DEFAULT_DATABASE_URL = 'postgresql://sivoy:sivoy_local_only@127.0.0.1:5433/sivoy';

async function runLocalMigrations(options = {}) {
  const databaseUrl = assertLocalDatabaseUrl(options.databaseUrl || DEFAULT_DATABASE_URL);
  const pool = options.pool || new Pool({ connectionString: databaseUrl, ssl: false, max: 2 });
  const ownsPool = !options.pool;
  try {
    return await runMigrations(pool, { dryRun: options.dryRun === true });
  } finally {
    if (ownsPool) await pool.end();
  }
}

if (require.main === module) {
  runLocalMigrations({
    databaseUrl: process.env.DATABASE_URL,
    dryRun: process.argv.includes('--dry-run')
  })
    .then((results) => {
      if (results.length === 0) process.stdout.write('Database schema is up to date.\n');
      for (const result of results) process.stdout.write(`${result.status}: ${result.fileName}\n`);
    })
    .catch((error) => {
      process.stderr.write(`Local migration failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { runLocalMigrations };
