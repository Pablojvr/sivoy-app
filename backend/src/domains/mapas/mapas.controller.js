const mapasService = require('./mapas.service');

async function resolveMapsLink(req, res) {
    try {
        const { url } = req.body;
        const result = await mapasService.resolveMapsLink(url);
        res.json({ success: true, ...result });
    } catch (e) {
        if (e.message.startsWith('Missing')) {
            req.log.warn('resolve_maps_link_failed', 'validation_error');
            return res.status(400).json({ error: e.message });
        }
        req.log.error('resolve_maps_link_failed', 'maps_provider_error');
        return res.status(500).json({ success: false, error: e.message });
    }
}

async function searchPlaces(req, res) {
    try {
        const { query, sessionToken } = req.body;
        const suggestions = await mapasService.searchPlaces(query, sessionToken);
        res.json({ success: true, suggestions });
    } catch (e) {
        if (Number.isInteger(e.statusCode) && e.statusCode >= 400 && e.statusCode < 500) {
            req.log.warn('search_places_failed', 'maps_request_rejected');
        } else {
            req.log.error('search_places_failed', 'maps_provider_error');
        }
        res.status(e.statusCode || 500).json({
            success: false,
            code: e.code || 'MAPS_ERROR',
            error: e.message
        });
    }
}

async function resolvePlace(req, res) {
    try {
        const { placeId, sessionToken } = req.body;
        const place = await mapasService.resolvePlace(placeId, sessionToken);
        res.json({ success: true, place });
    } catch (e) {
        if (Number.isInteger(e.statusCode) && e.statusCode >= 400 && e.statusCode < 500) {
            req.log.warn('resolve_place_failed', 'maps_request_rejected');
        } else {
            req.log.error('resolve_place_failed', 'maps_provider_error');
        }
        res.status(e.statusCode || 500).json({
            success: false,
            code: e.code || 'MAPS_ERROR',
            error: e.message
        });
    }
}

module.exports = {
    resolveMapsLink,
    searchPlaces,
    resolvePlace
};
