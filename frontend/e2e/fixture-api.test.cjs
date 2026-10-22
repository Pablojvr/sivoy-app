const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, stopServer } = require('./fixture-api.cjs');

test('Fixture API', async (t) => {
  let port = 0;

  t.before(async () => {
    port = await startServer(0);
  });

  t.after(async () => {
    await stopServer();
  });

  const request = (method, path, body = null, headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });

  const getJson = async (path, headers = {}) => {
    const response = await request('GET', path, null, headers);
    return { ...response, body: JSON.parse(response.data) };
  };

  await t.test('CORS allows local origins and never reflects an unknown origin', async () => {
    const options = await request('OPTIONS', '/api/catalog/points', null, {
      Origin: 'http://localhost:4303',
      'Access-Control-Request-Method': 'GET',
    });
    assert.equal(options.statusCode, 204);
    assert.equal(options.headers['access-control-allow-origin'], 'http://localhost:4303');
    assert.equal(options.headers.vary, 'Origin');

    const allowed = await request('GET', '/api/catalog/points', null, {
      Origin: 'http://127.0.0.1:4303',
    });
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.headers['access-control-allow-origin'], 'http://127.0.0.1:4303');
    assert.equal(allowed.headers.vary, 'Origin');

    const disallowed = await request('GET', '/api/catalog/points', null, {
      Origin: 'http://malicious.example.com',
    });
    assert.equal(disallowed.statusCode, 200);
    assert.equal(disallowed.headers['access-control-allow-origin'], undefined);
  });

  await t.test('fixture rejects the legacy endpoint so E2E cannot depend on it', async () => {
    assert.equal((await request('GET', '/api/locations')).statusCode, 404);
    assert.equal((await request('POST', '/api/locations', {})).statusCode, 404);
  });

  await t.test('points returns canonical bounded summaries', async () => {
    const response = await getJson('/api/catalog/points');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.page.limit, 20);
    assert.equal(response.body.page.hasMore, true);
    assert.match(response.body.page.nextCursor, /^[A-Za-z0-9_-]+$/);
    assert.equal(response.body.meta.catalogRevision, 'catalog:fixture');
    assert.equal(response.body.data.length, 20);

    const point = response.body.data[0];
    assert.deepEqual(Object.keys(point).sort(), [
      'availability', 'company', 'location', 'media', 'name', 'pointId', 'pointType',
      'schedulePreview',
    ]);
    assert.equal(point.pointId, 'POINT_AGENCIA_CENTRO');
    assert.deepEqual(point.company, { companyId: '1', name: 'Empresa de prueba', logoUrl: null });
    assert.equal(typeof point.location.coordinates.lat, 'number');
    assert.ok(Array.isArray(point.schedulePreview));
    assert.equal('schedules' in point, false);
  });

  await t.test('points applies exact structural filters and CONTAINS text search', async () => {
    const municipality = await getJson('/api/catalog/points?municipality=sAn%20sAlVaDoR');
    assert.equal(municipality.body.data.length, 1);
    assert.equal(municipality.body.data[0].pointId, 'POINT_AGENCIA_CENTRO');
    assert.equal((await getJson('/api/catalog/points?municipality=San')).body.data.length, 0);

    const text = await getJson('/api/catalog/points?q=agencia%20centro');
    assert.equal(text.body.data.length, 1);
    assert.equal(text.body.data[0].pointId, 'POINT_AGENCIA_CENTRO');
    assert.equal(
      (await getJson('/api/catalog/points?q=san%20salvdor')).body.data.length,
      0,
      'CONTAINS must not silently become fuzzy search',
    );

    const company = await getJson('/api/catalog/points?companyId=1&pointType=agencia&limit=50');
    assert.equal(company.body.data.length, 27);
    assert.ok(company.body.data.every((point) => point.company.companyId === '1'));
  });

  await t.test('Soyapango cursor pages are deterministic and do not overlap', async () => {
    const first = await getJson('/api/catalog/points?municipality=Soyapango&limit=20');
    assert.equal(first.body.data.length, 20);
    assert.equal(first.body.page.hasMore, true);
    assert.ok(first.body.page.nextCursor);

    const second = await getJson(
      `/api/catalog/points?municipality=Soyapango&limit=20&cursor=${encodeURIComponent(first.body.page.nextCursor)}`,
    );
    assert.equal(second.body.data.length, 5);
    assert.deepEqual(second.body.page, { limit: 20, hasMore: false, nextCursor: null });

    const ids = [...first.body.data, ...second.body.data].map((point) => point.pointId);
    assert.equal(ids.length, 25);
    assert.equal(new Set(ids).size, 25);
  });

  await t.test('points rejects malformed cursors and out-of-range limits', async () => {
    for (const path of [
      '/api/catalog/points?cursor=not-a-cursor',
      '/api/catalog/points?limit=nope',
      '/api/catalog/points?limit=0',
      '/api/catalog/points?limit=51',
      '/api/catalog/points?matchMode=FUZZY',
    ]) {
      assert.equal((await request('GET', path)).statusCode, 400, path);
    }
  });

  await t.test('point detail adds schedules and unknown points return 404', async () => {
    const detail = await getJson('/api/catalog/points/POINT_AGENCIA_CENTRO');
    assert.equal(detail.body.pointId, 'POINT_AGENCIA_CENTRO');
    assert.equal(detail.body.schedules.length, 5);
    assert.deepEqual(detail.body.schedules[0], {
      day: 'Lunes', opensAt: '08:00', closesAt: '17:00',
    });
    assert.equal((await request('GET', '/api/catalog/points/UNKNOWN')).statusCode, 404);
  });

  await t.test('facets expose company and paginated municipality counts', async () => {
    const company = await getJson('/api/catalog/facets?facet=company');
    assert.deepEqual(company.body.data, [{ value: '1', label: 'Empresa de prueba', count: 27 }]);

    const first = await getJson('/api/catalog/facets?facet=municipality&limit=2');
    assert.equal(first.body.data.length, 2);
    assert.equal(first.body.page.hasMore, true);
    const second = await getJson(
      `/api/catalog/facets?facet=municipality&limit=2&cursor=${encodeURIComponent(first.body.page.nextCursor)}`,
    );
    assert.equal(second.body.data.length, 1);
    assert.equal(second.body.data[0].label, 'Soyapango');
    assert.equal(second.body.data[0].count, 25);
    assert.equal(second.body.page.hasMore, false);

    const filtered = await getJson(
      '/api/catalog/facets?facet=municipality&department=San%20Salvador&q=soya',
    );
    assert.deepEqual(filtered.body.data.map((facet) => facet.label), ['Soyapango']);
    assert.equal((await request('GET', '/api/catalog/facets?facet=unknown')).statusCode, 400);
  });

  await t.test('GET /api/empresas returns its stable envelope', async () => {
    const response = await getJson('/api/empresas');
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.empresas));
  });

  await t.test('upcoming routes require stable point IDs', async () => {
    const legacy = await request('POST', '/api/get-upcoming-routes', {
      origen: ['Agencia Norte'], destino: ['Agencia Centro'],
    });
    assert.equal(JSON.parse(legacy.data).results.length, 0);

    const response = await request('POST', '/api/get-upcoming-routes', {
      origen: ['POINT_AGENCIA_NORTE'], destino: ['POINT_AGENCIA_CENTRO'],
    });
    const body = JSON.parse(response.data);
    assert.equal(response.statusCode, 200);
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].origen_nombre, 'Agencia Norte');
    assert.equal(body.results[0].destino_nombre, 'Agencia Centro');
    assert.deepEqual(Object.keys(body.results[0].opciones_entrega[0]).sort(), [
      'dropoff_date', 'dropoff_msg', 'fecha_llegada', 'horario_recoleccion',
    ]);
  });

  await t.test('municipality route search preserves its legacy response', async () => {
    const unknown = await request('POST', '/api/search-flights', {
      origen_municipio: 'UNKNOWN', destino_municipio: 'UNKNOWN',
    });
    assert.equal(JSON.parse(unknown.data).results.length, 0);

    const response = await request('POST', '/api/search-flights', {
      origen_municipio: 'Santa Tecla', destino_municipio: 'San Salvador',
    });
    const body = JSON.parse(response.data);
    assert.equal(body.success, true);
    assert.equal(body.results[0].destino_nombre_destino, 'Agencia Centro');
  });

  await t.test('autocomplete returns an empty suggestion envelope', async () => {
    const response = await request('POST', '/api/places/autocomplete', {
      query: 'algo', sessionToken: 'abc',
    });
    assert.deepEqual(JSON.parse(response.data), { success: true, suggestions: [] });
  });

  await t.test('unknown and unsupported canonical methods are bounded errors', async () => {
    assert.equal((await request('GET', '/api/unknown')).statusCode, 404);
    assert.equal((await request('POST', '/api/catalog/points', {})).statusCode, 405);
  });

  await t.test('invalid JSON values are rejected', async () => {
    assert.equal((await request('POST', '/api/search-flights', '{badjson')).statusCode, 400);
    for (const payload of ['123', '"plain-string"', 'true', 'null', '[]']) {
      assert.equal((await request('POST', '/api/get-upcoming-routes', payload)).statusCode, 400);
    }
  });

  await t.test('payloads above 64 KiB are rejected with a clean close', async () => {
    const response = await request(
      'POST', '/api/get-upcoming-routes', JSON.stringify({ padding: 'x'.repeat(65536) }),
    );
    assert.equal(response.statusCode, 413);
  });

  await t.test('startServer handles EADDRINUSE and remains restartable', { timeout: 2000 }, async () => {
    await assert.rejects(() => startServer(port), (error) => {
      assert.equal(error.code, 'EADDRINUSE');
      return true;
    });
    await stopServer();
    assert.ok((await startServer(0)) > 0);
    await stopServer();
    port = await startServer(0);
  });
});
