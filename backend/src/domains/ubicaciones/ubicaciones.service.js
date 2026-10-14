const defaultRepo = require('./ubicaciones.repository');
const defaultCloudinary = require('cloudinary').v2;
const { createProcessLogger } = require('../../core/observability/process-logger');

const DATA_IMAGE_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,(?=[A-Za-z0-9+/])(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function boundedEnvInteger(value, fallback, minimum, maximum) {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
        ? parsed
        : fallback;
}

function createServiceError(message, statusCode, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

function createUbicacionesService(options) {
    if (!options || typeof options !== 'object') throw new Error("Missing options");
    const { repo, cloudinary, logger, env, idClock } = options;
    if (!repo || typeof repo !== 'object') throw new Error("Missing repo");
    if (!cloudinary || typeof cloudinary !== 'object') throw new Error("Missing cloudinary");
    if (!logger || typeof logger !== 'object') throw new Error("Missing logger");
    if (typeof logger.warn !== 'function') throw new Error("logger.warn is not a function");
    if (!env || typeof env !== 'object') throw new Error("Missing env");
    if (typeof idClock !== 'function') throw new Error("idClock is not a function");
    const cloudinaryTimeoutMs = boundedEnvInteger(env.CLOUDINARY_TIMEOUT_MS, 8000, 2000, 30000);
    const maxDataUriBytes = boundedEnvInteger(
        env.CLOUDINARY_MAX_DATA_URI_BYTES,
        3145728,
        65536,
        5242880
    );

    const safeLog = (level, event, code) => {
        try {
            logger[level](event, code);
        } catch (e) {}
    };

    async function uploadReferenceImage(value) {
        if (typeof value !== 'string' || !value.startsWith('data:')) return value;
        if (Buffer.byteLength(value, 'utf8') > maxDataUriBytes || !DATA_IMAGE_PATTERN.test(value)) {
            throw createServiceError('Invalid image format or size', 400, 'INVALID_IMAGE_DATA');
        }
        if (!env.CLOUDINARY_URL) {
            safeLog('warn', 'cloudinary_config_missing', 'configuration_missing');
            return value;
        }
        if (typeof cloudinary.uploader?.upload !== 'function') {
            throw new Error("cloudinary.uploader.upload is not a function");
        }
        try {
            const response = await cloudinary.uploader.upload(value, {
                folder: 'sivoy_agencias',
                timeout: cloudinaryTimeoutMs
            });
            if (typeof response?.secure_url !== 'string' || !response.secure_url) {
                throw new Error('Cloudinary response missing secure URL');
            }
            return response.secure_url;
        } catch (error) {
            const code = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
            const message = typeof error?.message === 'string' ? error.message : '';
            const timedOut = ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED'].includes(code)
                || /timed?\s*out|timeout/i.test(message);
            if (timedOut) {
                throw createServiceError('Image upload service timed out', 504, 'CLOUDINARY_TIMEOUT');
            }
            throw createServiceError('Image upload service failed', 502, 'CLOUDINARY_UPSTREAM_ERROR');
        }
    }

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

        const changes = {};

        if (nombre_destino) changes.nombre_destino = nombre_destino;
        if (empresa) changes.empresa = empresa;
        if (tipo) changes.tipo = tipo;
        if (maps_url !== undefined) changes.maps_url = maps_url || null;
        if (ubicacion) {
            if (ubicacion.departamento) changes.departamento = ubicacion.departamento;
            if (ubicacion.municipio) changes.municipio = ubicacion.municipio;
            if (ubicacion.direccion_referencia) changes.direccion_referencia = ubicacion.direccion_referencia;
            if (ubicacion.lat) changes.lat = ubicacion.lat;
            if (ubicacion.lng) changes.lng = ubicacion.lng;
        }

        imagen_referencia = await uploadReferenceImage(imagen_referencia);

        if (imagen_referencia) {
            changes.imagen_referencia = imagen_referencia;
        }

        const updated = await repo.updateLocation(locId, changes, horarios);
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

        imagen_referencia = await uploadReferenceImage(imagen_referencia);

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
