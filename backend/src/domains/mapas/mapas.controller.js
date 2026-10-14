'use strict';

const mapasService = require('./mapas.service');

const SAFE_MAPS_ERRORS = Object.freeze({
    INVALID_MAPS_URL: Object.freeze({ status: 400, message: 'Invalid Google Maps URL' }),
    MAPS_RESOLVER_TIMEOUT: Object.freeze({ status: 504, message: 'Google Maps no respondió a tiempo.' }),
    MAPS_RESOLVER_UPSTREAM_ERROR: Object.freeze({ status: 502, message: 'Google Maps no pudo completar la solicitud.' }),
    INVALID_PLACE_QUERY: Object.freeze({ status: 400, message: 'Escribe entre 3 y 128 caracteres para buscar un lugar.' }),
    INVALID_SESSION_TOKEN: Object.freeze({ status: 400, message: 'El token de sesión no es válido.' }),
    INVALID_PLACE_ID: Object.freeze({ status: 400, message: 'El identificador del lugar no es válido.' }),
    GOOGLE_PLACES_NOT_CONFIGURED: Object.freeze({ status: 503, message: 'La ayuda para buscar lugares aún no está configurada.' }),
    GOOGLE_PLACES_TIMEOUT: Object.freeze({ status: 504, message: 'Google Places no respondió a tiempo.' }),
    GOOGLE_PLACES_UPSTREAM_ERROR: Object.freeze({ status: 502, message: 'Google Places no pudo completar la solicitud.' }),
    GOOGLE_PLACES_RESPONSE_TOO_LARGE: Object.freeze({ status: 502, message: 'Google Places devolvió una respuesta demasiado grande.' })
});

async function resolveMapsLink(req, res) {
    try {
        const { url } = req.body;
        const result = await mapasService.resolveMapsLink(url);
        res.json({ success: true, ...result });
    } catch (error) {
        if (error?.code === 'MISSING_MAPS_URL') {
            req.log.warn('resolve_maps_link_failed', 'validation_error');
            return res.status(400).json({ error: 'Missing URL' });
        }
        return respondWithSafeError(req, res, 'resolve_maps_link_failed', error);
    }
}

async function searchPlaces(req, res) {
    try {
        const { query, sessionToken } = req.body;
        const suggestions = await mapasService.searchPlaces(query, sessionToken);
        res.json({ success: true, suggestions });
    } catch (error) {
        return respondWithSafeError(req, res, 'search_places_failed', error);
    }
}

async function resolvePlace(req, res) {
    try {
        const { placeId, sessionToken } = req.body;
        const place = await mapasService.resolvePlace(placeId, sessionToken);
        res.json({ success: true, place });
    } catch (error) {
        return respondWithSafeError(req, res, 'resolve_place_failed', error);
    }
}

function respondWithSafeError(req, res, eventName, error) {
    const safeError = SAFE_MAPS_ERRORS[error?.code];
    if (!safeError) {
        req.log.error(eventName, 'maps_provider_error');
        return res.status(500).json({
            success: false,
            code: 'MAPS_ERROR',
            error: 'Maps service error'
        });
    }

    const logLevel = safeError.status >= 400 && safeError.status < 500 ? 'warn' : 'error';
    const logReason = logLevel === 'warn' ? 'maps_request_rejected' : 'maps_provider_error';
    req.log[logLevel](eventName, logReason);
    return res.status(safeError.status).json({
        success: false,
        code: error.code,
        error: safeError.message
    });
}

module.exports = {
    resolveMapsLink,
    searchPlaces,
    resolvePlace
};
