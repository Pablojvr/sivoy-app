const { Pool } = require('pg');
const { createProcessLogger } = require('../core/observability/process-logger');

function boundedEnvInteger(value, fallback, minimum, maximum) {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
        ? parsed
        : fallback;
}

function createDatabaseRuntime(options = {}) {
    const {
        PoolCtor = Pool,
        logger = createProcessLogger({ entryPoint: 'database' }),
        env = process.env
    } = options;

    let poolInstance = null;
    let closingPromise = null;
    let closed = false;
    const statementTimeout = boundedEnvInteger(env.DB_STATEMENT_TIMEOUT_MS, 5000, 500, 60000);
    const configuredQueryTimeout = boundedEnvInteger(env.DB_QUERY_TIMEOUT_MS, 6000, 500, 65000);
    const queryTimeout = Math.max(configuredQueryTimeout, statementTimeout + 1000);
    const idleTransactionTimeout = boundedEnvInteger(
        env.DB_IDLE_TRANSACTION_TIMEOUT_MS,
        10000,
        1000,
        60000
    );

    async function getDB() {
        if (closed) throw new Error('Database runtime closed');
        if (poolInstance) {
            return poolInstance;
        }

        const isProd = env.NODE_ENV === 'production';
        const newPool = new PoolCtor({
            connectionString: env.DATABASE_URL,
            ssl: isProd ? { rejectUnauthorized: false } : false,
            max: boundedEnvInteger(env.DB_POOL_MAX, 10, 1, 20),
            connectionTimeoutMillis: boundedEnvInteger(env.DB_CONNECT_TIMEOUT_MS, 5000, 100, 30000),
            idleTimeoutMillis: boundedEnvInteger(env.DB_IDLE_TIMEOUT_MS, 10000, 1000, 60000),
            statement_timeout: statementTimeout,
            query_timeout: queryTimeout,
            idle_in_transaction_session_timeout: idleTransactionTimeout
        });

        poolInstance = newPool;

        try {
            logger.info('db_pool_connected');
        } catch (err) {
            // ignore logger failure
        }

        return poolInstance;
    }

    function closeDB() {
        if (closingPromise) return closingPromise;
        closed = true;
        closingPromise = poolInstance
            ? Promise.resolve().then(() => poolInstance.end())
            : Promise.resolve();
        return closingPromise;
    }

    async function runInTransaction(client, work, options = {}) {
        await client.query('BEGIN');
        try {
            await client.query(
                "SELECT set_config('statement_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $2, true)",
                [String(statementTimeout), String(idleTransactionTimeout)]
            );
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                if (typeof options.onRollbackFailure === 'function') {
                    options.onRollbackFailure();
                }
                try {
                    logger.error('db_rollback_failed', 'database_error');
                } catch (logErr) {
                    // ignore logger failure
                }
            }
            throw error;
        }
    }

    async function withTransaction(work) {
        const pool = await getDB();
        const client = await pool.connect();
        let discardClient = false;
        try {
            return await runInTransaction(client, work, {
                onRollbackFailure: () => { discardClient = true; }
            });
        } finally {
            client.release(discardClient ? new Error('Discarding client after rollback failure') : undefined);
        }
    }

    return {
        getDB,
        closeDB,
        runInTransaction,
        withTransaction
    };
}

const defaultRuntime = createDatabaseRuntime();

module.exports = {
    createDatabaseRuntime,
    getDB: defaultRuntime.getDB,
    closeDB: defaultRuntime.closeDB,
    runInTransaction: defaultRuntime.runInTransaction,
    withTransaction: defaultRuntime.withTransaction
};
