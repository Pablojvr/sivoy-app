const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

open({
    filename: path.join(__dirname, '..', '..', 'data', 'sivoyapp.sqlite'),
    driver: sqlite3.Database
}).then(async db => {
    try {
        console.log('Starting migrations...');

        // 1. Create `empresas` table
        await db.run(`
            CREATE TABLE IF NOT EXISTS empresas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                logo_url TEXT
            )
        `);
        console.log('✅ Created empresas table');

        // Insert initial existing empresas from agencias table to avoid breaking existing data
        const uniqueEmpresas = await db.all(`SELECT DISTINCT empresa FROM agencias WHERE empresa IS NOT NULL AND empresa != ''`);
        for (const row of uniqueEmpresas) {
            const exists = await db.get(`SELECT id FROM empresas WHERE nombre = ?`, [row.empresa]);
            if (!exists) {
                await db.run(`INSERT INTO empresas (nombre) VALUES (?)`, [row.empresa]);
            }
        }
        console.log('✅ Migrated unique empresas from agencias table');

        // 2. Add columns to `agencias`
        try { await db.run('ALTER TABLE agencias ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)'); } catch(e) { if (!e.message.includes('duplicate column')) throw e; }
        try { await db.run('ALTER TABLE agencias ADD COLUMN imagen_referencia TEXT'); } catch(e) { if (!e.message.includes('duplicate column')) throw e; }
        console.log('✅ Added empresa_id and imagen_referencia to agencias');

        // Link existing agencias to their new empresa_id
        const empresas = await db.all(`SELECT id, nombre FROM empresas`);
        for (const emp of empresas) {
            await db.run(`UPDATE agencias SET empresa_id = ? WHERE empresa = ?`, [emp.id, emp.nombre]);
        }
        console.log('✅ Linked existing agencias to empresa_id');

        // 3. Add column to `horarios_operativos`
        try { await db.run('ALTER TABLE horarios_operativos ADD COLUMN tipo_accion TEXT'); } catch(e) { if (!e.message.includes('duplicate column')) throw e; }
        // Update existing schedules to 'ambos' by default so we don't break existing behavior
        await db.run(`UPDATE horarios_operativos SET tipo_accion = 'ambos' WHERE tipo_accion IS NULL`);
        console.log('✅ Added tipo_accion to horarios_operativos');

        console.log('🎉 All migrations completed successfully!');
    } catch (e) {
        console.error('❌ Migration Error:', e);
    } finally {
        await db.close();
    }
});
