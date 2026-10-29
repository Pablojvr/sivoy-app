'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const {
  createApiRateLimits,
  registerApiRateLimits
} = require('../src/core/http/api-rate-limits');

test('configura tres políticas acotadas y modo observe por defecto', () => {
  const suite = createApiRateLimits({ env: {} });
  assert.deepEqual(suite.config, {
    mode: 'observe',
    windowMs: 60000,
    catalogLimit: 120,
    searchLimit: 60,
    mapsLimit: 20,
    ipv6Subnet: 56
  });

  const bounded = createApiRateLimits({
    env: {
      RATE_LIMIT_MODE: 'ENFORCE',
      RATE_LIMIT_CATALOG_PER_MINUTE: '500',
      RATE_LIMIT_SEARCH_PER_MINUTE: '0',
      RATE_LIMIT_MAPS_PER_MINUTE: '999999',
      RATE_LIMIT_IPV6_SUBNET: '64'
    }
  });
  assert.deepEqual(bounded.config, {
    mode: 'enforce',
    windowMs: 60000,
    catalogLimit: 500,
    searchLimit: 60,
    mapsLimit: 20,
    ipv6Subnet: 64
  });
  assert.throws(
    () => createApiRateLimits({ env: { RATE_LIMIT_MODE: 'enfroce' } }),
    /RATE_LIMIT_MODE/
  );
});

test('solo confía CF-Connecting-IP válido dentro de producción Render y agrupa IPv6', () => {
  const captured = [];
  const fakeRateLimit = (options) => {
    captured.push(options);
    return (_req, _res, next) => next();
  };
  createApiRateLimits({
    env: { NODE_ENV: 'production', RENDER: 'true' },
    rateLimitFactory: fakeRateLimit,
    ipKeyGeneratorFn: (ip, subnet) => `${ip}/${subnet}`
  });

  const keyGenerator = captured[0].keyGenerator;
  assert.equal(keyGenerator({
    headers: { 'cf-connecting-ip': '2001:db8::1234', 'x-forwarded-for': '1.2.3.4' },
    ip: '::ffff:10.0.0.2',
    socket: { remoteAddress: '::ffff:10.0.0.2' }
  }), '2001:db8::1234/56');

  assert.equal(keyGenerator({
    headers: { 'cf-connecting-ip': 'spoofed,1.2.3.4' },
    ip: '::ffff:10.0.0.2',
    socket: { remoteAddress: '::ffff:10.0.0.2' }
  }), '::ffff:10.0.0.2/56');

  const localCaptured = [];
  createApiRateLimits({
    env: { NODE_ENV: 'development', RENDER: 'true' },
    rateLimitFactory: (options) => {
      localCaptured.push(options);
      return (_req, _res, next) => next();
    },
    ipKeyGeneratorFn: (ip) => ip
  });
  assert.equal(localCaptured[0].keyGenerator({
    headers: { 'cf-connecting-ip': '8.8.8.8' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' }
  }), '127.0.0.1');

  const actualCaptured = [];
  createApiRateLimits({
    env: { NODE_ENV: 'production', RENDER: 'true' },
    rateLimitFactory: (options) => {
      actualCaptured.push(options);
      return (_req, _res, next) => next();
    }
  });
  const actualKey = actualCaptured[0].keyGenerator;
  const firstSubnet = actualKey({ headers: { 'cf-connecting-ip': '2001:db8:1:1201::1' } });
  const sameSubnet = actualKey({ headers: { 'cf-connecting-ip': '2001:db8:1:12ff::2' } });
  const otherSubnet = actualKey({ headers: { 'cf-connecting-ip': '2001:db8:1:1301::1' } });
  assert.equal(firstSubnet, sameSubnet);
  assert.notEqual(firstSubnet, otherSubnet);

  const mappedV4One = actualKey({ headers: { 'cf-connecting-ip': '::ffff:192.0.2.1' } });
  const mappedV4Two = actualKey({ headers: { 'cf-connecting-ip': '::ffff:192.0.2.2' } });
  assert.notEqual(mappedV4One, mappedV4Two, 'IPv4 mapped addresses must not collapse into one IPv6 bucket');
});

test('permite sustituir el almacén por riesgo sin acoplar el middleware a Redis', () => {
  const stores = [];
  const optionsSeen = [];
  createApiRateLimits({
    env: {},
    storeFactory: (risk) => {
      const store = { risk };
      stores.push(store);
      return store;
    },
    rateLimitFactory: (options) => {
      optionsSeen.push(options);
      return (_req, _res, next) => next();
    }
  });

  assert.deepEqual(stores.map(store => store.risk), ['catalog', 'search', 'maps']);
  assert.deepEqual(optionsSeen.map(options => options.store), stores);
  assert.throws(() => createApiRateLimits({ env: {}, storeFactory: {} }), /storeFactory/);
});

test('observe deja pasar y registra una sola vez al cruzar el umbral', async () => {
  const logs = [];
  const { server, url } = await createTestServer({
    RATE_LIMIT_MODE: 'observe',
    RATE_LIMIT_MAPS_PER_MINUTE: '2'
  }, logs);
  try {
    assert.equal((await post(url, '/api/places/autocomplete')).status, 200);
    assert.equal((await post(url, '/api/places/autocomplete')).status, 200);
    const third = await post(url, '/api/places/autocomplete');
    const fourth = await post(url, '/api/places/autocomplete');
    assert.equal(third.status, 200);
    assert.equal(fourth.status, 200);
    assert.equal(third.headers['retry-after'], undefined);
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0], ['rate_limit_threshold_exceeded', 'maps']);
  } finally {
    await close(server);
  }
});

