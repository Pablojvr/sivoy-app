const { getDB } = require('../../config/database');

async function createEmpresa(nombre, logoUrl) {
    const db = await getDB();
    const result = await db.query(`INSERT INTO empresas (nombre, logo_url) VALUES ($1, $2) RETURNING id`, [nombre, logoUrl]);
    return result.rows[0].id;
}

async function getAllEmpresas() {
    const db = await getDB();
    const result = await db.query(`
        SELECT e.*, COUNT(a.id_destino) as puntos_count
        FROM empresas e
        LEFT JOIN agencias a ON e.id = a.empresa_id
        GROUP BY e.id
        ORDER BY e.nombre
    `);
    // PostgreSQL count() returns a string (bigint), so we might want to cast it or just leave it
    return result.rows;
}

async function getEmpresaById(id) {
    const db = await getDB();
    const result = await db.query(`SELECT * FROM empresas WHERE id = $1`, [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
}

async function updateEmpresa(id, nombre, logoUrl) {
    const db = await getDB();
    await db.query(`UPDATE empresas SET nombre = $1, logo_url = $2 WHERE id = $3`, [nombre, logoUrl, id]);
}

module.exports = {
    createEmpresa,
    getAllEmpresas,
    getEmpresaById,
    updateEmpresa
};
