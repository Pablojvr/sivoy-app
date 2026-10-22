const ubicacionService = require('./ubicaciones.service');

const IMAGE_ERROR_RESPONSES = Object.freeze({
    INVALID_IMAGE_DATA: { statusCode: 400, logLevel: 'warn', logCode: 'validation_error' },
    CLOUDINARY_UPSTREAM_ERROR: { statusCode: 502, logLevel: 'error', logCode: 'image_provider_error' },
    CLOUDINARY_TIMEOUT: { statusCode: 504, logLevel: 'error', logCode: 'image_provider_timeout' }
});

function handleImageServiceError(error, req, res, event) {
    const response = IMAGE_ERROR_RESPONSES[error?.code];
    if (!response) return false;
    req.log[response.logLevel](event, response.logCode);
    res.status(response.statusCode).json({ error: error.message });
    return true;
}

async function getAllLocations(req, res) {
    try {
        const locations = await ubicacionService.getAllLocations();
        res.json(locations);
    } catch (e) {
        req.log.error('get_all_locations_failed', 'internal_error');
        res.status(500).json({ error: "Database error" });
    }
}

async function updateLocation(req, res) {
    try {
        const locId = req.params.id;
        const payload = req.body;
        
        const updated = await ubicacionService.updateLocation(locId, payload);
        res.json({ success: true, updated: updated });
    } catch (e) {
        if (handleImageServiceError(e, req, res, 'update_location_failed')) return;
        if (e.message === "Location not found") {
            req.log.warn('update_location_failed', 'location_not_found');
            return res.status(404).json({ error: e.message });
        }
        req.log.error('update_location_failed', 'internal_error');
        res.status(500).json({ error: "Database error" });
    }
}

async function createAgencia(req, res) {
    try {
        const payload = req.body;

        const id_destino = await ubicacionService.createAgencia(payload);
        res.json({ success: true, id_destino });
    } catch (e) {
        if (handleImageServiceError(e, req, res, 'create_agencia_failed')) return;
        if (e.message === "Missing required fields") {
            req.log.warn('create_agencia_failed', 'validation_error');
            return res.status(400).json({ error: e.message });
        }
        req.log.error('create_agencia_failed', 'internal_error');
        res.status(500).json({ error: "Database error" });
    }
}

module.exports = {
    getAllLocations,
    updateLocation,
    createAgencia
};