test('enforce responde 429 seguro con Retry-After antes de parsear el cuerpo', async () => {
  const logs = [];
  const { server, url } = await createTestServer({
    RATE_LIMIT_MODE: 'enforce',
    RATE_LIMIT_MAPS_PER_MINUTE: '1'
  }, logs);
  try {
    assert.equal((await post(url, '/api/resolve-maps-link')).status, 200);
    const blocked = await post(url, '/api/resolve-maps-link', '{'.repeat(4096));
    assert.equal(blocked.status, 429);
    assert.match(blocked.headers['retry-after'], /^\d+$/);
    assert.deepEqual(JSON.parse(blocked.body), {
      success: false,
      code: 'RATE_LIMITED',
      error: 'Too many requests. Try again later.'
    });
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0], ['rate_limit_threshold_exceeded', 'maps']);
  } finally {
    await close(server);
  }
});

test('registro aplica cada nivel solo a sus rutas y permite apagarlo', async () => {
  const calls = [];
  const app = express();
  registerApiRateLimits(app, {
    catalog: (_req, _res, next) => { calls.push('catalog'); next(); },
    search: (_req, _res, next) => { calls.push('search'); next(); },
    maps: (_req, _res, next) => { calls.push('maps'); next(); }
  });
  app.use((_req, res) => res.status(204).end());
  const server = app.listen(0, '127.0.0.1');
  await onceListening(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await get(url, '/api/catalog/points');
    await get(url, '/api/catalog/facets');
    await get(url, '/api/catalog/companies');
    await get(url, '/api/catalog/companies/42');
    await post(url, '/api/get-upcoming-routes');
    await post(url, '/api/search-routes-by-municipality');
    await post(url, '/api/search-flights');
    await post(url, '/api/resolve-maps-link');
    await post(url, '/api/places/autocomplete');
    await post(url, '/api/places/resolve');
    await get(url, '/api/health');
    assert.deepEqual(calls, [
      'catalog', 'catalog', 'catalog', 'catalog',
      'search', 'search', 'search',
      'maps', 'maps', 'maps'
    ]);
  } finally {
    await close(server);
  }

  const off = createApiRateLimits({ env: { RATE_LIMIT_MODE: 'off' } });
  assert.equal(off.config.mode, 'off');
});

test('off no bloquea y los presupuestos de maps y search permanecen independientes', async () => {
  const offLogs = [];
  const offServer = await createTestServer({
    RATE_LIMIT_MODE: 'off',
    RATE_LIMIT_MAPS_PER_MINUTE: '1'
  }, offLogs);
  try {
    assert.equal((await post(offServer.url, '/api/places/autocomplete')).status, 200);
    assert.equal((await post(offServer.url, '/api/places/autocomplete')).status, 200);
    assert.equal((await post(offServer.url, '/api/places/autocomplete')).status, 200);
    assert.deepEqual(offLogs, []);
  } finally {
    await close(offServer.server);
  }

  const enforceLogs = [];
  const enforceServer = await createTestServer({
    RATE_LIMIT_MODE: 'enforce',
    RATE_LIMIT_MAPS_PER_MINUTE: '1',
    RATE_LIMIT_SEARCH_PER_MINUTE: '1'
  }, enforceLogs);
  try {
    assert.equal((await post(enforceServer.url, '/api/places/autocomplete')).status, 200);
    assert.equal((await post(enforceServer.url, '/api/places/autocomplete')).status, 429);
    assert.equal((await post(enforceServer.url, '/api/search-flights')).status, 200);
    assert.equal((await post(enforceServer.url, '/api/search-flights')).status, 429);
    assert.deepEqual(enforceLogs, [
      ['rate_limit_threshold_exceeded', 'maps'],
      ['rate_limit_threshold_exceeded', 'search']
    ]);
  } finally {
    await close(enforceServer.server);
  }
});

async function createTestServer(env, logs) {
  const app = express();
  app.use((req, _res, next) => {
    req.log = { warn: (...args) => logs.push(args), error: () => {} };
    next();
  });
  registerApiRateLimits(app, createApiRateLimits({ env }));
  app.use(express.json({ limit: '1kb' }));
  app.post('/api/places/autocomplete', (_req, res) => res.json({ ok: true }));
  app.post('/api/resolve-maps-link', (_req, res) => res.json({ ok: true }));
  app.post('/api/search-flights', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await onceListening(server);
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function onceListening(server) {
  if (server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function get(base, path) {
  return request(base, path, 'GET');
}

function post(base, path, body = '{}') {
  return request(base, path, 'POST', body);
}

function request(base, path, method, body) {
  const target = new URL(path, base);
  return new Promise((resolve, reject) => {
    const req = http.request(target, {
      method,
      headers: body === undefined ? {} : {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
