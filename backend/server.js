require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createHttpObservability } = require('./src/core/observability/http-observability');
const { registerObservabilityRoutes } = require('./src/core/observability/observability-routes');
const { getDB, closeDB } = require('./src/config/database');
const { createProcessLogger } = require('./src/core/observability/process-logger');
const { registerShutdownHandlers } = require('./src/core/lifecycle/shutdown');
const {
    apiErrorHandler,
    apiNotFound,
    createCorsOptions,
    createSecurityHeaders,
    validateProductionCors
} = require('./src/core/http/http-security');
const { applyHttpServerLimits, createHttpRuntimeConfig } = require('./src/core/http/http-runtime');
const { createApiRateLimits, registerApiRateLimits } = require('./src/core/http/api-rate-limits');

const empresasRoutes = require('./src/domains/empresas/empresas.routes');
const ubicacionesRoutes = require('./src/domains/ubicaciones/ubicaciones.routes');
const rutasRoutes = require('./src/domains/rutas/rutas.routes');
const mapasRoutes = require('./src/domains/mapas/mapas.routes');
const catalogRoutes = require('./src/domains/catalog/catalog.routes');

const app = express();
const httpRuntimeConfig = createHttpRuntimeConfig(process.env);
app.disable('x-powered-by');
app.use(createSecurityHeaders(process.env));
app.use(cors(createCorsOptions(process.env)));
const observability = createHttpObservability();
registerObservabilityRoutes(app, observability);
app.use('/api', observability.middleware);
const apiRateLimits = createApiRateLimits({ env: process.env });
registerApiRateLimits(app, apiRateLimits);

function isProductionEnvironment() {
    return (process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function restrictOperationalWrites(req, res, next) {
    if (isProductionEnvironment()) {
        return res.status(403).json({ error: 'Operational writes are disabled' });
    }
    next();
}

function retireLegacyCatalogRead(req, res, next) {
    if (!isProductionEnvironment()) return next();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(410).json({
        error: 'Gone',
        message: 'GET /api/locations is retired. Use bounded /api/catalog endpoints.',
        code: 'ENDPOINT_RETIRED'
    });
}

function hideProductionPartnerSurface(req, res, next) {
    if (!isProductionEnvironment()) return next();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(404).json({ error: 'API endpoint not found' });
}

app.get('/api/locations', retireLegacyCatalogRead);
app.get('/api/empresas/excel-template', hideProductionPartnerSurface);
app.post('/api/empresas', restrictOperationalWrites);
app.put('/api/empresas/:id', restrictOperationalWrites);
app.post('/api/agencias', restrictOperationalWrites);
app.put('/api/locations/:id', restrictOperationalWrites);

app.use(express.json({ limit: httpRuntimeConfig.jsonBodyLimitBytes }));
app.use(express.urlencoded({ limit: httpRuntimeConfig.urlencodedBodyLimitBytes, extended: true }));

// Serve compiled Angular frontend
const DIST_PATH = path.join(__dirname, '..', 'frontend', 'dist', 'frontend', 'browser');
app.get('/runtime-config.js', (req, res) => {
    res.type('application/javascript');
    res.set('Cache-Control', 'no-store');
    res.send(`window.__SIVOY_CONFIG__=${JSON.stringify({
        mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN || ''
    })};`);
});
app.use(express.static(DIST_PATH));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// Register API routes
app.use('/api/empresas', empresasRoutes);
app.use('/api', ubicacionesRoutes); // Includes /locations and /agencias
app.use('/api', rutasRoutes); // Includes /get-upcoming-routes, /search-routes-by-municipality, /search-flights
app.use('/api', mapasRoutes); // Includes /resolve-maps-link
app.use('/api/catalog', catalogRoutes);

app.use('/api', apiNotFound);

// Catch-all: serve Angular app for any non-API route
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(DIST_PATH, 'index.html'));
});
app.use(apiErrorHandler);

function startServer(options = {}) {
    const application = options.application || app;
    const getDatabase = options.getDatabase || getDB;
    const logger = options.logger || createProcessLogger({ entryPoint: 'server' });
    const port = options.port !== undefined ? options.port : (process.env.PORT || 3000);
    const exit = options.exit !== undefined ? options.exit : process.exit;
    const env = options.env || process.env;

    if (typeof getDatabase !== 'function') throw new TypeError('getDatabase must be a function');
    if (typeof exit !== 'function') throw new TypeError('exit must be a function');
    if (typeof application.listen !== 'function') throw new TypeError('application.listen must be a function');

    return Promise.resolve().then(() => validateProductionCors(env)).then(() => getDatabase()).then((db) => {
        application.locals.db = db;

        const server = application.listen(port, () => {
            try {
                let portInt;
                if (typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535) {
                    portInt = port;
                } else if (typeof port === 'string' && /^[1-9]\d*$/.test(port)) {
                    const num = Number(port);
                    if (num >= 1 && num <= 65535 && num.toString() === port) {
                        portInt = num;
                    }
                }

                const fields = portInt !== undefined ? { port: portInt } : undefined;
                logger.info('server_startup_success', 'none', fields);
            } catch (err) {
                // Ignore logger errors
            }
        });
        applyHttpServerLimits(server, createHttpRuntimeConfig(env));
        return server;
    }).catch(err => {
        try {
            logger.error('server_startup_failed', 'startup_error');
        } catch (logErr) {
            // Ignore
        }

        exit(1);
    });
}

if (require.main === module) {
    startServer().then(server => {
        if (server) {
            registerShutdownHandlers({
                server,
                closeDatabase: closeDB,
                logger: createProcessLogger({ entryPoint: 'server' })
            });
        }
    });
}

module.exports = {
    app,
    startServer
};
