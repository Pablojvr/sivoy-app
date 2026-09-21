const rutasService = require('./rutas.service');
const { ValidationError } = require('./rutas.validation');

async function getUpcomingRoutes(req, res) {
    try {
        const result = await rutasService.getUpcomingRoutes(req.body);
        res.json(result);
    } catch (e) {
        if (e instanceof ValidationError && e.code === 'VALIDATION_ERROR') {
            req.log.warn('get_upcoming_routes_failed', 'validation_error');
            return res.status(400).json({ error: e.message });
        }
        req.log.error('get_upcoming_routes_failed', 'internal_error');
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
        if (e instanceof ValidationError && e.code === 'VALIDATION_ERROR') {
            req.log.warn('search_by_municipality_failed', 'validation_error');
            return res.status(400).json({ error: e.message });
        }
        if (e.message === "Origen no encontrado") {
            req.log.warn('search_by_municipality_failed', 'origin_not_found');
            return res.status(404).json({ error: e.message });
        }
        req.log.error('search_by_municipality_failed', 'internal_error');
        res.status(500).json({ error: e.message });
    }
}

async function searchFlights(req, res) {
    try {
        const result = await rutasService.searchFlights(req.body);
        res.json(result);
    } catch (e) {
        if (e instanceof ValidationError && e.code === 'VALIDATION_ERROR') {
            req.log.warn('search_flights_failed', 'validation_error');
            return res.status(400).json({ error: e.message });
        }
        req.log.error('search_flights_failed', 'internal_error');
        res.status(500).json({ error: "Database error in search-flights" });
    }
}

module.exports = {
    getUpcomingRoutes,
    searchRoutesByMunicipality,
    searchFlights
};
