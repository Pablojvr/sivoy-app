const ubicacionRepo = require('./ubicaciones.repository');
const cloudinary = require('cloudinary').v2;

async function getAllLocations() {
    return await ubicacionRepo.getAllLocations();
}

async function getLocationByName(nombre) {
    return await ubicacionRepo.getLocationByName(nombre);
}

async function updateLocation(locId, payload) {
    let { nombre_destino, ubicacion, empresa, tipo, maps_url, horarios, imagen_referencia } = payload;
    
    // Parse ubicacion and horarios if they are strings (FormData legacy support)
    if (typeof ubicacion === 'string') ubicacion = JSON.parse(ubicacion);
    if (typeof horarios === 'string') horarios = JSON.parse(horarios);
    
    let updateFields = [];
    let params = [];
    
    if (nombre_destino) { updateFields.push('nombre_destino = ?'); params.push(nombre_destino); }
    if (empresa) { updateFields.push('empresa = ?'); params.push(empresa); }
    if (tipo) { updateFields.push('tipo = ?'); params.push(tipo); }
    if (maps_url !== undefined) { updateFields.push('maps_url = ?'); params.push(maps_url || null); }
    if (ubicacion) {
        if (ubicacion.departamento) { updateFields.push('departamento = ?'); params.push(ubicacion.departamento); }
        if (ubicacion.municipio) { updateFields.push('municipio = ?'); params.push(ubicacion.municipio); }
        if (ubicacion.direccion_referencia) { updateFields.push('direccion_referencia = ?'); params.push(ubicacion.direccion_referencia); }
        if (ubicacion.lat) { updateFields.push('lat = ?'); params.push(ubicacion.lat); }
        if (ubicacion.lng) { updateFields.push('lng = ?'); params.push(ubicacion.lng); }
    }
    
    if (imagen_referencia && imagen_referencia.startsWith('data:image')) {
        if (!process.env.CLOUDINARY_URL) {
            console.warn("No CLOUDINARY_URL provided, keeping raw base64");
        } else {
            const uploadResponse = await cloudinary.uploader.upload(imagen_referencia, {
                folder: 'sivoy_agencias'
            });
            imagen_referencia = uploadResponse.secure_url;
        }
    }

    if (imagen_referencia) {
        updateFields.push('imagen_referencia = ?');
        params.push(imagen_referencia);
    }

    const updated = await ubicacionRepo.updateLocation(locId, updateFields, params, horarios);
    if (!updated) {
        throw new Error("Location not found");
    }
    return updated;
}

async function createAgencia(payload) {
    let { nombre_destino, empresa_id, tipo, departamento, municipio, direccion_referencia, maps_url, lat, lng, horarios, imagen_referencia } = payload;
    
    if (!nombre_destino || !empresa_id || !tipo) {
        throw new Error("Missing required fields");
    }

    if (imagen_referencia && imagen_referencia.startsWith('data:image')) {
        if (!process.env.CLOUDINARY_URL) {
            console.warn("No CLOUDINARY_URL provided, keeping raw base64");
        } else {
            const uploadResponse = await cloudinary.uploader.upload(imagen_referencia, {
                folder: 'sivoy_agencias'
            });
            imagen_referencia = uploadResponse.secure_url;
        }
    }

    const empresaNombre = await ubicacionRepo.getEmpresaNameById(empresa_id);

    // Generate a simple ID if not provided (since it's TEXT PRIMARY KEY)
    const id_destino = nombre_destino.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '_' + Date.now();

    let horariosArr = [];
    if (horarios) {
        try {
            horariosArr = typeof horarios === 'string' ? JSON.parse(horarios) : horarios;
        } catch (e) { console.error("Invalid horarios JSON"); }
    }

    const agenciaPayload = {
        nombre_destino, tipo, empresa_id, empresaNombre, departamento, municipio, direccion_referencia, maps_url, lat, lng, imagen_referencia, horariosArr
    };

    await ubicacionRepo.createAgencia(id_destino, agenciaPayload);
    return id_destino;
}

module.exports = {
    getAllLocations,
    getLocationByName,
    updateLocation,
    createAgencia
};
