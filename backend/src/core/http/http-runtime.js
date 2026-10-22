'use strict';

const DEFAULT_HTTP_RUNTIME_LIMITS = Object.freeze({
    jsonBodyLimitBytes: 256 * 1024,
    urlencodedBodyLimitBytes: 64 * 1024,
    requestTimeoutMs: 30_000,
    headersTimeoutMs: 10_000,
    keepAliveTimeoutMs: 5_000,
    maxHeadersCount: 100
});

function boundedEnvInteger(value, fallback, minimum, maximum) {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
        ? parsed
        : fallback;
}

function createHttpRuntimeConfig(env = {}) {
    const requestTimeoutMs = boundedEnvInteger(
        env.HTTP_REQUEST_TIMEOUT_MS,
        DEFAULT_HTTP_RUNTIME_LIMITS.requestTimeoutMs,
        5_000,
        120_000
    );
    const configuredHeadersTimeoutMs = boundedEnvInteger(
        env.HTTP_HEADERS_TIMEOUT_MS,
        DEFAULT_HTTP_RUNTIME_LIMITS.headersTimeoutMs,
        2_000,
        60_000
    );

    return Object.freeze({
        jsonBodyLimitBytes: boundedEnvInteger(
            env.HTTP_JSON_LIMIT_BYTES,
            DEFAULT_HTTP_RUNTIME_LIMITS.jsonBodyLimitBytes,
            16 * 1024,
            5 * 1024 * 1024
        ),
        urlencodedBodyLimitBytes: boundedEnvInteger(
            env.HTTP_URLENCODED_LIMIT_BYTES,
            DEFAULT_HTTP_RUNTIME_LIMITS.urlencodedBodyLimitBytes,
            8 * 1024,
            256 * 1024
        ),
        requestTimeoutMs,
        headersTimeoutMs: Math.min(configuredHeadersTimeoutMs, requestTimeoutMs),
        keepAliveTimeoutMs: boundedEnvInteger(
            env.HTTP_KEEP_ALIVE_TIMEOUT_MS,
            DEFAULT_HTTP_RUNTIME_LIMITS.keepAliveTimeoutMs,
            1_000,
            30_000
        ),
        maxHeadersCount: boundedEnvInteger(
            env.HTTP_MAX_HEADERS_COUNT,
            DEFAULT_HTTP_RUNTIME_LIMITS.maxHeadersCount,
            32,
            256
        )
    });
}

function applyHttpServerLimits(server, config) {
    if (!server || typeof server !== 'object') throw new TypeError('HTTP server is invalid');
    if (!config || typeof config !== 'object') throw new TypeError('HTTP runtime config is invalid');

    server.requestTimeout = config.requestTimeoutMs;
    server.headersTimeout = config.headersTimeoutMs;
    server.keepAliveTimeout = config.keepAliveTimeoutMs;
    server.maxHeadersCount = config.maxHeadersCount;
    return server;
}

module.exports = {
    DEFAULT_HTTP_RUNTIME_LIMITS,
    applyHttpServerLimits,
    createHttpRuntimeConfig
};
