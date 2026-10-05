const assert = require('node:assert/strict');
const test = require('node:test');

const { configureLocalEnvironment } = require('../tools/start-local-server');

test('configures safe loopback defaults without reading production credentials', () => {
  const env = {};

  const configured = configureLocalEnvironment(env);

  assert.equal(configured, env);
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.PORT, '3001');
  assert.equal(env.DATABASE_SSL, 'false');
  assert.match(env.DATABASE_URL, /@127\.0\.0\.1:5433\/sivoy$/);
});

test('preserves an explicit local port and rejects a remote database', () => {
  const local = {
    PORT: '3101',
    DATABASE_URL: 'postgresql://sivoy:local@localhost:5433/sivoy'
  };
  configureLocalEnvironment(local);
  assert.equal(local.PORT, '3101');
  assert.equal(local.DATABASE_URL, 'postgresql://sivoy:local@localhost:5433/sivoy');

  assert.throws(
    () => configureLocalEnvironment({
      DATABASE_URL: 'postgresql://user:password@production.example.com/sivoy'
    }),
    /loopback/i
  );
});
