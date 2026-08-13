const rutasService = require('./rutas.service');

async function getUpcomingRoutes(req, res) {
    try {
        const result = await rutasService.getUpcomingRoutes(req.body);
        res.json(result);
    } catch (e) {
        console.error("Error get-upcoming-routes:", e);
        if (e.message.startsWith("Missing")) {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: "Database error" });
    }
}

async function searchRoutesByMunicipality(req, res) {
    try {
        const result = await rutasService.searchRoutesByMunicipality(req.body);
        if (!result.success && result.error === "Origen no encontrado") {
            return res.status(404).json({ error: result.error });
        }
        res.json(result);
    } catch (e) {
        console.error(e);
        if (e.message.startsWith("Missing")) {
            return res.status(400).json({ error: e.message });
        }
        if (e.message === "Origen no encontrado") {
            return res.status(404).json({ error: e.message });
        }
        res.status(500).json({ error: e.message });
    }
}

async function searchFlights(req, res) {
    try {
        const result = await rutasService.searchFlights(req.body);
        res.json(result);
    } catch (e) {
        console.error(e);
        if (e.message.startsWith("Missing")) {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: "Database error in search-flights" });
    }
}

module.exports = {
    getUpcomingRoutes,
    searchRoutesByMunicipality,
    searchFlights
};
