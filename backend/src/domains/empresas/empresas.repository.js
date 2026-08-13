const { getDB } = require('../../config/database');

async function createEmpresa(nombre, logoUrl) {
    const db = await getDB();
    const result = await db.run(`INSERT INTO empresas (nombre, logo_url) VALUES (?, ?)`, [nombre, logoUrl]);
    return result.lastID;
}

async function getAllEmpresas() {
    const db = await getDB();
    const empresas = await db.all(`
        SELECT e.*, COUNT(a.id_destino) as puntos_count
        FROM empresas e
        LEFT JOIN agencias a ON e.id = a.empresa_id
        GROUP BY e.id
        ORDER BY e.nombre
    `);
    return empresas;
}

async function getEmpresaById(id) {
    const db = await getDB();
    const empresa = await db.get(`SELECT * FROM empresas WHERE id = ?`, [id]);
    return empresa;
}

async function updateEmpresa(id, nombre, logoUrl) {
    const db = await getDB();
    await db.run(`UPDATE empresas SET nombre = ?, logo_url = ? WHERE id = ?`, [nombre, logoUrl, id]);
}

module.exports = {
    createEmpresa,
    getAllEmpresas,
    getEmpresaById,
    updateEmpresa
};
