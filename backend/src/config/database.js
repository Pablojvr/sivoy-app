const { Pool } = require('pg');

let poolInstance = null;

async function getDB() {
    if (poolInstance) {
        return poolInstance;
    }
    
    // Si no hay DATABASE_URL, usamos un fallback de conexión local para testing si es necesario
    // Pero requerimos DATABASE_URL en prod
    poolInstance = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    console.log('[INIT] Connected to PostgreSQL database pool.');
    return poolInstance;
}

async function runInTransaction(client, work) {
    await client.query('BEGIN');
    try {
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch((rollbackError) => {
            console.error('[DB] Rollback failed:', rollbackError);
        });
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

module.exports = {
    getDB,
    runInTransaction,
    withTransaction
};
