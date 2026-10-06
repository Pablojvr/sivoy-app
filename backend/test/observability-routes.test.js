const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const { registerObservabilityRoutes } = require('../src/core/observability/observability-routes');

function makeRequest(app, path, headers = {}) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, () => {
            const port = server.address().port;
            const options = {
                hostname: 'localhost',
                port,
                path,
                method: 'GET',
                headers
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    server.close(() => {
                        let body;
                        try { body = JSON.parse(data); } catch { body = data; }
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body
                        });
                    });
                });
            });
            req.on('error', (err) => {
                server.close(() => reject(err));
            });
            req.end();
        });
    });
}

test('Observability Routes', async (t) => {
    const dummyObservability = {
        getSnapshot: () => ({ mock: 'data' })
    };

    await t.test('GET /api/health - returns exact body { status: "ok" } and no sensitive keys', async () => {
        const app = express();
        registerObservabilityRoutes(app, dummyObservability, {});

        const res = await makeRequest(app, '/api/health');
        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(res.body, { status: 'ok' });
        assert.strictEqual(Object.keys(res.body).length, 1);
    });

    await t.test('GET /api/metrics - absent without token configuration', async () => {
        const app = express();
        registerObservabilityRoutes(app, dummyObservability, { METRICS_TOKEN: '' });

        const res = await makeRequest(app, '/api/metrics');
        assert.strictEqual(res.statusCode, 404);
    });

    await t.test('GET /api/metrics - returns 404 on missing token', async () => {
        const app = express();
        registerObservabilityRoutes(app, dummyObservability, { METRICS_TOKEN: 'secret123' });

        const res = await makeRequest(app, '/api/metrics');
        assert.strictEqual(res.statusCode, 404);
    });

    await t.test('GET /api/metrics - returns 404 on wrong token', async () => {
        const app = express();
        registerObservabilityRoutes(app, dummyObservability, { METRICS_TOKEN: 'secret123' });

        const res = await makeRequest(app, '/api/metrics', { 'Authorization': 'Bearer wrongtoken' });
        assert.strictEqual(res.statusCode, 404);
    });

    await t.test('GET /api/metrics - returns snapshot and no-store on correct token', async () => {
        const app = express();
        registerObservabilityRoutes(app, dummyObservability, { METRICS_TOKEN: 'secret123' });

        const res = await makeRequest(app, '/api/metrics', { 'Authorization': 'Bearer secret123' });
        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(res.body, { mock: 'data' });
        assert.strictEqual(res.headers['cache-control'], 'no-store');
    });

    await t.test('Operational endpoints not counted by observability middleware', async () => {
        const { createHttpObservability } = require('../src/core/observability/http-observability');

        const app = express();
        const observability = createHttpObservability({ sink: { info: () => {}, error: () => {} } });

        registerObservabilityRoutes(app, observability, { METRICS_TOKEN: 'secret123' });
        app.use('/api', observability.middleware);
        app.get('/api/business', (req, res) => res.json({ b: 1 }));

        await makeRequest(app, '/api/health');
        await makeRequest(app, '/api/metrics', { 'Authorization': 'Bearer secret123' });
        await makeRequest(app, '/api/business');

        const snap = observability.getSnapshot();
        const keys = Object.keys(snap);

        assert.strictEqual(keys.length, 1);
        assert.ok(keys[0].includes('business'));
        assert.ok(!keys.some(k => k.includes('health') || k.includes('metrics')));
    });

    await t.test('GET /api/metrics - uses process.env.METRICS_TOKEN if absent in options', async () => {
        const original = process.env.METRICS_TOKEN;
        process.env.METRICS_TOKEN = 'envsecret';
        try {
            const app = express();
            registerObservabilityRoutes(app, dummyObservability, {});

            const res = await makeRequest(app, '/api/metrics', { 'Authorization': 'Bearer envsecret' });
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.body, { mock: 'data' });
        } finally {
            if (original === undefined) delete process.env.METRICS_TOKEN;
            else process.env.METRICS_TOKEN = original;
        }
    });

    await t.test('GET /api/metrics - explicit empty option disables metrics even if process.env.METRICS_TOKEN is set', async () => {
        const original = process.env.METRICS_TOKEN;
        process.env.METRICS_TOKEN = 'envsecret';
        try {
            const app = express();
            registerObservabilityRoutes(app, dummyObservability, { METRICS_TOKEN: '' });

            const res = await makeRequest(app, '/api/metrics', { 'Authorization': 'Bearer envsecret' });
            // Since it's disabled, the route isn't registered, so returns 404
            assert.strictEqual(res.statusCode, 404);
        } finally {
            if (original === undefined) delete process.env.METRICS_TOKEN;
            else process.env.METRICS_TOKEN = original;
        }
    });

    await t.test('GET /api/metrics - explicit null option disables metrics even if process.env.METRICS_TOKEN is set', async () => {
        const original = process.env.METRICS_TOKEN;
        process.env.METRICS_TOKEN = 'envsecret';
        try {
            const app = express();
            registerObservabilityRoutes(app, dummyObservability, { METRICS_TOKEN: null });

            const res = await makeRequest(app, '/api/metrics', { 'Authorization': 'Bearer envsecret' });
            assert.strictEqual(res.statusCode, 404);
        } finally {
            if (original === undefined) delete process.env.METRICS_TOKEN;
            else process.env.METRICS_TOKEN = original;
        }
    });

    await t.test('GET /api/metrics - explicit mock request with non-string auth header returns 404', async () => {
        const app = express();
        // inject middleware to force authorization to be an array
        app.use((req, res, next) => {
            req.headers.authorization = ['Bearer secret123'];
            next();
        });
        registerObservabilityRoutes(app, dummyObservability, { METRICS_TOKEN: 'secret123' });

        const res = await makeRequest(app, '/api/metrics');
        assert.strictEqual(res.statusCode, 404);
    });
});
