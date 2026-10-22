const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const { parseAllowedMapsUrl } = require('./maps-link-policy');

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_IPV4 = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
    ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
    ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
    ['224.0.0.0', 4], ['240.0.0.0', 4]
];

function ipv4Number(address) {
    return address.split('.').map(Number).reduce((value, octet) => value * 256 + octet, 0);
}

function isPublicIpv4(address) {
    if (net.isIP(address) !== 4) return false;
    const value = ipv4Number(address);
    return !BLOCKED_IPV4.some(([addressBase, bits]) => {
        const base = ipv4Number(addressBase);
        const blockSize = 2 ** (32 - bits);
        return value >= base && value < base + blockSize;
    });
}

function coords(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        ? { lat: latitude, lng: longitude }
        : null;
}

function extractCoordsFromUrl(url) {
    for (const key of ['q', 'query', 'll']) {
        const value = url.searchParams.get(key);
        const match = value?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
        if (match) return coords(match[1], match[2]);
    }
    for (const pattern of [
        /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
        /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
        /\/search\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/
    ]) {
        const match = url.href.match(pattern);
        if (match) return coords(match[1], match[2]);
    }
    return null;
}

function extractCoordsFromHtml(body) {
    for (const pattern of [
        /"lat"\s*:\s*(-?\d+(?:\.\d+)?).*?"lng"\s*:\s*(-?\d+(?:\.\d+)?)/s,
        /\[(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/,
        /content="https:\/\/www\.google\.com\/maps[^\"]*@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/
    ]) {
        const match = body.match(pattern);
        if (match) return coords(match[1], match[2]);
    }
    return null;
}

function createMapsLinkResolver({
    lookup = dns.lookup,
    request = https.request,
    timeoutMs = 8000,
    maxRedirects = 5,
    maxBodyBytes = 16384
} = {}) {
    async function requestPage(url, signal) {
        const records = await lookup(url.hostname, { all: true });
        if (signal.aborted) throw new Error('Maps link timeout');
        const ipv4 = Array.isArray(records) ? records.filter(record => record?.family === 4) : [];
        if (!ipv4.length || ipv4.some(record => !isPublicIpv4(record.address))) {
            throw new Error('Unsafe Maps DNS address');
        }
        const address = ipv4[0].address;
        const pinnedLookup = (hostname, options, callback) => {
            if (typeof options === 'function') callback = options;
            if (hostname !== url.hostname) return callback(new Error('Unexpected Maps hostname'));
            if (options?.all) return callback(null, [{ address, family: 4 }]);
            callback(null, address, 4);
        };

        return new Promise((resolve, reject) => {
            let settled = false;
            let req;
            const finish = (error, result) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', abort);
                if (error) reject(error);
                else resolve(result);
            };
            const abort = () => {
                req?.destroy();
                finish(new Error('Maps link timeout'));
            };
            try {
                req = request(url, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'SiVoyBot/1.0',
                        Accept: 'text/html,application/xhtml+xml'
                    },
                    lookup: pinnedLookup,
                    agent: false,
                    signal
                }, res => {
                    const status = res.statusCode;
                    if (REDIRECT_CODES.has(status)) {
                        res.destroy();
                        if (typeof res.headers.location !== 'string') {
                            return finish(new Error('Google Maps redirect has no location'));
                        }
                        return finish(null, { location: res.headers.location });
                    }
                    if (!Number.isInteger(status) || status < 200 || status >= 300) {
                        res.destroy();
                        return finish(new Error('Google Maps returned an unsuccessful status'));
                    }
                    let bytes = 0;
                    const chunks = [];
                    res.on('data', chunk => {
                        bytes += Buffer.byteLength(chunk);
                        if (bytes > maxBodyBytes) {
                            res.destroy();
                            req.destroy();
                            return finish(new Error('Google Maps response too large'));
                        }
                        chunks.push(Buffer.from(chunk));
                    });
                    res.on('end', () => finish(null, { body: Buffer.concat(chunks).toString('utf8') }));
                    res.on('close', () => finish(new Error('Google Maps response ended early')));
                    res.on('error', error => finish(error));
                });
            } catch (error) {
                return finish(error);
            }
            signal.addEventListener('abort', abort, { once: true });
            req.on('error', error => finish(error));
            if (signal.aborted) return abort();
            try {
                req.end();
            } catch (error) {
                finish(error);
            }
        });
    }

    return async function resolveMapsLink(input) {
        if (!input || typeof input !== 'string') throw new Error('Missing url param');
        let url = parseAllowedMapsUrl(input);
        const direct = extractCoordsFromUrl(url);
        if (direct) return { ...direct, resolvedUrl: url.href };

        const controller = new AbortController();
        let timeout;
        const timeoutPromise = new Promise((_, reject) => {
            timeout = setTimeout(() => {
                controller.abort();
                reject(new Error('Maps link timeout'));
            }, timeoutMs);
        });

        try {
            const work = (async () => {
                for (let redirects = 0; redirects <= maxRedirects; redirects++) {
                    const response = await requestPage(url, controller.signal);
                    if (response.location !== undefined) {
                        if (redirects === maxRedirects || typeof response.location !== 'string') {
                            throw new Error('Invalid or excessive Maps redirect');
                        }
                        url = parseAllowedMapsUrl(new URL(response.location, url).href);
                        const redirected = extractCoordsFromUrl(url);
                        if (redirected) return { ...redirected, resolvedUrl: url.href };
                        continue;
                    }
                    const found = extractCoordsFromUrl(url) || extractCoordsFromHtml(response.body);
                    if (found) return { ...found, resolvedUrl: url.href };
                    throw new Error('No se encontraron coordenadas. Intenta copiar el link largo desde Google Maps.');
                }
                throw new Error('Too many Maps redirects');
            })();
            return await Promise.race([work, timeoutPromise]);
        } finally {
            clearTimeout(timeout);
        }
    };
}

module.exports = { createMapsLinkResolver, isPublicIpv4 };
