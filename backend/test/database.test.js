const assert = require('node:assert/strict');
const test = require('node:test');
const { createDatabaseRuntime } = require('../src/config/database');

test('creates a lazy singleton and respects dev/prod config', async () => {
    let poolCreated = 0;
    class FakePool {
        constructor(config) {
            this.config = config;
            poolCreated++;
        }
    }

    const logs = [];
    const fakeLogger = {
        info: (event, code, fields) => logs.push({ level: 'info', event, code, fields }),
        error: (event, code, fields) => logs.push({ level: 'error', event, code, fields })
    };

    const runtimeDev = createDatabaseRuntime({
        PoolCtor: FakePool,
        logger: fakeLogger,
        env: { DATABASE_URL: 'postgres://dev', NODE_ENV: 'development' }
    });

    const db1 = await runtimeDev.getDB();
    const db2 = await runtimeDev.getDB();
    assert.strictEqual(db1, db2);
    assert.strictEqual(poolCreated, 1);
    assert.strictEqual(db1.config.connectionString, 'postgres://dev');
    assert.strictEqual(db1.config.ssl, false);

    assert.deepEqual(logs, [{ level: 'info', event: 'db_pool_connected', code: undefined, fields: undefined }]);

    const runtimeProd = createDatabaseRuntime({
        PoolCtor: FakePool,
        logger: fakeLogger,
        env: { DATABASE_URL: 'postgres://prod', NODE_ENV: 'production' }
    });
    const dbProd = await runtimeProd.getDB();
    assert.strictEqual(dbProd.config.connectionString, 'postgres://prod');
    assert.deepEqual(dbProd.config.ssl, { rejectUnauthorized: false });
});

test('commits a successful database unit of work', async () => {
    const fakeLogger = { info: () => {}, error: () => {} };
    const runtime = createDatabaseRuntime({ logger: fakeLogger });
    const calls = [];
    const client = { query: async (sql) => calls.push(sql) };

    const result = await runtime.runInTransaction(client, async () => 'updated');

    assert.equal(result, 'updated');
    assert.deepEqual(calls, ['BEGIN', 'COMMIT']);
});

test('rolls back and preserves the original failure', async () => {
    const fakeLogger = { info: () => {}, error: () => {} };
    const runtime = createDatabaseRuntime({ logger: fakeLogger });
    const calls = [];
    const expected = new Error('schedule insert failed');
    const client = { query: async (sql) => calls.push(sql) };

    await assert.rejects(
        runtime.runInTransaction(client, async () => { throw expected; }),
        (error) => error === expected
    );
    assert.deepEqual(calls, ['BEGIN', 'ROLLBACK']);
});

test('rollback fallido preserva error original y loguea seguro sin Error crudo', async () => {
    const logs = [];
    const fakeLogger = {
        info: () => {},
        error: (event, code, err) => {
            if (err) throw new Error('Debería ser sin Error crudo');
            logs.push({ event, code });
        }
    };
    const runtime = createDatabaseRuntime({ logger: fakeLogger });
    const expected = new Error('original error');

    const client = {
        query: async (sql) => {
            if (sql === 'ROLLBACK') throw new Error('rollback boom');
        }
    };

    await assert.rejects(
        runtime.runInTransaction(client, async () => { throw expected; }),
        (error) => error === expected
    );

    assert.deepEqual(logs, [{ event: 'db_rollback_failed', code: 'database_error' }]);
});

test('release incluso si work falla en withTransaction', async () => {
    let released = false;
    class FakePool {
        connect() {
            return {
                query: async () => {},
                release: () => { released = true; }
            }
        }
    }
    const logs = [];
    const fakeLogger = {
        info: (event) => logs.push({ level: 'info', event }),
        error: (event) => logs.push({ level: 'error', event })
    };
    const runtime = createDatabaseRuntime({ PoolCtor: FakePool, env: {}, logger: fakeLogger });
    const expected = new Error('work error');

    await assert.rejects(
        runtime.withTransaction(async () => { throw expected; }),
        (error) => error === expected
    );
    assert.strictEqual(released, true);
    assert.deepEqual(logs, [{ level: 'info', event: 'db_pool_connected' }]);
});

test('logger failure no reemplaza original error', async () => {
    const fakeLogger = {
        info: () => { throw new Error('info boom'); },
        error: () => { throw new Error('logger boom'); }
    };
    const runtime = createDatabaseRuntime({ logger: fakeLogger });
    const expected = new Error('original task error');

    const client = {
        query: async (sql) => {
            if (sql === 'ROLLBACK') throw new Error('rollback broken');
        }
    };

    await assert.rejects(
        runtime.runInTransaction(client, async () => { throw expected; }),
        (error) => error === expected
    );
});

test('si new PoolCtor lanza, no asigna singleton ni emite db_pool_connected y permite reintento', async () => {
    const logs = [];
    const fakeLogger = {
        info: (event) => logs.push({ level: 'info', event }),
        error: (event) => logs.push({ level: 'error', event })
    };

    let throwOnNext = true;
    class FlakyPool {
        constructor() {
            if (throwOnNext) {
                throwOnNext = false;
                throw new Error('Configuracion invalida');
            }
            this.success = true;
        }
    }

    const runtime = createDatabaseRuntime({
        PoolCtor: FlakyPool,
        logger: fakeLogger,
        env: {}
    });

    // Primer intento falla
    await assert.rejects(
        runtime.getDB(),
        { message: 'Configuracion invalida' }
    );
    assert.deepEqual(logs, []);

    // Segundo intento tiene éxito
    const db = await runtime.getDB();
    assert.strictEqual(db.success, true);
    assert.deepEqual(logs, [{ level: 'info', event: 'db_pool_connected' }]);
});

test('legacy exports siguen siendo funciones (sin invocarlas contra DB)', () => {
    const dbConfig = require('../src/config/database');
    assert.strictEqual(typeof dbConfig.getDB, 'function');
    assert.strictEqual(typeof dbConfig.runInTransaction, 'function');
    assert.strictEqual(typeof dbConfig.withTransaction, 'function');
});
