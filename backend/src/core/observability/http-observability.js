const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

// RFC4122 UUID regex version [1-8], variant [89ab]
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(uuid) {
    return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}

const HISTOGRAM_BUCKETS = [10, 50, 100, 500, 1000, 5000];

const defaultSink = {
    info: (msg) => {
        try { process.stdout.write(msg + '\n'); } catch (e) {}
    },
    error: (msg) => {
        try { process.stderr.write(msg + '\n'); } catch (e) {}
    }
};

function safeUUID(fn) {
    try {
        const result = fn();
        if (isValidUUID(result)) return result;
    } catch {}
    return crypto.randomUUID();
}

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

function createHttpObservability(options = {}) {
    const sink = options.sink || defaultSink;

    const generateId = typeof options.generateId === 'function' ? options.generateId : crypto.randomUUID;
    const nowMs = typeof options.nowMs === 'function' ? options.nowMs : performance.now;
    const nowIso = typeof options.nowIso === 'function' ? options.nowIso : () => new Date().toISOString();

    let metrics = Object.create(null);

    function resetMetrics() {
        metrics = Object.create(null);
    }

    function getSnapshot() {
        const snap = Object.create(null);
        for (const [key, metric] of Object.entries(metrics)) {
            snap[key] = Object.freeze({
                total: metric.total,
                errors: metric.errors,
                histogram: Object.freeze({ ...metric.histogram })
            });
        }
        return Object.freeze(snap);
    }

    const middleware = (req, res, next) => {
        let requestId = req.headers['x-request-id'];

        if (!isValidUUID(requestId)) {
            requestId = safeUUID(generateId);
        }
        res.setHeader('x-request-id', requestId);

        let startTime = 0;
        try {
            const val = nowMs();
            startTime = (typeof val === 'number' && Number.isFinite(val)) ? val : performance.now();
        } catch {
            startTime = performance.now();
        }

        const finalize = () => {
            let endTime = 0;
            try {
                const val = nowMs();
                endTime = (typeof val === 'number' && Number.isFinite(val)) ? val : performance.now();
            } catch {
                endTime = performance.now();
            }
            const durationMs = Math.max(0, endTime - startTime);

            let statusClass = '1xx';
            if (res.statusCode >= 500) statusClass = '5xx';
            else if (res.statusCode >= 400) statusClass = '4xx';
            else if (res.statusCode >= 300) statusClass = '3xx';
            else if (res.statusCode >= 200) statusClass = '2xx';

            // Route label must avoid cardinality: use resolved Express route template when available; otherwise 'unmatched'.
            // Rule: req.baseUrl + req.route.path (e.g. /api/empresas/:id)
            let routeLabel = 'unmatched';
            if (req.route && req.route.path) {
                routeLabel = (req.baseUrl || '') + req.route.path;
            }

            const isError = res.statusCode >= 500;
            const level = isError ? 'error' : 'info';

            const method = ALLOWED_METHODS.includes(req.method) ? req.method : 'OTHER';

            let timestamp;
            try {
                const val = nowIso();
                if (typeof val === 'string' && val === new Date(val).toISOString()) {
                    timestamp = val;
                } else {
                    timestamp = new Date().toISOString();
                }
            } catch {
                timestamp = new Date().toISOString();
            }

            const logPayload = {
                timestamp,
                level,
                event: 'http_request_completed',
                requestId,
                method,
                route: routeLabel,
                statusClass,
                durationMs
            };

            const logString = JSON.stringify(logPayload);
            try {
                if (level === 'error') {
                    sink.error(logString);
                } else {
                    sink.info(logString);
                }
            } catch (e) {
                // sink failure must not break HTTP response
            }

            const metricKey = `${method}|${routeLabel}|${statusClass}`;
            if (!metrics[metricKey]) {
                const histogram = Object.create(null);
                HISTOGRAM_BUCKETS.forEach(b => histogram[b] = 0);
                histogram['+inf'] = 0;
                metrics[metricKey] = {
                    total: 0,
                    errors: 0,
                    histogram
                };
            }

            metrics[metricKey].total += 1;
            if (isError) {
                metrics[metricKey].errors += 1;
            }

            for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
                if (HISTOGRAM_BUCKETS[i] >= durationMs) {
                    metrics[metricKey].histogram[HISTOGRAM_BUCKETS[i]] += 1;
                }
            }
            metrics[metricKey].histogram['+inf'] += 1;
        };

        res.once('finish', finalize);

        next();
    };

    return { middleware, getSnapshot, resetMetrics };
}

module.exports = { createHttpObservability };
