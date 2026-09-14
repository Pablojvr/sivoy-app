const { Pool } = require('pg');
const { createProcessLogger } = require('../core/observability/process-logger');

function createDatabaseRuntime(options = {}) {
    const {
        PoolCtor = Pool,
        logger = createProcessLogger({ entryPoint: 'database' }),
        env = process.env
    } = options;

    let poolInstance = null;

    async function getDB() {
        if (poolInstance) {
            return poolInstance;
        }

        const isProd = env.NODE_ENV === 'production';
        const newPool = new PoolCtor({
            connectionString: env.DATABASE_URL,
            ssl: isProd ? { rejectUnauthorized: false } : false
        });

        poolInstance = newPool;

        try {
            logger.info('db_pool_connected');
        } catch (err) {
            // ignore logger failure
        }

        return poolInstance;
    }

    async function runInTransaction(client, work) {
        await client.query('BEGIN');
        try {
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
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
        try {
            return await runInTransaction(client, work);
        } finally {
            client.release();
        }
    }

    return {
        getDB,
        runInTransaction,
        withTransaction
    };
}

const defaultRuntime = createDatabaseRuntime();

module.exports = {
    createDatabaseRuntime,
    getDB: defaultRuntime.getDB,
    runInTransaction: defaultRuntime.runInTransaction,
    withTransaction: defaultRuntime.withTransaction
};
