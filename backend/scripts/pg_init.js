const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function main() {
    try {
        console.log('Starting PostgreSQL schema initialization...');

        // Create empresas table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS empresas (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                logo_url TEXT
            )
        `);
        console.log('✅ Created empresas table');

        // Create agencias table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS agencias (
                id_destino TEXT PRIMARY KEY,
                nombre_destino TEXT NOT NULL,
                tipo TEXT,
                empresa_id INTEGER REFERENCES empresas(id),
                empresa TEXT,
                departamento TEXT,
                municipio TEXT,
                direccion_referencia TEXT,
                maps_url TEXT,
                lat REAL,
                lng REAL,
                imagen_referencia TEXT
            )
        `);
        console.log('✅ Created agencias table');

        // Create horarios_operativos table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS horarios_operativos (
                id SERIAL PRIMARY KEY,
                agencia_id TEXT NOT NULL REFERENCES agencias(id_destino),
                dia_semana TEXT NOT NULL,
                hora_apertura TEXT NOT NULL,
                hora_cierre TEXT NOT NULL,
                tipo_accion TEXT DEFAULT 'ambos'
            )
        `);
        console.log('✅ Created horarios_operativos table');

        // Create reglas_entrega table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reglas_entrega (
                id SERIAL PRIMARY KEY,
                agencia_id TEXT NOT NULL REFERENCES agencias(id_destino),
                dia_entrega TEXT NOT NULL,
                dia_corte_maximo TEXT NOT NULL
            )
        `);
        console.log('✅ Created reglas_entrega table');

        console.log('🎉 PostgreSQL Schema initialized successfully!');
    } catch (e) {
        console.error('❌ Schema Initialization Error:', e);
    } finally {
        await pool.end();
    }
}

main();
