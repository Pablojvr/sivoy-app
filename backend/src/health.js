'use strict';

function registerHealthRoute(app) {
    if (!app || typeof app.get !== 'function') {
        throw new TypeError('registerHealthRoute requires an Express-compatible app');
    }

    app.get('/api/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
}

module.exports = { registerHealthRoute };
