const empresaService = require('./empresas.service');

async function createEmpresa(req, res) {
    try {
        const { nombre } = req.body;
        const logoFile = req.file;
        
        const result = await empresaService.createEmpresa(nombre, logoFile);
        res.json({ success: true, ...result });
    } catch (e) {
        console.error("Error creating empresa:", e);
        if (e.message.startsWith("Missing") || e.message.startsWith("Empresa not found")) {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: "Database error" });
    }
}

async function getAllEmpresas(req, res) {
    try {
        const empresas = await empresaService.getAllEmpresas();
        res.json({ success: true, empresas });
    } catch (e) {
        console.error("Error fetching empresas:", e);
        res.status(500).json({ error: "Database error" });
    }
}

async function updateEmpresa(req, res) {
    try {
        const { id } = req.params;
        const { nombre } = req.body;
        const logoFile = req.file;

        const result = await empresaService.updateEmpresa(id, nombre, logoFile);
        res.json({ success: true, ...result });
    } catch (e) {
        console.error("Error updating empresa:", e);
        if (e.message.startsWith("Missing") || e.message === "Empresa not found") {
            return res.status(e.message === "Empresa not found" ? 404 : 400).json({ error: e.message });
        }
        res.status(500).json({ error: "Database error" });
    }
}

module.exports = {
    createEmpresa,
    getAllEmpresas,
    updateEmpresa
};
