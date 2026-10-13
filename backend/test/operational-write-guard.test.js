const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

async function request(server, method, path, body = '{invalid', contentType = 'application/json') {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'content-type': contentType },
        body: method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? undefined : body
    });
    return {
        status: response.status,
        body: await response.text(),
        requestId: response.headers.get('x-request-id'),
        cacheControl: response.headers.get('cache-control')
    };
}

test('production disables only operational company and point writes before body parsing', async (t) => {
    const priorEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const server = app.listen(0);
    t.after(() => {
        if (priorEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = priorEnvironment;
        server.close();
    });

    for (const [method, path] of [
        ['POST', '/api/empresas'],
        ['PUT', '/api/empresas/123'],
        ['POST', '/api/agencias'],
        ['PUT', '/api/locations/456'],
        ['POST', '/API/EMPRESAS/'],
        ['PUT', '/api/locations/456/?source=test']
    ]) {
        const result = await request(server, method, path);
        assert.equal(result.status, 403, `${method} ${path}`);
        assert.deepEqual(JSON.parse(result.body), { error: 'Operational writes are disabled' });
        assert.match(result.requestId, /^[0-9a-f-]{36}$/i, 'denials remain observable');
    }

    const multipart = await request(server, 'POST', '/api/empresas', 'not-a-real-multipart-body', 'multipart/form-data; boundary=foo');
    assert.equal(multipart.status, 403, 'multipart uploads are blocked before Multer');

    const routeSearch = await request(server, 'POST', '/api/search-routes-by-municipality');
    assert.equal(routeSearch.status, 400, 'route searches reach the existing JSON parser');

    const mapsLookup = await request(server, 'POST', '/api/resolve-maps-link');
    assert.equal(mapsLookup.status, 400, 'Maps requests remain public');

    const preflight = await request(server, 'OPTIONS', '/api/empresas');
    assert.equal(preflight.status, 200, 'CORS preflight remains enabled');
});

test('production retires the unbounded legacy catalog read before database access', async (t) => {
    const priorEnvironment = process.env.NODE_ENV;
    const ubicacionesService = require('../src/domains/ubicaciones/ubicaciones.service');
    const originalGetAllLocations = ubicacionesService.getAllLocations;
    let calls = 0;
    process.env.NODE_ENV = 'production';
    ubicacionesService.getAllLocations = async () => {
        calls += 1;
        return [];
    };
    const server = app.listen(0);
    t.after(() => {
        if (priorEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = priorEnvironment;
        ubicacionesService.getAllLocations = originalGetAllLocations;
        server.close();
    });

    const legacy = await request(server, 'GET', '/api/locations');
    assert.equal(legacy.status, 410);
    assert.deepEqual(JSON.parse(legacy.body), {
        error: 'Gone',
        message: 'GET /api/locations is retired. Use bounded /api/catalog endpoints.',
        code: 'ENDPOINT_RETIRED'
    });
    assert.equal(calls, 0, 'the retired endpoint must not reach PostgreSQL');
    assert.match(legacy.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(legacy.cacheControl, 'no-store, no-cache, must-revalidate');

    const legacyHead = await request(server, 'HEAD', '/api/locations');
    assert.equal(legacyHead.status, 410);
    assert.equal(legacyHead.body, '');
    assert.equal(legacyHead.cacheControl, 'no-store, no-cache, must-revalidate');
    assert.equal(calls, 0, 'HEAD must also retire before PostgreSQL access');

    const removedDiagnostic = await request(server, 'GET', '/api/test-location');
    assert.equal(removedDiagnostic.status, 404);
    assert.deepEqual(JSON.parse(removedDiagnostic.body), { error: 'API endpoint not found' });

    const removedDiagnosticPost = await request(server, 'POST', '/api/test-location', '{}');
    assert.equal(removedDiagnosticPost.status, 404);
    assert.deepEqual(JSON.parse(removedDiagnosticPost.body), { error: 'API endpoint not found' });

    const catalog = await request(server, 'GET', '/api/catalog/points?limit=51');
    assert.equal(catalog.status, 400, 'the bounded catalog remains publicly reachable');
    assert.equal(JSON.parse(catalog.body).error.code, 'VALIDATION_ERROR');
});

test('production guards normalize NODE_ENV casing consistently', async (t) => {
    const priorEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'PrOdUcTiOn';
    const server = app.listen(0);
    t.after(() => {
        if (priorEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = priorEnvironment;
        server.close();
    });

    const write = await request(server, 'POST', '/api/empresas');
    assert.equal(write.status, 403);

    const legacy = await request(server, 'GET', '/api/locations');
    assert.equal(legacy.status, 410);
});

test('development keeps operational routes available', async (t) => {
    const priorEnvironment = process.env.NODE_ENV;
    const ubicacionesService = require('../src/domains/ubicaciones/ubicaciones.service');
    const originalGetAllLocations = ubicacionesService.getAllLocations;
    process.env.NODE_ENV = 'development';
    ubicacionesService.getAllLocations = async () => [];
    const server = app.listen(0);
    t.after(() => {
        if (priorEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = priorEnvironment;
        ubicacionesService.getAllLocations = originalGetAllLocations;
        server.close();
    });

    for (const [method, path] of [
        ['POST', '/api/empresas'],
        ['PUT', '/api/empresas/123'],
        ['POST', '/api/agencias'],
        ['PUT', '/api/locations/456']
    ]) {
        const result = await request(server, method, path);
        assert.equal(result.status, 400, `${method} ${path} reaches the existing JSON parser`);
    }

    const legacy = await request(server, 'GET', '/api/locations');
    assert.equal(legacy.status, 200);
    assert.deepEqual(JSON.parse(legacy.body), []);

    const removedDiagnostic = await request(server, 'GET', '/api/test-location');
    assert.equal(removedDiagnostic.status, 404);
});
