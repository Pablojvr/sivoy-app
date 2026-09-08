const assert = require('node:assert/strict');
const test = require('node:test');

const { runInTransaction } = require('../src/config/database');

test('commits a successful database unit of work', async () => {
  const calls = [];
  const client = { query: async (sql) => calls.push(sql) };

  const result = await runInTransaction(client, async () => 'updated');

  assert.equal(result, 'updated');
  assert.deepEqual(calls, ['BEGIN', 'COMMIT']);
});

test('rolls back and preserves the original failure', async () => {
  const calls = [];
  const expected = new Error('schedule insert failed');
  const client = { query: async (sql) => calls.push(sql) };

  await assert.rejects(
    runInTransaction(client, async () => { throw expected; }),
    (error) => error === expected
  );
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK']);
});
