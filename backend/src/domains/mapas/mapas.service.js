const https = require('https');
const http = require('http');

function resolveRedirect(inputUrl, maxRedirects = 10) {
    return new Promise((resolve, reject) => {
        let redirectCount = 0;

        function doRequest(url) {
            if (redirectCount >= maxRedirects) return reject(new Error('Too many redirects'));

            const lib = url.startsWith('https') ? https : http;
            const options = {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SiVoyBot/1.0)',
                    'Accept': 'text/html,application/xhtml+xml'
                }
            };

            const req = lib.request(url, options, (res) => {
                const loc = res.headers['location'];
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc) {
                    redirectCount++;
                    res.destroy(); // Don't read the body on redirects
                    const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
                    doRequest(next);
                } else {
                    // At final destination — read first chunk of body for coord extraction
                    let body = '';
                    res.on('data', (chunk) => {
                        body += chunk.toString();
                        if (body.length > 10000) {
                            res.destroy(); // Got enough data
                        }
                    });
                    res.on('end', () => resolve({ finalUrl: url, htmlSnippet: body }));
                    res.on('close', () => resolve({ finalUrl: url, htmlSnippet: body }));
                }
            });

            req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
            req.on('error', (e) => {
                // Socket hang up after destroy is expected, treat as resolved with empty body
                if (e.code === 'ECONNRESET' || e.message.includes('socket hang up')) {
                    resolve({ finalUrl: url, htmlSnippet: '' });
                } else {
                    reject(e);
                }
            });
            req.end();
        }

        doRequest(inputUrl);
    });
}

function extractCoordsFromUrl(url) {
    let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    m = url.match(/\/search\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    m = url.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    return null;
}

async function resolveMapsLink(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('Missing url param');
    }

    const directCoords = extractCoordsFromUrl(url);
    if (directCoords) {
        return { lat: directCoords.lat, lng: directCoords.lng, resolvedUrl: url };
    }

    const { finalUrl, htmlSnippet } = await resolveRedirect(url);

    let coords = extractCoordsFromUrl(finalUrl);
    if (coords) {
        return { lat: coords.lat, lng: coords.lng, resolvedUrl: finalUrl };
    }

    if (htmlSnippet) {
        let m = htmlSnippet.match(/"lat"\s*:\s*(-?\d+\.\d+).*?"lng"\s*:\s*(-?\d+\.\d+)/);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), resolvedUrl: finalUrl };

        m = htmlSnippet.match(/\[(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), resolvedUrl: finalUrl };

        m = htmlSnippet.match(/content="https:\/\/www\.google\.com\/maps[^"]*@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), resolvedUrl: finalUrl };
    }

    throw new Error('No se encontraron coordenadas. Intenta copiar el link largo desde Google Maps.');
}

module.exports = {
    resolveMapsLink
};
