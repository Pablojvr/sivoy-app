const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseAllowedMapsUrl } = require('../src/domains/mapas/maps-link-policy');

describe('maps-link-policy', () => {
    describe('parseAllowedMapsUrl', () => {
        it('permite URLs válidas de Google Maps', () => {
            const validUrls = [
                'https://maps.app.goo.gl/short',
                'https://goo.gl/maps/short',
                'https://www.google.com/maps/place/San-Salvador/@13.6929,-89.2182,15z',
                'https://maps.google.com/?q=12.34,-56.78',
                'https://www.google.com.sv/maps'
            ];

            for (const urlStr of validUrls) {
                const result = parseAllowedMapsUrl(urlStr);
                assert.ok(result instanceof URL);
                assert.strictEqual(result.href, new URL(urlStr).href);
            }
        });

        it('rechaza protocolo HTTP', () => {
            assert.throws(() => parseAllowedMapsUrl('http://maps.app.goo.gl/short'), Error);
        });

        it('rechaza localhost o IP', () => {
            assert.throws(() => parseAllowedMapsUrl('https://localhost/maps'), Error);
            assert.throws(() => parseAllowedMapsUrl('https://127.0.0.1/maps'), Error);
        });

        it('rechaza host parecido a google', () => {
            assert.throws(() => parseAllowedMapsUrl('https://www.google.com.evil.test/maps'), Error);
            assert.throws(() => parseAllowedMapsUrl('https://www.google.com./maps'), Error);
            assert.throws(() => parseAllowedMapsUrl('https://evil.test/maps/@13.6929,-89.2182'), Error);
        });

        it('rechaza credenciales (username/password) en la URL', () => {
            assert.throws(() => parseAllowedMapsUrl('https://user:pass@maps.app.goo.gl/short'), Error);
        });

        it('rechaza puerto 8443', () => {
            assert.throws(() => parseAllowedMapsUrl('https://maps.app.goo.gl:8443/short'), Error);
        });

        it('rechaza URL relativa', () => {
            assert.throws(() => parseAllowedMapsUrl('/maps/place/foo'), Error);
        });

        it('rechaza cadena > 4096 caracteres', () => {
            const longUrl = 'https://maps.app.goo.gl/' + 'a'.repeat(4096);
            assert.throws(() => parseAllowedMapsUrl(longUrl), Error);
        });

        it('rechaza goo.gl/ruta-no-maps', () => {
            assert.throws(() => parseAllowedMapsUrl('https://goo.gl/ruta-no-maps'), Error);
            assert.throws(() => parseAllowedMapsUrl('https://maps.app.goo.gl/'), Error);
        });

        it('rechaza www.google.com/search', () => {
            assert.throws(() => parseAllowedMapsUrl('https://www.google.com/search?q=lat,lng'), Error);
        });

        it('rechaza whitespace y tipo inválido', () => {
            assert.throws(() => parseAllowedMapsUrl('   '), Error);
            assert.throws(() => parseAllowedMapsUrl(' https://maps.app.goo.gl/short'), Error);
            assert.throws(() => parseAllowedMapsUrl(null), Error);
            assert.throws(() => parseAllowedMapsUrl(undefined), Error);
            assert.throws(() => parseAllowedMapsUrl(123), Error);
        });

        it('comprueba la URL.hostname canónica', () => {
            const input = 'https://MAPS.APP.GOO.GL/short';
            const result = parseAllowedMapsUrl(input);
            assert.strictEqual(result.hostname, 'maps.app.goo.gl');
        });

        it('comprueba que la entrada original no muta', () => {
            const originalInput = 'https://maps.app.goo.gl/short';
            parseAllowedMapsUrl(originalInput);
            assert.strictEqual(originalInput, 'https://maps.app.goo.gl/short');
        });
    });
});
