const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { discoverMigrations, runMigrations, sha256 } = require('../migration-runner');

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
