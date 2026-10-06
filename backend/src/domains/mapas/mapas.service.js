const { createMapsLinkResolver } = require('./maps-link-resolver');

const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';

function getGoogleMapsApiKey() {
    return process.env.GOOGLE_MAPS_API_KEY || '';
}

function createServiceError(message, statusCode = 500, code = 'MAPS_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

async function requestGooglePlaces(path, options = {}) {
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
        throw createServiceError(
            'La ayuda para buscar lugares aún no está configurada.',
            503,
            'GOOGLE_PLACES_NOT_CONFIGURED'
        );
    }

    const response = await fetch(`${GOOGLE_PLACES_BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            ...(options.headers || {})
        },
        signal: AbortSignal.timeout(8000)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const upstreamMessage = payload?.error?.message || 'Google Places no pudo completar la solicitud.';
        throw createServiceError(upstreamMessage, 502, 'GOOGLE_PLACES_UPSTREAM_ERROR');
    }

    return payload;
}

async function searchPlaces(query, sessionToken) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    if (normalizedQuery.length < 3) {
        throw createServiceError('Escribe al menos 3 caracteres para buscar un lugar.', 400, 'INVALID_PLACE_QUERY');
    }

    const payload = await requestGooglePlaces('/places:autocomplete', {
        method: 'POST',
        headers: {
            'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat'
        },
        body: JSON.stringify({
            input: normalizedQuery,
            includedRegionCodes: ['sv'],
            languageCode: 'es',
            regionCode: 'SV',
            includeQueryPredictions: false,
            ...(sessionToken ? { sessionToken } : {})
        })
    });

    return (payload.suggestions || [])
        .map(item => item.placePrediction)
        .filter(Boolean)
        .map(place => ({
            placeId: place.placeId,
            text: place.text?.text || '',
            mainText: place.structuredFormat?.mainText?.text || place.text?.text || '',
            secondaryText: place.structuredFormat?.secondaryText?.text || ''
        }));
}

async function resolvePlace(placeId, sessionToken) {
    if (!placeId || typeof placeId !== 'string') {
        throw createServiceError('Falta el identificador del lugar.', 400, 'INVALID_PLACE_ID');
    }

    const query = new URLSearchParams({ languageCode: 'es', regionCode: 'SV' });
    if (sessionToken) query.set('sessionToken', sessionToken);

    const place = await requestGooglePlaces(`/places/${encodeURIComponent(placeId)}?${query.toString()}`, {
        method: 'GET',
        headers: {
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,addressComponents,location'
        }
    });

    return {
        placeId: place.id,
        name: place.displayName?.text || '',
        formattedAddress: place.formattedAddress || '',
        addressComponents: place.addressComponents || [],
        location: place.location || null
    };
}

const resolveMapsLink = createMapsLinkResolver();

module.exports = {
    resolveMapsLink,
    searchPlaces,
    resolvePlace
};
