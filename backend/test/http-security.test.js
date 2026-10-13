'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  apiErrorHandler,
  apiNotFound,
  createCorsOptions,
  createSecurityHeaders,
  validateProductionCors
} = require('../src/core/http/http-security');

test('production CORS fails closed without a valid explicit frontend origin', () => {
  assert.throws(
    () => validateProductionCors({ NODE_ENV: 'production' }),
    /Production CORS origin is required/
  );
  assert.throws(
    () => validateProductionCors({ NODE_ENV: 'production', FRONTEND_URL: '*' }),
    /Production CORS origin is invalid/
  );
  assert.deepEqual(
    validateProductionCors({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://sivoy.example,https://www.sivoy.example'
    }),
    ['https://sivoy.example', 'https://www.sivoy.example']
  );
});

test('development CORS permits loopback and configured origins but denies arbitrary sites', async () => {
  const options = createCorsOptions({
    NODE_ENV: 'development',
    FRONTEND_URL: 'https://preview.sivoy.example'
  });

  assert.equal(await evaluateOrigin(options, undefined), true);
  assert.equal(await evaluateOrigin(options, 'http://127.0.0.1:4303'), true);
  assert.equal(await evaluateOrigin(options, 'http://localhost:4200'), true);
  assert.equal(await evaluateOrigin(options, 'https://preview.sivoy.example'), true);
  assert.equal(await evaluateOrigin(options, 'https://attacker.example'), false);
});

test('security headers use report-only CSP and production-only HSTS', () => {
  const development = captureHeaders(createSecurityHeaders({ NODE_ENV: 'development' }));
  assert.equal(development['x-content-type-options'], 'nosniff');
  assert.equal(development['x-frame-options'], 'DENY');
  assert.equal(development['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(development['content-security-policy-report-only'], /default-src 'self'/);
  assert.match(development['content-security-policy-report-only'], /worker-src 'self' blob:/);
  assert.equal(development['strict-transport-security'], undefined);

  const production = captureHeaders(createSecurityHeaders({ NODE_ENV: 'production' }));
  assert.match(production['strict-transport-security'], /max-age=31536000/);
});

test('API terminal handlers return small generic JSON envelopes', () => {
  const notFound = captureResponse((req, res, next) => apiNotFound(req, res, next));
  assert.equal(notFound.statusCode, 404);
  assert.deepEqual(notFound.body, { error: 'API endpoint not found' });

  const invalidJson = captureResponse((req, res, next) => apiErrorHandler(
    Object.assign(new SyntaxError('secret body'), { type: 'entity.parse.failed' }),
    req,
    res,
    next
  ));
  assert.equal(invalidJson.statusCode, 400);
  assert.deepEqual(invalidJson.body, { error: 'Invalid JSON body' });

  const generic = captureResponse((req, res, next) => apiErrorHandler(
    new Error('database credentials'), req, res, next
  ));
  assert.equal(generic.statusCode, 500);
  assert.deepEqual(generic.body, { error: 'Internal server error' });
});

test('real server applies headers, closed CORS and JSON API errors', async (context) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFrontendUrl = process.env.FRONTEND_URL;
  process.env.NODE_ENV = 'development';
  process.env.FRONTEND_URL = 'https://preview.sivoy.example';
  const { app } = require('../server');
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    server.close();
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('FRONTEND_URL', previousFrontendUrl);
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const missing = await fetch(`${baseUrl}/api/does-not-exist`, {
    headers: { Origin: 'https://attacker.example' }
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'API endpoint not found' });
  assert.equal(missing.headers.get('access-control-allow-origin'), null);
  assert.equal(missing.headers.get('x-powered-by'), null);
  assert.equal(missing.headers.get('x-content-type-options'), 'nosniff');
  assert.match(missing.headers.get('content-security-policy-report-only'), /default-src 'self'/);

  const invalid = await fetch(`${baseUrl}/api/does-not-exist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid'
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'Invalid JSON body' });
});

function evaluateOrigin(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed));
  });
}

function captureHeaders(middleware) {
  const headers = {};
  middleware({}, { setHeader: (name, value) => { headers[name.toLowerCase()] = value; } }, () => {});
  return headers;
}

function captureResponse(invoke) {
  const output = { statusCode: 200, body: null };
  const response = {
    status(code) { output.statusCode = code; return this; },
    json(body) { output.body = body; return this; }
  };
  invoke({ originalUrl: '/api/test' }, response, () => {});
  return output;
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
