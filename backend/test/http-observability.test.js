const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const express = require('express');
const http = require('http');
const { createHttpObservability } = require('../src/core/observability/http-observability');

test('HTTP Observability Middleware', async (t) => {

    function createFakeReqRes(options = {}) {
        const req = {
            headers: options.headers || {},
            method: options.method || 'GET',
            baseUrl: options.baseUrl || '',
            route: options.route || null
        };
        const resHeaders = {};
        const res = new EventEmitter();
        res.statusCode = options.statusCode || 200;
        res.setHeader = (k, v) => { resHeaders[k] = v; };
        res.getHeaders = () => resHeaders;
        return { req, res };
    }

    await t.test('accepts valid x-request-id and echoes it (version 1-8, variant 89ab)', () => {
        const sink = { info: () => {}, error: () => {} };
        const { middleware } = createHttpObservability({ sink });

        const validUuid = '123e4567-e89b-82d3-a456-426614174000'; // v8, variant a
        const { req, res } = createFakeReqRes({ headers: { 'x-request-id': validUuid } });

        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });

        assert.ok(nextCalled);
        assert.strictEqual(res.getHeaders()['x-request-id'], validUuid);
        assert.strictEqual(req.log, undefined);
    });

    await t.test('generates new UUID for malformed/invalid/header arrays', () => {
        const sink = { info: () => {}, error: () => {} };
        const { middleware } = createHttpObservability({ sink });

        const cases = [
            'invalid-id',
            '123e4567-e89b-92d3-a456-426614174000', // v9 (invalid version)
            '123e4567-e89b-12d3-c456-426614174000', // variant c (invalid variant)
            ['123e4567-e89b-12d3-a456-426614174000', 'another']
        ];

        for (const c of cases) {
            const { req, res } = createFakeReqRes({ headers: { 'x-request-id': c } });
            middleware(req, res, () => {});

            const generatedId = res.getHeaders()['x-request-id'];
            assert.ok(generatedId);
            assert.notStrictEqual(generatedId, typeof c === 'string' ? c : c[0]);
            assert.match(generatedId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        }
    });

    await t.test('uses injected options with safe fallbacks', () => {
        const badInjections = {
            generateId: () => 'not-a-uuid',
            nowMs: () => 'not-a-number',
            nowIso: () => 123
        };
        const { middleware } = createHttpObservability({
            sink: { info: () => {}, error: () => {} },
            ...badInjections
        });

        const { req, res } = createFakeReqRes();
        middleware(req, res, () => {});
        res.emit('finish');

        const id = res.getHeaders()['x-request-id'];
        assert.ok(id);
        assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        assert.notStrictEqual(id, 'not-a-uuid');
    });

    await t.test('logs correct JSON fields on 2xx finish, normalized method, cumulative histogram', () => {
        let loggedString = null;
        const sink = {
            info: (msg) => { loggedString = msg; },
            error: () => {}
        };
        let time = 1000;
        const { middleware, getSnapshot } = createHttpObservability({
            sink,
            nowMs: () => {
                const t = time;
                time += 150; // duration will be 150ms
                return t;
            }
        });

        const { req, res } = createFakeReqRes({
            method: 'FOO', // Should map to OTHER
            baseUrl: '/api',
            route: { path: '/test/:id' },
            statusCode: 201
        });

        middleware(req, res, () => {});
        res.emit('finish');

        assert.ok(loggedString);
        const logObj = JSON.parse(loggedString);

        assert.strictEqual(logObj.level, 'info');
        assert.strictEqual(logObj.event, 'http_request_completed');
        assert.strictEqual(logObj.method, 'OTHER'); // normalized
        assert.strictEqual(logObj.route, '/api/test/:id');
        assert.strictEqual(logObj.statusClass, '2xx');
        assert.strictEqual(logObj.durationMs, 150);
        assert.ok(logObj.timestamp);
        assert.ok(logObj.requestId);

        // Absence of sensitive fields
        assert.strictEqual(logObj.body, undefined);
        assert.strictEqual(logObj.query, undefined);
        assert.strictEqual(logObj.headers, undefined);
        assert.strictEqual(logObj.ip, undefined);

        const snap = getSnapshot();
        const metrics = snap['OTHER|/api/test/:id|2xx'];
        assert.strictEqual(metrics.total, 1);

        // Cumulative check for 150ms
        // Buckets: 10, 50, 100, 500, 1000, 5000, +inf
        assert.strictEqual(metrics.histogram['10'], 0);
        assert.strictEqual(metrics.histogram['50'], 0);
        assert.strictEqual(metrics.histogram['100'], 0);
        assert.strictEqual(metrics.histogram['500'], 1);
        assert.strictEqual(metrics.histogram['1000'], 1);
        assert.strictEqual(metrics.histogram['5000'], 1);
        assert.strictEqual(metrics.histogram['+inf'], 1);
    });

    await t.test('logs error level for 5xx and bounds route if missing', () => {
        let loggedError = null;
        const sink = {
            info: () => {},
            error: (msg) => { loggedError = msg; }
        };
        const { middleware } = createHttpObservability({ sink });

        const { req, res } = createFakeReqRes({
            method: 'GET',
            statusCode: 500
        });

        middleware(req, res, () => {});
        res.emit('finish');

        assert.ok(loggedError);
        const logObj = JSON.parse(loggedError);
        assert.strictEqual(logObj.level, 'error');
        assert.strictEqual(logObj.statusClass, '5xx');
        assert.strictEqual(logObj.route, 'unmatched');
    });

    await t.test('registers exactly one finish listener (res.once)', () => {
        const { middleware } = createHttpObservability({ sink: { info: () => {}, error: () => {} } });
        const { req, res } = createFakeReqRes();

        middleware(req, res, () => {});
        assert.strictEqual(res.listenerCount('finish'), 1);
    });

    await t.test('detached snapshot is immutable relative to internal state', () => {
        const { middleware, getSnapshot } = createHttpObservability({ sink: { info: () => {}, error: () => {} } });

        const { req, res } = createFakeReqRes();
        middleware(req, res, () => {});
        res.emit('finish');

        const snapshot1 = getSnapshot();
        assert.strictEqual(snapshot1['GET|unmatched|2xx'].total, 1);

        snapshot1['GET|unmatched|2xx'].total = 999;

        const snapshot2 = getSnapshot();
        assert.strictEqual(snapshot2['GET|unmatched|2xx'].total, 1);
    });

    await t.test('sink failure does not break HTTP response', () => {
        const sink = {
            info: () => { throw new Error('sink failed'); },
            error: () => {}
        };
        const { middleware } = createHttpObservability({ sink });

        const { req, res } = createFakeReqRes();
        middleware(req, res, () => {});

        assert.doesNotThrow(() => {
            res.emit('finish');
        });
    });

    await t.test('real Express+HTTP test mounted on /api', (t, done) => {
        let loggedLine = null;
        const sink = {
            info: (msg) => { loggedLine = msg; },
            error: () => {}
        };
        const { middleware } = createHttpObservability({ sink });

        const app = express();
        // Integration exactly as specified: app.use('/api', observabilityMiddleware)
        app.use('/api', middleware);

        app.get('/api/empresas/:id', (req, res) => {
            res.status(200).json({ ok: true });
        });

        const server = app.listen(0, () => {
            const port = server.address().port;
            const req = http.get(`http://localhost:${port}/api/empresas/123`, (res) => {
                res.on('data', () => {});
                res.on('end', () => {
                    server.close(() => {
                        assert.ok(loggedLine);
                        const logObj = JSON.parse(loggedLine);
                        assert.strictEqual(logObj.route, '/api/empresas/:id');
                        assert.notStrictEqual(logObj.route, '/api/empresas/123');
                        done();
                    });
                });
            });
            req.on('error', done);
        });
    });

    await t.test('validates nowMs against NaN and Infinity and backwards clock', () => {
        let loggedString = null;
        const sink = { info: (msg) => { loggedString = msg; }, error: () => {} };

        let calls = 0;
        const badClock = () => {
            calls++;
            if (calls === 1) return NaN;
            if (calls === 2) return Infinity;
            return 0;
        };

        const { middleware } = createHttpObservability({ sink, nowMs: badClock });
        const { req, res } = createFakeReqRes();
        middleware(req, res, () => {});
        res.emit('finish');

        const logObj = JSON.parse(loggedString);
        assert.ok(Number.isFinite(logObj.durationMs));
        assert.ok(logObj.durationMs >= 0);

        // Backwards clock
        let bwCalls = 0;
        let bwLogged = null;
        const bwSink = { info: (msg) => { bwLogged = msg; }, error: () => {} };
        const bwClock = () => {
            bwCalls++;
            if (bwCalls === 1) return 1000;
            return 500; // time went backwards
        };

        const obs2 = createHttpObservability({ sink: bwSink, nowMs: bwClock });
        const reqRes2 = createFakeReqRes();
        obs2.middleware(reqRes2.req, reqRes2.res, () => {});
        reqRes2.res.emit('finish');

        const bwObj = JSON.parse(bwLogged);
        assert.strictEqual(bwObj.durationMs, 0); // Should clamp to 0
    });

    await t.test('validates nowIso as canonical ISO instant', () => {
        let loggedString = null;
        const sink = { info: (msg) => { loggedString = msg; }, error: () => {} };
        const { middleware } = createHttpObservability({
            sink,
            nowIso: () => '2023-01-01 12:00:00' // Invalid format (missing T and Z)
        });

        const { req, res } = createFakeReqRes();
        middleware(req, res, () => {});
        res.emit('finish');

        const logObj = JSON.parse(loggedString);
        assert.strictEqual(logObj.timestamp, new Date(logObj.timestamp).toISOString());
        assert.notStrictEqual(logObj.timestamp, '2023-01-01 12:00:00');
    });

    await t.test('snapshot is deeply frozen and resetMetrics clears state', () => {
        'use strict';
        const { middleware, getSnapshot, resetMetrics } = createHttpObservability({
            sink: { info: () => {}, error: () => {} }
        });

        const { req, res } = createFakeReqRes();
        middleware(req, res, () => {});
        res.emit('finish');

        const snapshot = getSnapshot();
        assert.ok(Object.isFrozen(snapshot));

        const metric = snapshot['GET|unmatched|2xx'];
        assert.ok(Object.isFrozen(metric));
        assert.ok(Object.isFrozen(metric.histogram));

        assert.throws(() => { snapshot['new'] = 1; });
        assert.throws(() => { metric.total = 999; });
        assert.throws(() => { metric.histogram['10'] = 999; });

        resetMetrics();
        const emptySnapshot = getSnapshot();
        assert.strictEqual(Object.keys(emptySnapshot).length, 0);
    });

});
