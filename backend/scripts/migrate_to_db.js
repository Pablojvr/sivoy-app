const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function migrate() {
    const dataDir = path.join(__dirname, '..', '..', 'data', 'normalized');
    const dbPath = path.join(__dirname, '..', '..', 'data', 'sivoyapp.sqlite');

    // Open database
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log('Database connected.');

    // Create tables
    await db.exec(`
        CREATE TABLE IF NOT EXISTS agencias (
            id_destino TEXT PRIMARY KEY,
            nombre_destino TEXT,
            tipo TEXT,
            empresa TEXT,
            departamento TEXT,
            municipio TEXT,
            direccion_referencia TEXT,
            lat REAL,
            lng REAL,
            source_file TEXT
        );

        CREATE TABLE IF NOT EXISTS horarios_operativos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agencia_id TEXT,
            dia_semana TEXT,
            hora_apertura TEXT,
            hora_cierre TEXT,
            FOREIGN KEY(agencia_id) REFERENCES agencias(id_destino)
        );

        CREATE TABLE IF NOT EXISTS reglas_entrega (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agencia_id TEXT,
            dia_entrega TEXT,
            dia_corte_maximo TEXT,
            FOREIGN KEY(agencia_id) REFERENCES agencias(id_destino)
        );
    `);

    // Clear existing data in case of re-run
    await db.exec(`
        DELETE FROM reglas_entrega;
        DELETE FROM horarios_operativos;
        DELETE FROM agencias;
    `);

    console.log('Tables created and cleared.');

    // Load JSONs
    let allData = [];
    try {
        const files = fs.readdirSync(dataDir).filter(f => f.startsWith('norm_') && f.endsWith('.json') && !f.endsWith('.metadata.json'));
        for (const f of files) {
            const filePath = path.join(dataDir, f);
            const content = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
                parsed.forEach(item => {
                    item._sourceFile = f;
                    // Fix some empresa naming logic if not explicitly provided
                    if (!item.empresa) {
                        if (f.includes('melo_express')) item.empresa = 'Melo Express';
                        else if (f.includes('agencias_ag') || item.id_destino?.startsWith('AG_') || item.id_destino?.startsWith('PF_')) item.empresa = 'Pedidos Express';
                        else item.empresa = 'Agencia';
                    }
                });
                allData = allData.concat(parsed);
            }
        }
        console.log(`[INIT] Loaded ${allData.length} locations from JSON.`);
    } catch (e) {
        console.error("Error loading JSON data:", e);
        return;
    }

    // Insert into DB
    let count = 0;
    for (const item of allData) {
        if (!item.id_destino) continue;

        const ubi = item.ubicacion || {};
        
        await db.run(`
            INSERT OR REPLACE INTO agencias (id_destino, nombre_destino, tipo, empresa, departamento, municipio, direccion_referencia, lat, lng, source_file)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            item.id_destino, 
            item.nombre_destino, 
            item.tipo, 
            item.empresa, 
            ubi.departamento, 
            ubi.municipio, 
            ubi.direccion_referencia, 
            ubi.lat, 
            ubi.lng, 
            item._sourceFile
        ]);

        if (item.horarios_operativos && Array.isArray(item.horarios_operativos)) {
            for (const h of item.horarios_operativos) {
                await db.run(`
                    INSERT INTO horarios_operativos (agencia_id, dia_semana, hora_apertura, hora_cierre)
                    VALUES (?, ?, ?, ?)
                `, [item.id_destino, h.dia_semana, h.hora_apertura, h.hora_cierre]);
            }
        }

        if (item.reglas_entrega && Array.isArray(item.reglas_entrega)) {
            for (const r of item.reglas_entrega) {
                await db.run(`
                    INSERT INTO reglas_entrega (agencia_id, dia_entrega, dia_corte_maximo)
                    VALUES (?, ?, ?)
                `, [item.id_destino, r.dia_entrega, r.dia_corte_maximo]);
            }
        }

        count++;
    }

    console.log(`Successfully migrated ${count} locations to the database.`);
    await db.close();
}

migrate().catch(console.error);
