'use strict';

const { createMapsLinkResolver } = require('./maps-link-resolver');

const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';

function boundedEnvInteger(value, fallback, minimum, maximum) {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
        ? parsed
        : fallback;
}

function createServiceError(message, statusCode = 500, code = 'MAPS_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

function createMapasService(options = {}) {
    const env = options.env || process.env;
    const fetchFn = options.fetchFn || globalThis.fetch;
    const mapsLinkResolverFactory = options.mapsLinkResolverFactory || createMapsLinkResolver;
    if (typeof fetchFn !== 'function') throw new TypeError('fetchFn must be a function');
    if (typeof mapsLinkResolverFactory !== 'function') {
        throw new TypeError('mapsLinkResolverFactory must be a function');
    }

    const placesTimeoutMs = boundedEnvInteger(env.GOOGLE_PLACES_TIMEOUT_MS, 8000, 1000, 20000);
    const placesMaxResponseBytes = boundedEnvInteger(
        env.GOOGLE_PLACES_MAX_RESPONSE_BYTES,
        262144,
        4096,
        1048576
    );
    const resolveMapsLinkRaw = mapsLinkResolverFactory({
        timeoutMs: boundedEnvInteger(env.MAPS_RESOLVER_TIMEOUT_MS, 8000, 1000, 20000),
        maxBodyBytes: boundedEnvInteger(env.MAPS_RESOLVER_MAX_BODY_BYTES, 16384, 4096, 65536)
    });

    async function requestGooglePlaces(path, requestOptions = {}) {
        const apiKey = env.GOOGLE_MAPS_API_KEY || '';
        if (!apiKey) {
            throw createServiceError(
                'La ayuda para buscar lugares aún no está configurada.',
                503,
                'GOOGLE_PLACES_NOT_CONFIGURED'
            );
        }

        let response;
        let payload;
        try {
            response = await fetchFn(`${GOOGLE_PLACES_BASE_URL}${path}`, {
                ...requestOptions,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    ...(requestOptions.headers || {})
                },
                signal: AbortSignal.timeout(placesTimeoutMs)
            });
            payload = await readBoundedJson(response, placesMaxResponseBytes);
        } catch (error) {
            if (error?.code === 'GOOGLE_PLACES_RESPONSE_TOO_LARGE') throw error;
            if (isTimeoutError(error)) {
                throw createServiceError(
                    'Google Places no respondió a tiempo.',
                    504,
                    'GOOGLE_PLACES_TIMEOUT'
                );
            }
            throw createServiceError(
                'Google Places no pudo completar la solicitud.',
                502,
                'GOOGLE_PLACES_UPSTREAM_ERROR'
            );
        }

        if (!response.ok) {
            throw createServiceError(
                'Google Places no pudo completar la solicitud.',
                502,
                'GOOGLE_PLACES_UPSTREAM_ERROR'
            );
        }
        return payload;
    }

    async function searchPlaces(query, sessionToken) {
        const normalizedQuery = typeof query === 'string' ? query.trim() : '';
        if (normalizedQuery.length < 3 || normalizedQuery.length > 128) {
            throw createServiceError(
                'Escribe entre 3 y 128 caracteres para buscar un lugar.',
                400,
                'INVALID_PLACE_QUERY'
            );
        }
        const normalizedSessionToken = validateSessionToken(sessionToken);
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
                ...(normalizedSessionToken ? { sessionToken: normalizedSessionToken } : {})
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
        if (typeof placeId !== 'string'
            || placeId.length < 1
            || placeId.length > 256
            || placeId !== placeId.trim()) {
            throw createServiceError(
                'El identificador del lugar no es válido.',
                400,
                'INVALID_PLACE_ID'
            );
        }
        const normalizedSessionToken = validateSessionToken(sessionToken);
        const query = new URLSearchParams({ languageCode: 'es', regionCode: 'SV' });
        if (normalizedSessionToken) query.set('sessionToken', normalizedSessionToken);

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

    async function resolveMapsLink(input) {
        try {
            return await resolveMapsLinkRaw(input);
        } catch (error) {
            if (typeof error?.message === 'string' && error.message.startsWith('Missing')) {
                throw createServiceError(error.message, 400, 'MISSING_MAPS_URL');
            }
            if (error instanceof TypeError) {
                throw createServiceError('Invalid Google Maps URL', 400, 'INVALID_MAPS_URL');
            }
            if (typeof error?.message === 'string' && /Maps link timeout/i.test(error.message)) {
                throw createServiceError(
                    'Google Maps no respondió a tiempo.',
                    504,
                    'MAPS_RESOLVER_TIMEOUT'
                );
            }
            throw createServiceError(
                'Google Maps no pudo completar la solicitud.',
                502,
                'MAPS_RESOLVER_UPSTREAM_ERROR'
            );
        }
    }

    return { resolveMapsLink, searchPlaces, resolvePlace };
}

function validateSessionToken(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string'
        || value.length > 64
        || value !== value.trim()
        || !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw createServiceError(
            'El token de sesión no es válido.',
            400,
            'INVALID_SESSION_TOKEN'
        );
    }
    return value;
}

function isTimeoutError(error) {
    return error?.name === 'TimeoutError'
        || error?.name === 'AbortError'
        || error?.code === 'ETIMEDOUT';
}

async function readBoundedJson(response, maxBytes) {
    const declaredLength = response?.headers?.get?.('content-length');
    if (/^\d+$/.test(declaredLength || '') && Number(declaredLength) > maxBytes) {
        throw responseTooLargeError();
    }
    if (!response?.body || typeof response.body.getReader !== 'function') {
        const payload = await response.json().catch(() => ({}));
        if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > maxBytes) {
            throw responseTooLargeError();
        }
        return payload;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel().catch(() => {});
                throw responseTooLargeError();
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock?.();
    }

    const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), totalBytes).toString('utf8');
    if (!body) return {};
    try {
        return JSON.parse(body);
    } catch {
        return {};
    }
}

function responseTooLargeError() {
    return createServiceError(
        'Google Places devolvió una respuesta demasiado grande.',
        502,
        'GOOGLE_PLACES_RESPONSE_TOO_LARGE'
    );
}

const defaultService = createMapasService();

module.exports = {
    createMapasService,
    resolveMapsLink: (...args) => defaultService.resolveMapsLink(...args),
    searchPlaces: (...args) => defaultService.searchPlaces(...args),
    resolvePlace: (...args) => defaultService.resolvePlace(...args)
};
