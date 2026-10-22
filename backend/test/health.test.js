'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { registerHealthRoute } = require('../src/health');

test('registerHealthRoute exposes the stable public readiness contract', () => {
    let routePath = '';
    let routeHandler;
    const app = {
        get(path, handler) {
            routePath = path;
            routeHandler = handler;
        }
    };

    registerHealthRoute(app);

    let body;
    routeHandler({}, { json(value) { body = value; } });
    assert.equal(routePath, '/api/health');
    assert.deepEqual(body, { status: 'ok' });
});

test('registerHealthRoute rejects an invalid application boundary', () => {
    assert.throws(
        () => registerHealthRoute(null),
        /requires an Express-compatible app/
    );
});
