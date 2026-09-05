const https = require('https');
const http = require('http');

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

function resolveRedirect(inputUrl, maxRedirects = 10) {
    return new Promise((resolve, reject) => {
        let redirectCount = 0;

        function doRequest(url) {
            if (redirectCount >= maxRedirects) return reject(new Error('Too many redirects'));

            const lib = url.startsWith('https') ? https : http;
            const options = {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SiVoyBot/1.0)',
                    'Accept': 'text/html,application/xhtml+xml'
                }
            };

            const req = lib.request(url, options, (res) => {
                const loc = res.headers['location'];
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc) {
                    redirectCount++;
                    res.destroy(); // Don't read the body on redirects
                    const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
                    doRequest(next);
                } else {
                    // At final destination — read first chunk of body for coord extraction
                    let body = '';
                    res.on('data', (chunk) => {
                        body += chunk.toString();
                        if (body.length > 10000) {
                            res.destroy(); // Got enough data
                        }
                    });
                    res.on('end', () => resolve({ finalUrl: url, htmlSnippet: body }));
                    res.on('close', () => resolve({ finalUrl: url, htmlSnippet: body }));
                }
            });

            req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
            req.on('error', (e) => {
                // Socket hang up after destroy is expected, treat as resolved with empty body
                if (e.code === 'ECONNRESET' || e.message.includes('socket hang up')) {
                    resolve({ finalUrl: url, htmlSnippet: '' });
                } else {
                    reject(e);
                }
            });
            req.end();
        }

        doRequest(inputUrl);
    });
}

function extractCoordsFromUrl(url) {
    let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    m = url.match(/\/search\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    m = url.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    return null;
}

async function resolveMapsLink(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('Missing url param');
    }

    const directCoords = extractCoordsFromUrl(url);
    if (directCoords) {
        return { lat: directCoords.lat, lng: directCoords.lng, resolvedUrl: url };
    }

    const { finalUrl, htmlSnippet } = await resolveRedirect(url);

    let coords = extractCoordsFromUrl(finalUrl);
    if (coords) {
        return { lat: coords.lat, lng: coords.lng, resolvedUrl: finalUrl };
    }

    if (htmlSnippet) {
        let m = htmlSnippet.match(/"lat"\s*:\s*(-?\d+\.\d+).*?"lng"\s*:\s*(-?\d+\.\d+)/);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), resolvedUrl: finalUrl };

        m = htmlSnippet.match(/\[(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), resolvedUrl: finalUrl };

        m = htmlSnippet.match(/content="https:\/\/www\.google\.com\/maps[^"]*@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), resolvedUrl: finalUrl };
    }

    throw new Error('No se encontraron coordenadas. Intenta copiar el link largo desde Google Maps.');
}

module.exports = {
    resolveMapsLink,
    searchPlaces,
    resolvePlace
};
