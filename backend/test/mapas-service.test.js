'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createMapasService } = require('../src/domains/mapas/mapas.service');

test('Places valida query, placeId y sessionToken antes de llamar al proveedor', async () => {
  let calls = 0;
  const service = createService({
    fetchFn: async () => { calls++; return jsonResponse({ suggestions: [] }); }
  });

  await assert.rejects(service.searchPlaces('ab', 'valid-token'), hasError(400, 'INVALID_PLACE_QUERY'));
  await assert.rejects(service.searchPlaces('a'.repeat(129), 'valid-token'), hasError(400, 'INVALID_PLACE_QUERY'));
  await assert.rejects(service.searchPlaces('San Salvador', 'token with spaces'), hasError(400, 'INVALID_SESSION_TOKEN'));
  await assert.rejects(service.resolvePlace('x'.repeat(257), 'valid-token'), hasError(400, 'INVALID_PLACE_ID'));
  assert.equal(calls, 0);
});

test('Places conserva respuesta exitosa acotada y field masks actuales', async () => {
  const requests = [];
  const service = createService({
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({
        suggestions: [{
          placePrediction: {
            placeId: 'place-1',
            text: { text: 'Centro Comercial' },
            structuredFormat: {
              mainText: { text: 'Centro Comercial' },
              secondaryText: { text: 'San Salvador' }
            }
          }
        }]
      });
    }
  });

  const result = await service.searchPlaces('  centro  ', 'token-1');
  assert.deepEqual(result, [{
    placeId: 'place-1',
    text: 'Centro Comercial',
    mainText: 'Centro Comercial',
    secondaryText: 'San Salvador'
  }]);
  assert.match(requests[0].url, /places:autocomplete$/);
  assert.equal(JSON.parse(requests[0].options.body).input, 'centro');
  assert.equal(requests[0].options.headers['X-Goog-Api-Key'], 'test-key');
});

test('Places traduce timeout, upstream y respuesta excesiva sin filtrar detalles', async () => {
  const timeoutService = createService({
    fetchFn: async () => { throw Object.assign(new Error('socket secret'), { name: 'TimeoutError' }); }
  });
  await assert.rejects(
    timeoutService.searchPlaces('centro', 'token-1'),
    hasError(504, 'GOOGLE_PLACES_TIMEOUT', 'Google Places no respondió a tiempo.')
  );

  const upstreamService = createService({
    fetchFn: async () => jsonResponse({ error: { message: 'provider secret' } }, 500)
  });
  await assert.rejects(
    upstreamService.searchPlaces('centro', 'token-1'),
    hasError(502, 'GOOGLE_PLACES_UPSTREAM_ERROR', 'Google Places no pudo completar la solicitud.')
  );

  const oversizedService = createService({
    env: { GOOGLE_PLACES_MAX_RESPONSE_BYTES: '4096' },
    fetchFn: async () => new Response('x'.repeat(4097), {
      status: 200,
      headers: { 'content-length': '4097', 'content-type': 'application/json' }
    })
  });
  await assert.rejects(
    oversizedService.searchPlaces('centro', 'token-1'),
    hasError(502, 'GOOGLE_PLACES_RESPONSE_TOO_LARGE', 'Google Places devolvió una respuesta demasiado grande.')
  );
});

test('Places cancela una respuesta fragmentada que supera el límite sin Content-Length', async () => {
  let cancelled = false;
  const service = createService({
    env: { GOOGLE_PLACES_MAX_RESPONSE_BYTES: '4096' },
    fetchFn: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(3000));
        controller.enqueue(new Uint8Array(2000));
      },
      cancel() {
        cancelled = true;
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  });

  await assert.rejects(
    service.searchPlaces('centro', 'token-1'),
    hasError(502, 'GOOGLE_PLACES_RESPONSE_TOO_LARGE')
  );
  assert.equal(cancelled, true);
});

test('Maps clasifica URL inválida, timeout y upstream; configuración queda acotada', async () => {
  const captured = [];
  const make = (error, env = {}) => createMapasService({
    env: { GOOGLE_MAPS_API_KEY: 'test-key', ...env },
    fetchFn: async () => jsonResponse({}),
    mapsLinkResolverFactory: (options) => {
      captured.push(options);
      return async () => { throw error; };
    }
  });

  await assert.rejects(make(new TypeError('Invalid Google Maps URL')).resolveMapsLink('bad'), hasError(400, 'INVALID_MAPS_URL'));
  await assert.rejects(make(new Error('Maps link timeout')).resolveMapsLink('url'), hasError(504, 'MAPS_RESOLVER_TIMEOUT'));
  await assert.rejects(
    make(new Error('dns secret')).resolveMapsLink('url'),
    hasError(502, 'MAPS_RESOLVER_UPSTREAM_ERROR', 'Google Maps no pudo completar la solicitud.')
  );
  make(new Error('unused'), {
    MAPS_RESOLVER_TIMEOUT_MS: '999999',
    MAPS_RESOLVER_MAX_BODY_BYTES: '1'
  });
  assert.deepEqual(captured.at(-1), { timeoutMs: 8000, maxBodyBytes: 16384 });
});

function createService(options = {}) {
  return createMapasService({
    env: { GOOGLE_MAPS_API_KEY: 'test-key', ...(options.env || {}) },
    fetchFn: options.fetchFn,
    mapsLinkResolverFactory: options.mapsLinkResolverFactory || (() => async () => ({ lat: 1, lng: 2 }))
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function hasError(statusCode, code, message) {
  return (error) => error?.statusCode === statusCode
    && error?.code === code
    && (message === undefined || error.message === message);
}
