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

test('configura límites de pool: valores por defecto, overrides válidos y fallbacks seguros (T46a)', async () => {
    let lastConfig;
    class FakePool {
        constructor(config) {
            lastConfig = config;
        }
    }
    const fakeLogger = { info: () => {}, error: () => {} };

    const check = async (env, expectedMax, expectedConnect, expectedIdle) => {
        const runtime = createDatabaseRuntime({
            PoolCtor: FakePool,
            logger: fakeLogger,
            env
        });
        await runtime.getDB();
        assert.strictEqual(lastConfig.max, expectedMax);
        assert.strictEqual(lastConfig.connectionTimeoutMillis, expectedConnect);
        assert.strictEqual(lastConfig.idleTimeoutMillis, expectedIdle);
    };

    // 1. Defaults
    await check({}, 10, 5000, 10000);

    // 2. Overrides válidos
    await check({
        DB_POOL_MAX: '6',
        DB_CONNECT_TIMEOUT_MS: '1200',
        DB_IDLE_TIMEOUT_MS: '2000'
    }, 6, 1200, 2000);
    await check({
        DB_POOL_MAX: '1',
        DB_CONNECT_TIMEOUT_MS: '100',
        DB_IDLE_TIMEOUT_MS: '1000'
    }, 1, 100, 1000);
    await check({
        DB_POOL_MAX: '20',
        DB_CONNECT_TIMEOUT_MS: '30000',
        DB_IDLE_TIMEOUT_MS: '60000'
    }, 20, 30000, 60000);

    // 3. Inválidos
    const invalids = [
        { DB_POOL_MAX: '0', DB_CONNECT_TIMEOUT_MS: '0', DB_IDLE_TIMEOUT_MS: '0' },
        { DB_POOL_MAX: '-1', DB_CONNECT_TIMEOUT_MS: '-100', DB_IDLE_TIMEOUT_MS: '-1000' },
        { DB_POOL_MAX: '21', DB_CONNECT_TIMEOUT_MS: '30001', DB_IDLE_TIMEOUT_MS: '60001' },
        { DB_POOL_MAX: '01', DB_CONNECT_TIMEOUT_MS: '0500', DB_IDLE_TIMEOUT_MS: '01000' },
        { DB_POOL_MAX: ' 5', DB_CONNECT_TIMEOUT_MS: ' 1200', DB_IDLE_TIMEOUT_MS: ' 2000' },
        { DB_POOL_MAX: '1.5', DB_CONNECT_TIMEOUT_MS: '100.5', DB_IDLE_TIMEOUT_MS: '1000.5' },
        { DB_POOL_MAX: 'NaN', DB_CONNECT_TIMEOUT_MS: 'NaN', DB_IDLE_TIMEOUT_MS: 'NaN' },
        { DB_POOL_MAX: undefined, DB_CONNECT_TIMEOUT_MS: undefined, DB_IDLE_TIMEOUT_MS: undefined }
    ];

    for (const env of invalids) {
        await check(env, 10, 5000, 10000);
    }
    await check({ DB_POOL_MAX: '6', DB_CONNECT_TIMEOUT_MS: '0' }, 6, 5000, 10000);
});

test('closeDB() no crea pool si nunca se usó, y getDB posterior rechaza', async () => {
    let poolCreated = 0;
    class FakePool {
        constructor() { poolCreated++; }
        async end() { throw new Error('No debe llamarse a end'); }
    }
    const runtime = createDatabaseRuntime({ PoolCtor: FakePool, logger: { info: () => {}, error: () => {} }, env: {} });

    await runtime.closeDB();
    assert.strictEqual(poolCreated, 0);
    await assert.rejects(runtime.getDB());
});

test('closeDB() llama una sola vez a end() incluso concurrente, y bloquea nuevas peticiones', async () => {
    let endCalls = 0;
    class FakePool {
        async end() {
            endCalls++;
            await new Promise(r => setTimeout(r, 10)); // simula latencia
        }
    }
    const runtime = createDatabaseRuntime({ PoolCtor: FakePool, logger: { info: () => {}, error: () => {} }, env: {} });
    await runtime.getDB(); // fuerza creación

    const p1 = runtime.closeDB();
    const p2 = runtime.closeDB();
    await Promise.all([p1, p2]);

    assert.strictEqual(endCalls, 1);
    await assert.rejects(runtime.getDB());
    await assert.rejects(runtime.withTransaction(async () => {}));
});

test('closeDB() propaga error de end() y no reintenta', async () => {
    let endCalls = 0;
    const expected = new Error('end boom');
    class FakePool {
        async end() {
            endCalls++;
            throw expected;
        }
    }
    const runtime = createDatabaseRuntime({ PoolCtor: FakePool, logger: { info: () => {}, error: () => {} }, env: {} });
    await runtime.getDB();

    const p1 = runtime.closeDB();
    const p2 = runtime.closeDB();

    await assert.rejects(p1, (err) => err === expected);
    await assert.rejects(p2, (err) => err === expected);
    assert.strictEqual(endCalls, 1);

    await assert.rejects(runtime.closeDB(), (err) => err === expected);
    assert.strictEqual(endCalls, 1);
});

test('legacy exports siguen siendo funciones (sin invocarlas contra DB)', () => {
    const dbConfig = require('../src/config/database');
    assert.strictEqual(typeof dbConfig.getDB, 'function');
    assert.strictEqual(typeof dbConfig.runInTransaction, 'function');
    assert.strictEqual(typeof dbConfig.withTransaction, 'function');
    assert.strictEqual(typeof dbConfig.closeDB, 'function');
});
