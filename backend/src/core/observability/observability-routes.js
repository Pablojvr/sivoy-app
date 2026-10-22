const crypto = require('node:crypto');

function registerObservabilityRoutes(app, observability, options = {}) {
    // GET /api/health is public
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    let metricsToken;
    if (options && 'METRICS_TOKEN' in options) {
        metricsToken = options.METRICS_TOKEN;
    } else {
        metricsToken = process.env.METRICS_TOKEN;
    }

    if (typeof metricsToken === 'string' && metricsToken.trim() !== '') {
        const expectedHash = crypto.createHash('sha256').update(metricsToken).digest();

        app.get('/api/metrics', (req, res) => {
            const authHeader = req.headers.authorization;
            if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
                // Missing or badly formatted authorization
                return res.status(404).end();
            }

            const providedToken = authHeader.substring(7);
            const providedHash = crypto.createHash('sha256').update(providedToken).digest();

            // Compare token using node:crypto timingSafeEqual safely with unequal lengths
            // by comparing the hashes. This prevents leaking length information.
            if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
                return res.status(404).end();
            }

            res.set('Cache-Control', 'no-store');
            res.json(observability.getSnapshot());
        });
    }
}

module.exports = {
    registerObservabilityRoutes
};
