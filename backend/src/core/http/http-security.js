'use strict';

const LOOPBACK_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

function validateProductionCors(env = process.env) {
  const origins = parseOrigins(env.FRONTEND_URL, env.NODE_ENV === 'production');
  if (env.NODE_ENV === 'production' && origins.length === 0) {
    throw new Error('Production CORS origin is required');
  }
  return origins;
}

function createCorsOptions(env = process.env) {
  const configuredOrigins = new Set(parseOrigins(env.FRONTEND_URL, env.NODE_ENV === 'production'));
  const isDevelopment = env.NODE_ENV !== 'production';
  return {
    optionsSuccessStatus: 200,
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowed = configuredOrigins.has(origin) || (isDevelopment && LOOPBACK_ORIGIN.test(origin));
      callback(null, allowed);
    }
  };
}

function createSecurityHeaders(env = process.env) {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "worker-src 'self' blob:",
    "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://tile.openstreetmap.org https://nominatim.openstreetmap.org https://places.googleapis.com"
  ].join('; ');

  return function securityHeaders(req, res, next) {
    res.setHeader('Content-Security-Policy-Report-Only', csp);
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), geolocation=(self)');
    if (env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

function apiNotFound(req, res) {
  return res.status(404).json({ error: 'API endpoint not found' });
}

function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  return res.status(500).json({ error: 'Internal server error' });
}

function parseOrigins(rawValue, production) {
  if (!rawValue) return [];
  return [...new Set(rawValue.split(',').map((value) => value.trim()).filter(Boolean).map((value) => {
    if (value === '*') throw new Error('Production CORS origin is invalid');
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('Production CORS origin is invalid');
    }
    const allowedProtocol = production ? parsed.protocol === 'https:' : ['http:', 'https:'].includes(parsed.protocol);
    const hasOnlyOrigin = parsed.pathname === '/' && !parsed.search && !parsed.hash && !parsed.username && !parsed.password;
    if (!allowedProtocol || !hasOnlyOrigin) throw new Error('Production CORS origin is invalid');
    return parsed.origin;
  }))];
}

module.exports = {
  apiErrorHandler,
  apiNotFound,
  createCorsOptions,
  createSecurityHeaders,
  validateProductionCors
};
