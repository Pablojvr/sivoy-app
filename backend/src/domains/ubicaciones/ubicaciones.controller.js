const ubicacionService = require('./ubicaciones.service');

async function getAllLocations(req, res) {
    try {
        const locations = await ubicacionService.getAllLocations();
        res.json(locations);
    } catch (e) {
        console.error("Error fetching locations:", e);
        res.status(500).json({ error: "Database error" });
    }
}

async function updateLocation(req, res) {
    try {
        const locId = req.params.id;
        const payload = req.body;
        const imageFile = req.file;
        
        const updated = await ubicacionService.updateLocation(locId, payload, imageFile);
        res.json({ success: true, updated: updated });
    } catch (e) {
        console.error("Error updating location:", e);
        if (e.message === "Location not found") {
            return res.status(404).json({ error: e.message });
        }
        res.status(500).json({ error: "Database error" });
    }
}

async function createAgencia(req, res) {
    try {
        const payload = req.body;
        const imageFile = req.file;

        const id_destino = await ubicacionService.createAgencia(payload, imageFile);
        res.json({ success: true, id_destino });
    } catch (e) {
        console.error("Error creating agencia:", e);
        if (e.message === "Missing required fields") {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: "Database error" });
    }
}

// In api.js we had GET /test-location
async function testLocation(req, res) {
    try {
        const testLoc = await ubicacionService.getLocationByName("Agencia Lourdes");
        res.json(testLoc);
    } catch (e) {
        res.status(500).json({ error: "Database error" });
    }
}

module.exports = {
    getAllLocations,
    updateLocation,
    createAgencia,
    testLocation
};
