'use strict';

const net = require('node:net');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const ONE_MINUTE_MS = 60_000;
const MODES = new Set(['off', 'observe', 'enforce']);
const SAFE_LIBRARY_LOGGER = Object.freeze({
    log: () => {},
    warn: () => {},
    error: () => {}
});
const ROUTES = Object.freeze({
    catalog: Object.freeze(['/api/catalog']),
    search: Object.freeze([
        '/api/get-upcoming-routes',
        '/api/search-routes-by-municipality',
        '/api/search-flights'
    ]),
    maps: Object.freeze([
        '/api/resolve-maps-link',
        '/api/places/autocomplete',
        '/api/places/resolve'
    ])
});

function createApiRateLimits(options = {}) {
    const env = options.env || process.env;
    const rateLimitFactory = options.rateLimitFactory || rateLimit;
    const ipKeyGeneratorFn = options.ipKeyGeneratorFn || ipKeyGenerator;
    const storeFactory = options.storeFactory;
    if (typeof rateLimitFactory !== 'function') throw new TypeError('rateLimitFactory must be a function');
    if (typeof ipKeyGeneratorFn !== 'function') throw new TypeError('ipKeyGeneratorFn must be a function');
    if (storeFactory !== undefined && typeof storeFactory !== 'function') {
        throw new TypeError('storeFactory must be a function');
    }

    const requestedMode = parseMode(env.RATE_LIMIT_MODE);
    const config = Object.freeze({
        mode: requestedMode,
        windowMs: ONE_MINUTE_MS,
        catalogLimit: boundedInteger(env.RATE_LIMIT_CATALOG_PER_MINUTE, 120, 1, 10_000),
        searchLimit: boundedInteger(env.RATE_LIMIT_SEARCH_PER_MINUTE, 60, 1, 10_000),
        mapsLimit: boundedInteger(env.RATE_LIMIT_MAPS_PER_MINUTE, 20, 1, 10_000),
        ipv6Subnet: boundedInteger(env.RATE_LIMIT_IPV6_SUBNET, 56, 32, 64)
    });
    const counters = createCounters();

    const createPolicy = (risk, limit) => {
        if (config.mode === 'off') return (_req, _res, next) => next();

        const store = storeFactory?.(risk);
        const limiterOptions = {
            windowMs: config.windowMs,
            limit,
            identifier: `sivoy-${risk}`,
            standardHeaders: config.mode === 'enforce' ? 'draft-8' : false,
            legacyHeaders: false,
            passOnStoreError: true,
            logger: SAFE_LIBRARY_LOGGER,
            skip: req => req.method === 'OPTIONS',
            keyGenerator: req => {
                const clientIp = getClientIp(req, env);
                return ipKeyGeneratorFn(clientIp, config.ipv6Subnet);
            },
            handler: (req, res, next) => {
                const info = req.rateLimit;
                if (info?.used === info?.limit + 1) {
                    counters.thresholdCrossings[risk] += 1;
                    try {
                        req.log?.warn('rate_limit_threshold_exceeded', risk);
                    } catch {}
                }

                if (config.mode === 'observe') return next();

                counters.blocked[risk] += 1;
                return res.status(429).json({
                    success: false,
                    code: 'RATE_LIMITED',
                    error: 'Too many requests. Try again later.'
                });
            }
        };
        if (store !== undefined) limiterOptions.store = store;
        const limiter = rateLimitFactory(limiterOptions);

        return (req, res, next) => {
            counters.requests[risk] += 1;
            return limiter(req, res, next);
        };
    };

    return Object.freeze({
        config,
        catalog: createPolicy('catalog', config.catalogLimit),
        search: createPolicy('search', config.searchLimit),
        maps: createPolicy('maps', config.mapsLimit),
        getSnapshot: () => snapshotCounters(counters, config.mode)
    });
}

function registerApiRateLimits(app, suite) {
    if (!app || typeof app.use !== 'function') throw new TypeError('app.use must be a function');
    for (const risk of Object.keys(ROUTES)) {
        if (typeof suite?.[risk] !== 'function') throw new TypeError(`${risk} limiter must be a function`);
        app.use(ROUTES[risk], suite[risk]);
    }
}

function getClientIp(req, env) {
    const isProductionRender = String(env.NODE_ENV || '').toLowerCase() === 'production'
        && String(env.RENDER || '').toLowerCase() === 'true';
    const cloudflareIp = req?.headers?.['cf-connecting-ip'];
    if (isProductionRender && typeof cloudflareIp === 'string' && net.isIP(cloudflareIp) !== 0) {
        return cloudflareIp;
    }

    const socketIp = typeof req?.ip === 'string' && net.isIP(req.ip) !== 0
        ? req.ip
        : req?.socket?.remoteAddress;
    return typeof socketIp === 'string' && net.isIP(socketIp) !== 0 ? socketIp : 'unknown';
}

function boundedInteger(value, fallback, minimum, maximum) {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
        ? parsed
        : fallback;
}

function parseMode(value) {
    if (value === undefined || value === null || value === '') return 'observe';
    if (typeof value !== 'string') throw new TypeError('RATE_LIMIT_MODE must be off, observe, or enforce');
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return 'observe';
    if (!MODES.has(normalized)) throw new TypeError('RATE_LIMIT_MODE must be off, observe, or enforce');
    return normalized;
}

function createCounters() {
    return {
        requests: { catalog: 0, search: 0, maps: 0 },
        thresholdCrossings: { catalog: 0, search: 0, maps: 0 },
        blocked: { catalog: 0, search: 0, maps: 0 }
    };
}

function snapshotCounters(counters, mode) {
    const copy = values => Object.freeze({ ...values });
    return Object.freeze({
        mode,
        requests: copy(counters.requests),
        thresholdCrossings: copy(counters.thresholdCrossings),
        blocked: copy(counters.blocked)
    });
}

module.exports = {
    createApiRateLimits,
    registerApiRateLimits
};
