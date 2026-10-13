const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_HTTP_RUNTIME_LIMITS,
    applyHttpServerLimits,
    createHttpRuntimeConfig
} = require('../src/core/http/http-runtime');

test('HTTP runtime limits use bounded, frozen defaults', () => {
    const config = createHttpRuntimeConfig({});

    assert.deepEqual(config, DEFAULT_HTTP_RUNTIME_LIMITS);
    assert.equal(Object.isFrozen(config), true);
    assert.deepEqual(config, {
        jsonBodyLimitBytes: 256 * 1024,
        urlencodedBodyLimitBytes: 64 * 1024,
        requestTimeoutMs: 30_000,
        headersTimeoutMs: 10_000,
        keepAliveTimeoutMs: 5_000,
        maxHeadersCount: 100
    });
});

test('HTTP runtime limits accept safe overrides and reject ambiguous or out-of-range values', () => {
    const valid = createHttpRuntimeConfig({
        HTTP_JSON_LIMIT_BYTES: '524288',
        HTTP_URLENCODED_LIMIT_BYTES: '131072',
        HTTP_REQUEST_TIMEOUT_MS: '45000',
        HTTP_HEADERS_TIMEOUT_MS: '15000',
        HTTP_KEEP_ALIVE_TIMEOUT_MS: '7000',
        HTTP_MAX_HEADERS_COUNT: '150'
    });
    assert.deepEqual(valid, {
        jsonBodyLimitBytes: 524288,
        urlencodedBodyLimitBytes: 131072,
        requestTimeoutMs: 45000,
        headersTimeoutMs: 15000,
        keepAliveTimeoutMs: 7000,
        maxHeadersCount: 150
    });

    for (const value of ['0', '-1', '01', '1.5', ' 1000', '1000 ', 'NaN', '', undefined]) {
        const config = createHttpRuntimeConfig({
            HTTP_JSON_LIMIT_BYTES: value,
            HTTP_URLENCODED_LIMIT_BYTES: value,
            HTTP_REQUEST_TIMEOUT_MS: value,
            HTTP_HEADERS_TIMEOUT_MS: value,
            HTTP_KEEP_ALIVE_TIMEOUT_MS: value,
            HTTP_MAX_HEADERS_COUNT: value
        });
        assert.deepEqual(config, DEFAULT_HTTP_RUNTIME_LIMITS);
    }

    assert.deepEqual(createHttpRuntimeConfig({
        HTTP_JSON_LIMIT_BYTES: String(5 * 1024 * 1024 + 1),
        HTTP_URLENCODED_LIMIT_BYTES: String(256 * 1024 + 1),
        HTTP_REQUEST_TIMEOUT_MS: '120001',
        HTTP_HEADERS_TIMEOUT_MS: '60001',
        HTTP_KEEP_ALIVE_TIMEOUT_MS: '30001',
        HTTP_MAX_HEADERS_COUNT: '257'
    }), DEFAULT_HTTP_RUNTIME_LIMITS);

    assert.equal(createHttpRuntimeConfig({
        HTTP_JSON_LIMIT_BYTES: String(5 * 1024 * 1024)
    }).jsonBodyLimitBytes, 5 * 1024 * 1024);
});

test('headers timeout never exceeds the total request timeout', () => {
    const config = createHttpRuntimeConfig({
        HTTP_REQUEST_TIMEOUT_MS: '5000',
        HTTP_HEADERS_TIMEOUT_MS: '60000'
    });

    assert.equal(config.requestTimeoutMs, 5000);
    assert.equal(config.headersTimeoutMs, 5000);
});

test('applies the complete timeout policy to a Node HTTP server', () => {
    const server = {};
    const config = createHttpRuntimeConfig({});

    assert.strictEqual(applyHttpServerLimits(server, config), server);
    assert.equal(server.requestTimeout, 30_000);
    assert.equal(server.headersTimeout, 10_000);
    assert.equal(server.keepAliveTimeout, 5_000);
    assert.equal(server.maxHeadersCount, 100);
    assert.throws(() => applyHttpServerLimits(null, config), TypeError);
});
