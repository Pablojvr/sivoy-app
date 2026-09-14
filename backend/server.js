require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createHttpObservability } = require('./src/core/observability/http-observability');
const { registerObservabilityRoutes } = require('./src/core/observability/observability-routes');
const { getDB } = require('./src/config/database');
const { createProcessLogger } = require('./src/core/observability/process-logger');

const empresasRoutes = require('./src/domains/empresas/empresas.routes');
const ubicacionesRoutes = require('./src/domains/ubicaciones/ubicaciones.routes');
const rutasRoutes = require('./src/domains/rutas/rutas.routes');
const mapasRoutes = require('./src/domains/mapas/mapas.routes');

const app = express();
const corsOptions = {
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const observability = createHttpObservability();
registerObservabilityRoutes(app, observability);
app.use('/api', observability.middleware);

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
app.use('/api', ubicacionesRoutes); // Includes /locations, /agencias, /test-location
app.use('/api', rutasRoutes); // Includes /get-upcoming-routes, /search-routes-by-municipality, /search-flights
app.use('/api', mapasRoutes); // Includes /resolve-maps-link

// Catch-all: serve Angular app for any non-API route
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(DIST_PATH, 'index.html'));
});

function startServer(options = {}) {
    const application = options.application || app;
    const getDatabase = options.getDatabase || getDB;
    const logger = options.logger || createProcessLogger({ entryPoint: 'server' });
    const port = options.port !== undefined ? options.port : (process.env.PORT || 3000);
    const exit = options.exit !== undefined ? options.exit : process.exit;

    if (typeof getDatabase !== 'function') throw new TypeError('getDatabase must be a function');
    if (typeof exit !== 'function') throw new TypeError('exit must be a function');
    if (typeof application.listen !== 'function') throw new TypeError('application.listen must be a function');

    return Promise.resolve().then(() => getDatabase()).then((db) => {
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
    startServer();
}

module.exports = {
    app,
    startServer
};
