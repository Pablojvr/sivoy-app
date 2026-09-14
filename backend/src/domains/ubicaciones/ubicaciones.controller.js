const ubicacionService = require('./ubicaciones.service');

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
        if (e.message === "Missing required fields") {
            req.log.warn('create_agencia_failed', 'validation_error');
            return res.status(400).json({ error: e.message });
        }
        req.log.error('create_agencia_failed', 'internal_error');
        res.status(500).json({ error: "Database error" });
    }
}

// In api.js we had GET /test-location
async function testLocation(req, res) {
    try {
        const testLoc = await ubicacionService.getLocationByName("Agencia Lourdes");
        res.json(testLoc);
    } catch (e) {
        req.log.error('test_location_failed', 'internal_error');
        res.status(500).json({ error: "Database error" });
    }
}

module.exports = {
    getAllLocations,
    updateLocation,
    createAgencia,
    testLocation
};
