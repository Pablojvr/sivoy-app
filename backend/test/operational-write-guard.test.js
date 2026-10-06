const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

async function request(server, method, path, body = '{invalid', contentType = 'application/json') {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { 'content-type': contentType },
        body: method === 'GET' || method === 'OPTIONS' ? undefined : body
    });
    return {
        status: response.status,
        body: await response.text(),
        requestId: response.headers.get('x-request-id')
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

test('development keeps operational routes available', async (t) => {
    const priorEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
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
        ['PUT', '/api/locations/456']
    ]) {
        const result = await request(server, method, path);
        assert.equal(result.status, 400, `${method} ${path} reaches the existing JSON parser`);
    }
});
