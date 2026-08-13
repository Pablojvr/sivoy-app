const empresaRepo = require('./empresas.repository');

async function createEmpresa(nombre, logoFile) {
    if (!nombre) {
        throw new Error("Missing nombre");
    }
    
    let logoUrl = null;
    if (logoFile) {
        logoUrl = '/uploads/' + logoFile.filename;
    }

    const newId = await empresaRepo.createEmpresa(nombre, logoUrl);
    return { id: newId, nombre, logo_url: logoUrl };
}

async function getAllEmpresas() {
    return await empresaRepo.getAllEmpresas();
}

async function updateEmpresa(id, nombre, logoFile) {
    if (!nombre) {
        throw new Error("Missing nombre");
    }
    
    const currentEmpresa = await empresaRepo.getEmpresaById(id);
    if (!currentEmpresa) {
        throw new Error("Empresa not found");
    }

    let logoUrl = currentEmpresa.logo_url;
    if (logoFile) {
        logoUrl = '/uploads/' + logoFile.filename;
    }

    await empresaRepo.updateEmpresa(id, nombre, logoUrl);
    return { id, nombre, logo_url: logoUrl };
}

module.exports = {
    createEmpresa,
    getAllEmpresas,
    updateEmpresa
};
