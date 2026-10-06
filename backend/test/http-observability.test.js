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
        assert.strictEqual(typeof req.log.error, 'function');
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

    await t.test('req.log.error and req.log.warn attach to request, log structured data, normalize bad inputs, survive sink failure', () => {
        let loggedString = null;
        const sink = {
            info: (msg) => { loggedString = msg; },
            warn: (msg) => { loggedString = msg; },
            error: (msg) => { loggedString = msg; }
        };
        const { middleware } = createHttpObservability({ sink });

        const { req, res } = createFakeReqRes({
            method: 'POST',
            baseUrl: '/api',
            route: { path: '/test' }
        });

        middleware(req, res, () => {});

        assert.ok(req.log);
        assert.ok(Object.isFrozen(req.log));
        assert.deepStrictEqual(Object.keys(req.log).sort(), ['error', 'warn']);

        // Test normal inputs for error
        req.log.error('test_event', 'internal_error');
        assert.ok(loggedString);
        let logObj = JSON.parse(loggedString);
        assert.strictEqual(logObj.level, 'error');
        assert.strictEqual(logObj.event, 'test_event');
        assert.strictEqual(logObj.errorCode, 'internal_error');
        assert.strictEqual(logObj.method, 'POST');
        assert.strictEqual(logObj.route, '/api/test');
        assert.ok(logObj.requestId);
        assert.ok(logObj.timestamp);
        assert.deepStrictEqual(Object.keys(logObj).sort(), ['errorCode', 'event', 'level', 'method', 'requestId', 'route', 'timestamp']);

        // Test normal inputs for warn
        loggedString = null;
        req.log.warn('warn_event', 'validation_error');
        assert.ok(loggedString);
        logObj = JSON.parse(loggedString);
        assert.strictEqual(logObj.level, 'warn');
        assert.strictEqual(logObj.event, 'warn_event');
        assert.strictEqual(logObj.errorCode, 'validation_error');
        assert.deepStrictEqual(Object.keys(logObj).sort(), ['errorCode', 'event', 'level', 'method', 'requestId', 'route', 'timestamp']);

        // Test malicious inputs
        loggedString = null;
        req.log.error({ foo: 'bar' }, 'ATTACK<script>');
        logObj = JSON.parse(loggedString);
        assert.strictEqual(logObj.event, 'unknown_event');
        assert.strictEqual(logObj.errorCode, 'unknown_code');
        assert.ok(!JSON.stringify(logObj).includes('ATTACK<script>'));

        // Sink failure
        const badSink = {
            info: () => { throw new Error('sink boom info'); },
            warn: () => { throw new Error('sink boom warn'); },
            error: () => { throw new Error('sink boom error'); }
        };
        const obs2 = createHttpObservability({ sink: badSink });
        const reqRes2 = createFakeReqRes();
        obs2.middleware(reqRes2.req, reqRes2.res, () => {});
        assert.doesNotThrow(() => {
            reqRes2.req.log.error('event', 'code');
        });
        assert.doesNotThrow(() => {
            reqRes2.req.log.warn('event', 'code');
        });

        // Warn fallback to info when warn is missing
        let infoCalled = false;
        const fallbackSink = {
            info: () => { infoCalled = true; },
            error: () => {}
        };
        const obs3 = createHttpObservability({ sink: fallbackSink });
        const reqRes3 = createFakeReqRes();
        obs3.middleware(reqRes3.req, reqRes3.res, () => {});
        reqRes3.req.log.warn('event', 'code');
        assert.strictEqual(infoCalled, true);
    });

    await t.test('rutas.controller.js error logging', async (st) => {
        const rutasController = require('../src/domains/rutas/rutas.controller');
        const rutasService = require('../src/domains/rutas/rutas.service');
        const { ValidationError } = require('../src/domains/rutas/rutas.validation');

        // safe mocking console.error
        let consoleErrors = 0;
        const origConsoleError = console.error;
        console.error = () => { consoleErrors++; };

        const origGetUpcomingRoutes = rutasService.getUpcomingRoutes;
        const origSearchRoutesByMunicipality = rutasService.searchRoutesByMunicipality;
        const origSearchFlights = rutasService.searchFlights;

        st.after(() => {
            console.error = origConsoleError;
            rutasService.getUpcomingRoutes = origGetUpcomingRoutes;
            rutasService.searchRoutesByMunicipality = origSearchRoutesByMunicipality;
            rutasService.searchFlights = origSearchFlights;
        });

        const reqMock = () => {
            let logData = null;
            return {
                body: {},
                log: {
                    error: (ev, code) => { logData = { ev, code, level: 'error' }; },
                    warn: (ev, code) => { logData = { ev, code, level: 'warn' }; }
                },
                getLogData: () => logData
            };
        };
        const resMock = () => {
            let status = 200;
            let body = null;
            return {
                status: function (s) { status = s; return this; },
                json: function (b) { body = b; },
                getStatus: () => status,
                getBody: () => body
            };
        };

        await st.test('getUpcomingRoutes - validation error', async () => {
            rutasService.getUpcomingRoutes = async () => { throw new ValidationError("Length out of bounds for origen"); };
            const req = reqMock();
            const res = resMock();
            await rutasController.getUpcomingRoutes(req, res);
            assert.strictEqual(res.getStatus(), 400);
            assert.deepStrictEqual(res.getBody(), { error: 'Length out of bounds for origen' });
            assert.strictEqual(req.getLogData().ev, 'get_upcoming_routes_failed');
            assert.strictEqual(req.getLogData().code, 'validation_error');
            assert.strictEqual(req.getLogData().level, 'warn');
        });

        await st.test('getUpcomingRoutes - internal error', async () => {
            rutasService.getUpcomingRoutes = async () => { throw new Error("Missing but internal SQL detail"); };
            const req = reqMock();
            const res = resMock();
            await rutasController.getUpcomingRoutes(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { error: 'Database error' });
            assert.strictEqual(req.getLogData().ev, 'get_upcoming_routes_failed');
            assert.strictEqual(req.getLogData().code, 'internal_error');
            assert.strictEqual(req.getLogData().level, 'error');
        });

        await st.test('searchRoutesByMunicipality - validation error', async () => {
            rutasService.searchRoutesByMunicipality = async () => { throw new ValidationError("Length out of bounds for origen"); };
            const req = reqMock();
            const res = resMock();
            await rutasController.searchRoutesByMunicipality(req, res);
            assert.strictEqual(res.getStatus(), 400);
            assert.deepStrictEqual(res.getBody(), { error: 'Length out of bounds for origen' });
            assert.strictEqual(req.getLogData().ev, 'search_by_municipality_failed');
            assert.strictEqual(req.getLogData().code, 'validation_error');
            assert.strictEqual(req.getLogData().level, 'warn');
        });

        await st.test('searchRoutesByMunicipality - origin not found', async () => {
            rutasService.searchRoutesByMunicipality = async () => { throw new Error("Origen no encontrado"); };
            const req = reqMock();
            const res = resMock();
            await rutasController.searchRoutesByMunicipality(req, res);
            assert.strictEqual(res.getStatus(), 404);
            assert.strictEqual(req.getLogData().ev, 'search_by_municipality_failed');
            assert.strictEqual(req.getLogData().code, 'origin_not_found');
            assert.strictEqual(req.getLogData().level, 'warn');
        });

        await st.test('searchRoutesByMunicipality - internal error', async () => {
            rutasService.searchRoutesByMunicipality = async () => { throw new Error("Missing internal route data"); };
            const req = reqMock();
            const res = resMock();
            await rutasController.searchRoutesByMunicipality(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { error: 'Database error' });
            assert.strictEqual(req.getLogData().ev, 'search_by_municipality_failed');
            assert.strictEqual(req.getLogData().code, 'internal_error');
            assert.strictEqual(req.getLogData().level, 'error');
        });

        await st.test('searchFlights - validation error', async () => {
            rutasService.searchFlights = async () => { throw new ValidationError("Length out of bounds for origen_municipio"); };
            const req = reqMock();
            const res = resMock();
            await rutasController.searchFlights(req, res);
            assert.strictEqual(res.getStatus(), 400);
            assert.deepStrictEqual(res.getBody(), { error: 'Length out of bounds for origen_municipio' });
            assert.strictEqual(req.getLogData().ev, 'search_flights_failed');
            assert.strictEqual(req.getLogData().code, 'validation_error');
            assert.strictEqual(req.getLogData().level, 'warn');
        });

        await st.test('searchFlights - internal error', async () => {
            rutasService.searchFlights = async () => { throw new Error("Missing internal flight data"); };
            const req = reqMock();
            const res = resMock();
            await rutasController.searchFlights(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { error: 'Database error in search-flights' });
            assert.strictEqual(req.getLogData().ev, 'search_flights_failed');
            assert.strictEqual(req.getLogData().code, 'internal_error');
            assert.strictEqual(req.getLogData().level, 'error');
        });

        await st.test('assert zero console.error calls', () => {
            assert.strictEqual(consoleErrors, 0);
        });
    });

    await t.test('ubicaciones.controller.js error logging', async (st) => {
        const ubicacionesController = require('../src/domains/ubicaciones/ubicaciones.controller');
        const ubicacionesService = require('../src/domains/ubicaciones/ubicaciones.service');

        let consoleErrors = 0;
        const origConsoleError = console.error;
        console.error = () => { consoleErrors++; };

        const origGetAllLocations = ubicacionesService.getAllLocations;
        const origUpdateLocation = ubicacionesService.updateLocation;
        const origCreateAgencia = ubicacionesService.createAgencia;
        const origGetLocationByName = ubicacionesService.getLocationByName;

        st.after(() => {
            console.error = origConsoleError;
            ubicacionesService.getAllLocations = origGetAllLocations;
            ubicacionesService.updateLocation = origUpdateLocation;
            ubicacionesService.createAgencia = origCreateAgencia;
            ubicacionesService.getLocationByName = origGetLocationByName;
        });

        const reqMock = (params = {}, body = {}) => {
            const logs = [];
            return {
                params,
                body,
                log: {
                    error: (...args) => { logs.push({ level: 'error', args }); },
                    warn: (...args) => { logs.push({ level: 'warn', args }); }
                },
                getLogs: () => logs
            };
        };
        const resMock = () => {
            let status = 200;
            let body = null;
            return {
                status: function (s) { status = s; return this; },
                json: function (b) { body = b; },
                getStatus: () => status,
                getBody: () => body
            };
        };

        await st.test('getAllLocations - internal error', async () => {
            ubicacionesService.getAllLocations = async () => { throw new Error("DB Error"); };
            const req = reqMock();
            const res = resMock();
            await ubicacionesController.getAllLocations(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { error: "Database error" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['get_all_locations_failed', 'internal_error']);
        });

        await st.test('updateLocation - not found', async () => {
            ubicacionesService.updateLocation = async () => { throw new Error("Location not found"); };
            const req = reqMock({ id: '123' }, {});
            const res = resMock();
            await ubicacionesController.updateLocation(req, res);
            assert.strictEqual(res.getStatus(), 404);
            assert.deepStrictEqual(res.getBody(), { error: "Location not found" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'warn');
            assert.deepStrictEqual(logs[0].args, ['update_location_failed', 'location_not_found']);
        });

        await st.test('updateLocation - internal error', async () => {
            ubicacionesService.updateLocation = async () => { throw new Error("DB Error"); };
            const req = reqMock({ id: '123' }, {});
            const res = resMock();
            await ubicacionesController.updateLocation(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { error: "Database error" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['update_location_failed', 'internal_error']);
        });

        await st.test('createAgencia - validation error', async () => {
            ubicacionesService.createAgencia = async () => { throw new Error("Missing required fields"); };
            const req = reqMock({}, { name: 'test' });
            const res = resMock();
            await ubicacionesController.createAgencia(req, res);
            assert.strictEqual(res.getStatus(), 400);
            assert.deepStrictEqual(res.getBody(), { error: "Missing required fields" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'warn');
            assert.deepStrictEqual(logs[0].args, ['create_agencia_failed', 'validation_error']);
        });

        await st.test('createAgencia - internal error', async () => {
            ubicacionesService.createAgencia = async () => { throw new Error("DB Error"); };
            const req = reqMock({}, { name: 'test' });
            const res = resMock();
            await ubicacionesController.createAgencia(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { error: "Database error" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['create_agencia_failed', 'internal_error']);
        });

        await st.test('testLocation - internal error (silent catch)', async () => {
            ubicacionesService.getLocationByName = async () => { throw new Error("DB Error"); };
            const req = reqMock();
            const res = resMock();
            await ubicacionesController.testLocation(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { error: "Database error" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['test_location_failed', 'internal_error']);
        });

        await st.test('assert zero console.error calls', () => {
            assert.strictEqual(consoleErrors, 0);
        });
    });

    await t.test('mapas.controller.js error logging', async (st) => {
        const mapasController = require('../src/domains/mapas/mapas.controller');
        const mapasService = require('../src/domains/mapas/mapas.service');

        let consoleErrors = 0;
        const origConsoleError = console.error;
        console.error = () => { consoleErrors++; };

        const origResolveMapsLink = mapasService.resolveMapsLink;
        const origSearchPlaces = mapasService.searchPlaces;
        const origResolvePlace = mapasService.resolvePlace;

        st.after(() => {
            console.error = origConsoleError;
            mapasService.resolveMapsLink = origResolveMapsLink;
            mapasService.searchPlaces = origSearchPlaces;
            mapasService.resolvePlace = origResolvePlace;
        });

        const reqMock = (body = {}) => {
            const logs = [];
            return {
                body,
                log: {
                    error: (...args) => { logs.push({ level: 'error', args }); },
                    warn: (...args) => { logs.push({ level: 'warn', args }); }
                },
                getLogs: () => logs
            };
        };
        const resMock = () => {
            let status = 200;
            let body = null;
            return {
                status: function (s) { status = s; return this; },
                json: function (b) { body = b; },
                getStatus: () => status,
                getBody: () => body
            };
        };

        await st.test('resolveMapsLink - validation error', async () => {
            mapasService.resolveMapsLink = async () => { throw new Error("Missing URL"); };
            const req = reqMock({ url: '' });
            const res = resMock();
            await mapasController.resolveMapsLink(req, res);
            assert.strictEqual(res.getStatus(), 400);
            assert.deepStrictEqual(res.getBody(), { error: "Missing URL" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'warn');
            assert.deepStrictEqual(logs[0].args, ['resolve_maps_link_failed', 'validation_error']);
        });

        await st.test('resolveMapsLink - maps provider error', async () => {
            mapasService.resolveMapsLink = async () => { throw new Error("Network Error"); };
            const req = reqMock({ url: 'https://maps.google.com' });
            const res = resMock();
            await mapasController.resolveMapsLink(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { success: false, error: "Network Error" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['resolve_maps_link_failed', 'maps_provider_error']);
        });

        await st.test('searchPlaces - statusCode 399 (error)', async () => {
            mapasService.searchPlaces = async () => {
                const err = new Error("Provider Error");
                err.statusCode = 399;
                throw err;
            };
            const req = reqMock({ query: 'test' });
            const res = resMock();
            await mapasController.searchPlaces(req, res);
            assert.strictEqual(res.getStatus(), 399);
            assert.deepStrictEqual(res.getBody(), { success: false, code: 'MAPS_ERROR', error: "Provider Error" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['search_places_failed', 'maps_provider_error']);
        });

        await st.test('searchPlaces - string "400" (error)', async () => {
            mapasService.searchPlaces = async () => {
                const err = new Error("Invalid request");
                err.statusCode = "400";
                err.code = 'INVALID_REQUEST';
                throw err;
            };
            const req = reqMock({ query: 'test' });
            const res = resMock();
            await mapasController.searchPlaces(req, res);
            assert.strictEqual(res.getStatus(), "400");
            assert.deepStrictEqual(res.getBody(), { success: false, code: 'INVALID_REQUEST', error: "Invalid request" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['search_places_failed', 'maps_provider_error']);
        });

        await st.test('searchPlaces - statusCode 400 (warn)', async () => {
            mapasService.searchPlaces = async () => {
                const err = new Error("Invalid request");
                err.statusCode = 400;
                err.code = 'INVALID_REQUEST';
                throw err;
            };
            const req = reqMock({ query: 'test' });
            const res = resMock();
            await mapasController.searchPlaces(req, res);
            assert.strictEqual(res.getStatus(), 400);
            assert.deepStrictEqual(res.getBody(), { success: false, code: 'INVALID_REQUEST', error: "Invalid request" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'warn');
            assert.deepStrictEqual(logs[0].args, ['search_places_failed', 'maps_request_rejected']);
        });

        await st.test('searchPlaces - statusCode 404 (warn)', async () => {
            mapasService.searchPlaces = async () => {
                const err = new Error("Not Found");
                err.statusCode = 404;
                throw err;
            };
            const req = reqMock({ query: 'test' });
            const res = resMock();
            await mapasController.searchPlaces(req, res);
            assert.strictEqual(res.getStatus(), 404);
            assert.deepStrictEqual(res.getBody(), { success: false, code: 'MAPS_ERROR', error: "Not Found" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'warn');
            assert.deepStrictEqual(logs[0].args, ['search_places_failed', 'maps_request_rejected']);
        });

        await st.test('resolvePlace - statusCode 500 (error)', async () => {
            mapasService.resolvePlace = async () => {
                const err = new Error("Internal Server Error");
                err.statusCode = 500;
                throw err;
            };
            const req = reqMock({ placeId: 'test' });
            const res = resMock();
            await mapasController.resolvePlace(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { success: false, code: 'MAPS_ERROR', error: "Internal Server Error" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['resolve_place_failed', 'maps_provider_error']);
        });

        await st.test('resolvePlace - statusCode 502 (error)', async () => {
            mapasService.resolvePlace = async () => {
                const err = new Error("Bad Gateway");
                err.statusCode = 502;
                throw err;
            };
            const req = reqMock({ placeId: 'test' });
            const res = resMock();
            await mapasController.resolvePlace(req, res);
            assert.strictEqual(res.getStatus(), 502);
            assert.deepStrictEqual(res.getBody(), { success: false, code: 'MAPS_ERROR', error: "Bad Gateway" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['resolve_place_failed', 'maps_provider_error']);
        });

        await st.test('resolvePlace - maps provider error (default)', async () => {
            mapasService.resolvePlace = async () => { throw new Error("Internal"); };
            const req = reqMock({ placeId: 'test' });
            const res = resMock();
            await mapasController.resolvePlace(req, res);
            assert.strictEqual(res.getStatus(), 500);
            assert.deepStrictEqual(res.getBody(), { success: false, code: 'MAPS_ERROR', error: "Internal" });
            const logs = req.getLogs();
            assert.strictEqual(logs.length, 1);
            assert.strictEqual(logs[0].level, 'error');
            assert.deepStrictEqual(logs[0].args, ['resolve_place_failed', 'maps_provider_error']);
        });

        await st.test('assert zero console.error calls', () => {
            assert.strictEqual(consoleErrors, 0);
        });
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
