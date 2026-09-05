const mapasService = require('./mapas.service');

async function resolveMapsLink(req, res) {
    try {
        const { url } = req.body;
        const result = await mapasService.resolveMapsLink(url);
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('resolve-maps-link error:', e.message);
        if (e.message.startsWith('Missing')) {
            return res.status(400).json({ error: e.message });
        }
        return res.status(500).json({ success: false, error: e.message });
    }
}

async function searchPlaces(req, res) {
    try {
        const { query, sessionToken } = req.body;
        const suggestions = await mapasService.searchPlaces(query, sessionToken);
        res.json({ success: true, suggestions });
    } catch (e) {
        console.error('places-autocomplete error:', e.message);
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
        console.error('place-details error:', e.message);
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
