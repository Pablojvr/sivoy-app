const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log("Dropping old constraints...");
        await pool.query(`ALTER TABLE horarios_operativos DROP CONSTRAINT IF EXISTS horarios_operativos_agencia_id_fkey;`);
        await pool.query(`ALTER TABLE reglas_entrega DROP CONSTRAINT IF EXISTS reglas_entrega_agencia_id_fkey;`);
        await pool.query(`ALTER TABLE agencias DROP CONSTRAINT IF EXISTS agencias_pkey CASCADE;`);

        console.log("Adding id column to agencias...");
        await pool.query(`ALTER TABLE agencias ADD COLUMN id SERIAL PRIMARY KEY;`);

        console.log("Adding agencia_id_new to horarios_operativos...");
        await pool.query(`ALTER TABLE horarios_operativos ADD COLUMN agencia_id_new INTEGER;`);

        console.log("Updating horarios_operativos with new id...");
        await pool.query(`
            UPDATE horarios_operativos h
            SET agencia_id_new = a.id
            FROM agencias a
            WHERE h.agencia_id = a.id_destino;
        `);

        console.log("Removing old agencia_id and renaming...");
        await pool.query(`ALTER TABLE horarios_operativos DROP COLUMN agencia_id;`);
        await pool.query(`ALTER TABLE horarios_operativos RENAME COLUMN agencia_id_new TO agencia_id;`);
        
        console.log("Adding foreign key to horarios_operativos...");
        await pool.query(`ALTER TABLE horarios_operativos ADD CONSTRAINT fk_horarios_agencia FOREIGN KEY (agencia_id) REFERENCES agencias(id) ON DELETE CASCADE;`);

        console.log("Adding agencia_id_new to reglas_entrega...");
        await pool.query(`ALTER TABLE reglas_entrega ADD COLUMN agencia_id_new INTEGER;`);

        console.log("Updating reglas_entrega with new id...");
        await pool.query(`
            UPDATE reglas_entrega r
            SET agencia_id_new = a.id
            FROM agencias a
            WHERE r.agencia_id = a.id_destino;
        `);

        console.log("Removing old agencia_id and renaming...");
        await pool.query(`ALTER TABLE reglas_entrega DROP COLUMN agencia_id;`);
        await pool.query(`ALTER TABLE reglas_entrega RENAME COLUMN agencia_id_new TO agencia_id;`);
        
        console.log("Adding foreign key to reglas_entrega...");
        await pool.query(`ALTER TABLE reglas_entrega ADD CONSTRAINT fk_reglas_agencia FOREIGN KEY (agencia_id) REFERENCES agencias(id) ON DELETE CASCADE;`);

        console.log("Altering imagen_referencia to TEXT...");
        await pool.query(`ALTER TABLE agencias ALTER COLUMN imagen_referencia TYPE TEXT;`);

        console.log("Migration complete!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await pool.end();
    }
}

migrate();
