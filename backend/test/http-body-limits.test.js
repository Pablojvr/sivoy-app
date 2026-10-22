const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

test('HTTP body parsers reject oversized JSON and urlencoded payloads with safe JSON', async (t) => {
    const server = app.listen(0, '127.0.0.1');
    t.after(() => server.close());
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    for (const [contentType, body] of [
        ['application/json', JSON.stringify({ padding: 'x'.repeat(256 * 1024) })],
        ['application/x-www-form-urlencoded', `padding=${'x'.repeat(64 * 1024)}`]
    ]) {
        const response = await fetch(`${baseUrl}/api/search-routes-by-municipality`, {
            method: 'POST',
            headers: { 'content-type': contentType },
            body
        });

        assert.equal(response.status, 413, contentType);
        assert.deepEqual(await response.json(), { error: 'Request body too large' });
        assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/i);
    }
});
