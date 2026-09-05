require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDB } = require('./src/config/database');

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

const PORT = process.env.PORT || 3000;
getDB().then((db) => {
    // Para compatibilidad hacia atrás si hay algún middleware perdido que use app.locals.db
    app.locals.db = db;
    
    app.listen(PORT, () => {
        console.log(`\n  ✅ SiVoy App running on http://localhost:${PORT}`);
        console.log(`  📦 Backend API at  http://localhost:${PORT}/api`);
        console.log(`  🌐 Frontend at     http://localhost:${PORT}\n`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
