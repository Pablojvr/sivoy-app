const ALLOWED_GENERAL_HOSTS = new Set([
    'www.google.com',
    'google.com',
    'www.google.com.sv'
]);

const MAX_URL_LENGTH = 4096;

function parseAllowedMapsUrl(input) {
    if (typeof input !== 'string' || !input || input.length > MAX_URL_LENGTH || input !== input.trim()) {
        throw new TypeError('Invalid Google Maps URL');
    }

    let url;
    try {
        url = new URL(input);
    } catch {
        throw new TypeError('Invalid Google Maps URL');
    }

    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
        throw new TypeError('Invalid Google Maps URL');
    }

    const mapsPath = url.pathname === '/maps' || url.pathname.startsWith('/maps/');
    const host = url.hostname;
    let allowed = false;

    if (host === 'maps.app.goo.gl') {
        allowed = url.pathname.length > 1;
    } else if (host === 'goo.gl') {
        allowed = url.pathname.startsWith('/maps/') && url.pathname.length > '/maps/'.length;
    } else if (host === 'maps.google.com') {
        allowed = mapsPath || (url.pathname === '/' && Boolean(url.search));
    } else if (ALLOWED_GENERAL_HOSTS.has(host)) {
        allowed = mapsPath;
    }

    if (!allowed) {
        throw new TypeError('Invalid Google Maps URL');
    }

    return url;
}

module.exports = { parseAllowedMapsUrl };
