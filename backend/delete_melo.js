const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function main() {
    const db = await open({
        filename: path.join(__dirname, '..', 'data', 'sivoyapp.sqlite'),
        driver: sqlite3.Database
    });
    
    try {
        console.log("Starting deletion of Melo Express...");

        // Find Melo Express ID
        const empresa = await db.get("SELECT id FROM empresas WHERE nombre = 'Melo Express'");
        if (!empresa) {
            console.log("Melo Express no encontrada.");
            return;
        }

        const id = empresa.id;
        console.log(`Melo Express found with id: ${id}`);

        // Delete from horarios_operativos where agencia_id belongs to Melo Express
        await db.run(`DELETE FROM horarios_operativos WHERE agencia_id IN (SELECT id_destino FROM agencias WHERE empresa_id = ?)`, [id]);
        
        // Delete from reglas_entrega where agencia_id belongs to Melo Express
        await db.run(`DELETE FROM reglas_entrega WHERE agencia_id IN (SELECT id_destino FROM agencias WHERE empresa_id = ?)`, [id]);

        // Delete agencias of Melo Express
        await db.run(`DELETE FROM agencias WHERE empresa_id = ?`, [id]);

        // Delete from empresas
        await db.run(`DELETE FROM empresas WHERE id = ?`, [id]);

        console.log("Successfully deleted Melo Express and all its related records.");
        
        // Print remaining companies
        const remaining = await db.all("SELECT * FROM empresas");
        console.log("Empresas restantes:", remaining);

    } catch(err) {
        console.error(err);
    } finally {
        await db.close();
    }
}
main();
