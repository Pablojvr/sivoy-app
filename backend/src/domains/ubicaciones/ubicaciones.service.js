const defaultRepo = require('./ubicaciones.repository');
const defaultCloudinary = require('cloudinary').v2;
const { createProcessLogger } = require('../../core/observability/process-logger');

function createUbicacionesService(options) {
    if (!options || typeof options !== 'object') throw new Error("Missing options");
    const { repo, cloudinary, logger, env, idClock } = options;
    if (!repo || typeof repo !== 'object') throw new Error("Missing repo");
    if (!cloudinary || typeof cloudinary !== 'object') throw new Error("Missing cloudinary");
    if (!logger || typeof logger !== 'object') throw new Error("Missing logger");
    if (typeof logger.warn !== 'function') throw new Error("logger.warn is not a function");
    if (!env || typeof env !== 'object') throw new Error("Missing env");
    if (typeof idClock !== 'function') throw new Error("idClock is not a function");

    const safeLog = (level, event, code) => {
        try {
            logger[level](event, code);
        } catch (e) {}
    };

    async function getAllLocations() {
        if (typeof repo.getAllLocations !== 'function') throw new Error("repo.getAllLocations is not a function");
        return await repo.getAllLocations();
    }

    async function getLocationByName(nombre) {
        if (typeof repo.getLocationByName !== 'function') throw new Error("repo.getLocationByName is not a function");
        return await repo.getLocationByName(nombre);
    }

    async function updateLocation(locId, payload) {
        if (typeof repo.updateLocation !== 'function') throw new Error("repo.updateLocation is not a function");

        let { nombre_destino, ubicacion, empresa, tipo, maps_url, horarios, imagen_referencia } = payload;

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
            if (!env.CLOUDINARY_URL) {
                safeLog('warn', 'cloudinary_config_missing', 'configuration_missing');
            } else {
                if (typeof cloudinary.uploader?.upload !== 'function') throw new Error("cloudinary.uploader.upload is not a function");
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

        const updated = await repo.updateLocation(locId, updateFields, params, horarios);
        if (!updated) {
            throw new Error("Location not found");
        }
        return updated;
    }

    async function createAgencia(payload) {
        if (typeof repo.getEmpresaNameById !== 'function') throw new Error("repo.getEmpresaNameById is not a function");
        if (typeof repo.createAgencia !== 'function') throw new Error("repo.createAgencia is not a function");

        let { nombre_destino, empresa_id, tipo, departamento, municipio, direccion_referencia, maps_url, lat, lng, horarios, imagen_referencia } = payload;

        if (!nombre_destino || !empresa_id || !tipo) {
            throw new Error("Missing required fields");
        }

        if (imagen_referencia && imagen_referencia.startsWith('data:image')) {
            if (!env.CLOUDINARY_URL) {
                safeLog('warn', 'cloudinary_config_missing', 'configuration_missing');
            } else {
                if (typeof cloudinary.uploader?.upload !== 'function') throw new Error("cloudinary.uploader.upload is not a function");
                const uploadResponse = await cloudinary.uploader.upload(imagen_referencia, {
                    folder: 'sivoy_agencias'
                });
                imagen_referencia = uploadResponse.secure_url;
            }
        }

        const empresaNombre = await repo.getEmpresaNameById(empresa_id);

        const id_destino = nombre_destino.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '_' + idClock();

        let horariosArr = [];
        if (horarios) {
            try {
                horariosArr = typeof horarios === 'string' ? JSON.parse(horarios) : horarios;
            } catch (e) {
                safeLog('warn', 'horarios_parse_failed', 'invalid_schedule_data');
            }
        }

        const agenciaPayload = {
            nombre_destino, tipo, empresa_id, empresaNombre, departamento, municipio, direccion_referencia, maps_url, lat, lng, imagen_referencia, horariosArr
        };

        await repo.createAgencia(id_destino, agenciaPayload);
        return id_destino;
    }

    return {
        getAllLocations,
        getLocationByName,
        updateLocation,
        createAgencia
    };
}

let legacyService = null;
function getLegacyService() {
    if (!legacyService) {
        legacyService = createUbicacionesService({
            repo: defaultRepo,
            cloudinary: defaultCloudinary,
            logger: createProcessLogger({ entryPoint: 'ubicaciones_service' }),
            env: process.env,
            idClock: Date.now
        });
    }
    return legacyService;
}

async function getAllLocations() {
    return await getLegacyService().getAllLocations();
}

async function getLocationByName(nombre) {
    return await getLegacyService().getLocationByName(nombre);
}

async function updateLocation(locId, payload) {
    return await getLegacyService().updateLocation(locId, payload);
}

async function createAgencia(payload) {
    return await getLegacyService().createAgencia(payload);
}

module.exports = {
    getAllLocations,
    getLocationByName,
    updateLocation,
    createAgencia,
    createUbicacionesService
};
