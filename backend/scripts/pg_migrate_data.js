const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function main() {
    let sqliteDb;
    try {
        sqliteDb = await open({
            filename: path.join(__dirname, '..', '..', 'data', 'sivoyapp.sqlite'),
            driver: sqlite3.Database
        });

        console.log('Migrating data from SQLite to PostgreSQL...');

        // 1. Migrate empresas
        const empresas = await sqliteDb.all("SELECT * FROM empresas");
        for (const e of empresas) {
            await pool.query("INSERT INTO empresas (id, nombre, logo_url) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [e.id, e.nombre, e.logo_url]);
        }
        console.log(`Migrated ${empresas.length} empresas.`);

        // 2. Migrate agencias
        const agencias = await sqliteDb.all("SELECT * FROM agencias");
        for (const a of agencias) {
            await pool.query(
                `INSERT INTO agencias (id_destino, nombre_destino, tipo, empresa_id, empresa, departamento, municipio, direccion_referencia, maps_url, lat, lng, imagen_referencia) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING`,
                [a.id_destino, a.nombre_destino, a.tipo, a.empresa_id, a.empresa, a.departamento, a.municipio, a.direccion_referencia, a.maps_url, a.lat, a.lng, a.imagen_referencia]
            );
        }
        console.log(`Migrated ${agencias.length} agencias.`);

        // 3. Migrate horarios_operativos
        const horarios = await sqliteDb.all("SELECT * FROM horarios_operativos");
        for (const h of horarios) {
            // we omit ID so SERIAL handles it, or we insert it if we want exact IDs
            await pool.query(
                `INSERT INTO horarios_operativos (id, agencia_id, dia_semana, hora_apertura, hora_cierre, tipo_accion) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
                [h.id, h.agencia_id, h.dia_semana, h.hora_apertura, h.hora_cierre, h.tipo_accion]
            );
        }
        console.log(`Migrated ${horarios.length} horarios.`);

        // 4. Migrate reglas_entrega
        const reglas = await sqliteDb.all("SELECT * FROM reglas_entrega");
        for (const r of reglas) {
            await pool.query(
                `INSERT INTO reglas_entrega (id, agencia_id, dia_entrega, dia_corte_maximo) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                [r.id, r.agencia_id, r.dia_entrega, r.dia_corte_maximo]
            );
        }
        console.log(`Migrated ${reglas.length} reglas.`);

        // 5. Update Postgres Sequences (since we inserted explicit IDs for SERIAL)
        await pool.query("SELECT setval('empresas_id_seq', (SELECT MAX(id) FROM empresas))");
        await pool.query("SELECT setval('horarios_operativos_id_seq', (SELECT MAX(id) FROM horarios_operativos))");
        await pool.query("SELECT setval('reglas_entrega_id_seq', (SELECT MAX(id) FROM reglas_entrega))");
        
        console.log('✅ Data migration complete!');
    } catch (e) {
        console.error('❌ Data Migration Error:', e);
    } finally {
        if (sqliteDb) await sqliteDb.close();
        await pool.end();
    }
}

main();
