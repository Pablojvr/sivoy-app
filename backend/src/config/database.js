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

module.exports = {
    getDB
};
