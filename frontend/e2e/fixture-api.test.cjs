const test = require('node:test');
const assert = require('node:assert');
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

  const request = (method, path, body = null, headers = {}) => {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path,
          method,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data,
            });
          });
        },
      );
      req.on('error', reject);
      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  };

  await t.test('CORS OPTIONS', async () => {
    const res = await request('OPTIONS', '/api/locations', null, {
      Origin: 'http://localhost:4303',
      'Access-Control-Request-Method': 'GET',
    });
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:4303');
  });

  await t.test(
    'CORS allowed includes Vary: Origin and disallowed origin receives no ACAO',
    async () => {
      const resAllowed = await request('OPTIONS', '/api/locations', null, {
        Origin: 'http://localhost:4303',
        'Access-Control-Request-Method': 'GET',
      });
      assert.strictEqual(resAllowed.statusCode, 204);
      assert.strictEqual(
        resAllowed.headers['access-control-allow-origin'],
        'http://localhost:4303',
      );
      assert.strictEqual(resAllowed.headers['vary'], 'Origin');

      const resAllowedGet = await request('GET', '/api/locations', null, {
        Origin: 'http://127.0.0.1:4303',
      });
      assert.strictEqual(resAllowedGet.statusCode, 200);
      assert.strictEqual(
        resAllowedGet.headers['access-control-allow-origin'],
        'http://127.0.0.1:4303',
      );
      assert.strictEqual(resAllowedGet.headers['vary'], 'Origin');

      const resDisallowed = await request('GET', '/api/locations', null, {
        Origin: 'http://malicious.example.com',
      });
      assert.strictEqual(resDisallowed.statusCode, 200);
      assert.strictEqual(resDisallowed.headers['access-control-allow-origin'], undefined);

      const resDisallowedOptions = await request('OPTIONS', '/api/locations', null, {
        Origin: 'http://malicious.example.com',
      });
      assert.strictEqual(resDisallowedOptions.statusCode, 204);
      assert.strictEqual(resDisallowedOptions.headers['access-control-allow-origin'], undefined);
    },
  );

  await t.test('GET /api/locations returns 2 valid LocationDto points', async () => {
    const res = await request('GET', '/api/locations', null, { Origin: 'http://localhost:4303' });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.data);
    assert.strictEqual(body.length, 2);

    const p1 = body.find((p) => p.nombre_destino === 'Agencia Centro');
    const p2 = body.find((p) => p.nombre_destino === 'Agencia Norte');

    assert.ok(p1, 'Missing Agencia Centro');
    assert.ok(p2, 'Missing Agencia Norte');

    assert.strictEqual(p1.ubicacion.municipio, 'San Salvador');
    assert.strictEqual(p2.ubicacion.municipio, 'Santa Tecla');

    assert.strictEqual(p1.empresa, p2.empresa);
    assert.ok(p1.empresa, 'Empresa should not be empty');

    const assertValidLocation = (p) => {
      assert.ok(p.id, 'Missing id');
      assert.ok(p.ubicacion.lat, 'Missing lat');
      assert.ok(p.ubicacion.lng, 'Missing lng');
      assert.ok(p.ubicacion.departamento, 'Missing departamento');
      assert.ok(Array.isArray(p.horarios_operativos), 'horarios_operativos should be array');
      assert.ok(Array.isArray(p.reglas_entrega), 'reglas_entrega should be array');
    };
    assertValidLocation(p1);
    assertValidLocation(p2);
    assert.deepStrictEqual(
      p1.horarios_operativos.map((h) => h.dia_semana),
      ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    );
    assert.deepStrictEqual(
      p2.horarios_operativos.map((h) => h.dia_semana),
      ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    );
  });

  await t.test('GET /api/empresas returns {success:true, empresas:[]}', async () => {
    const res = await request('GET', '/api/empresas');
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.data);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.empresas));
  });

  await t.test('POST /api/get-upcoming-routes returns empty for unknown', async () => {
    const res = await request('POST', '/api/get-upcoming-routes', {
      origen: ['UNKNOWN'],
      destino: ['UNKNOWN'],
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.data);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.results.length, 0);
  });

  await t.test('POST /api/get-upcoming-routes returns result for real payload', async () => {
    const res = await request('POST', '/api/get-upcoming-routes', {
      origen: ['Agencia Norte'],
      destino: ['Agencia Centro'],
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.data);
    assert.strictEqual(body.success, true);
    assert.ok(body.results.length > 0, 'Should have results');
    const result = body.results[0];
    assert.strictEqual(result.empresa, 'Empresa de prueba');
    assert.strictEqual(result.origen_nombre, 'Agencia Norte');
    assert.strictEqual(result.destino_nombre, 'Agencia Centro');
    assert.ok(result.opciones.length > 0, 'opciones should not be empty');
    assert.ok(result.opciones_entrega.length > 0, 'opciones_entrega should not be empty');
    assert.deepStrictEqual(Object.keys(result.opciones_entrega[0]).sort(), [
      'dropoff_date',
      'dropoff_msg',
      'fecha_llegada',
      'horario_recoleccion',
    ]);
  });

  await t.test('POST /api/search-flights returns empty for unknown', async () => {
    const res = await request('POST', '/api/search-flights', {
      origen_municipio: 'UNKNOWN',
      destino_municipio: 'UNKNOWN',
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.data);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.results.length, 0);
  });

  await t.test('POST /api/search-flights returns result for real payloads', async () => {
    const res = await request('POST', '/api/search-flights', {
      origen_municipio: 'Santa Tecla',
      destino_municipio: 'San Salvador',
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.data);
    assert.strictEqual(body.success, true);
    assert.ok(body.results.length > 0, 'Should have results');
    const result = body.results[0];
    assert.strictEqual(result.empresa, 'Empresa de prueba');
    assert.strictEqual(result.origen_nombre, 'Agencia Norte');
    assert.strictEqual(result.destino_nombre_destino, 'Agencia Centro');
    assert.ok(result.opciones_entrega.length > 0, 'opciones_entrega should not be empty');
    assert.deepStrictEqual(Object.keys(result.opciones_entrega[0]).sort(), [
      'dropoff_date',
      'dropoff_msg',
      'fecha_llegada',
      'horario_recoleccion',
    ]);
  });

  await t.test('POST /api/places/autocomplete returns {success:true, suggestions:[]}', async () => {
    const res = await request('POST', '/api/places/autocomplete', {
      query: 'algo',
      sessionToken: 'abc',
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.data);
    assert.strictEqual(body.success, true);
    assert.deepStrictEqual(body.suggestions, []);
  });

  await t.test('404 Not Found', async () => {
    const res = await request('GET', '/api/unknown');
    assert.strictEqual(res.statusCode, 404);
  });

  await t.test('405 Method Not Allowed', async () => {
    const res = await request('POST', '/api/locations');
    assert.strictEqual(res.statusCode, 405);
  });

  await t.test('400 Bad Request on invalid JSON', async () => {
    const res = await request('POST', '/api/search-flights', '{badjson');
    assert.strictEqual(res.statusCode, 400);
  });

  await t.test('400 Bad Request on valid JSON primitives and arrays', async () => {
    for (const payload of ['123', '"plain-string"', 'true', 'null', '[]', '["Agencia Norte"]']) {
      const res = await request('POST', '/api/get-upcoming-routes', payload);
      assert.strictEqual(
        res.statusCode,
        400,
        `Expected 400 for payload: ${payload}, got ${res.statusCode}`,
      );
    }
  });

  await t.test(
    '413 Payload Too Large on body >64 KiB and clean connection termination',
    async () => {
      const largeBody = JSON.stringify({ padding: 'x'.repeat(65536) });
      const res = await request('POST', '/api/get-upcoming-routes', largeBody);
      assert.strictEqual(res.statusCode, 413);
    },
  );

  await t.test(
    'startServer rejects EADDRINUSE without crash and allows stop/retry',
    { timeout: 2000 },
    async () => {
      await assert.rejects(
        async () => {
          await startServer(port);
        },
        (err) => {
          assert.strictEqual(err.code, 'EADDRINUSE');
          return true;
        },
      );
      await stopServer();
      const newPort = await startServer(0);
      assert.ok(typeof newPort === 'number' && newPort > 0);
      await stopServer();
      port = await startServer(0);
    },
  );
});
