const assert = require('node:assert/strict');
const test = require('node:test');

test('importing server does not auto-start', async () => {
    const { startServer } = require('../server');
    assert.strictEqual(typeof startServer, 'function');
});

test('success assigns db, listen, exact log with canonical port', async () => {
    const { startServer } = require('../server');
    const logs = [];
    const fakeLogger = {
        info: (e, c, f) => logs.push({ e, c, f })
    };
    let listenPort;
    const fakeApp = {
        locals: {},
        listen: (p, cb) => {
            listenPort = p;
            cb();
            return { fakeServer: true };
        }
    };
    const fakeDb = { isDb: true };
    const getDatabase = async () => fakeDb;

    const result = await startServer({
        application: fakeApp,
        getDatabase,
        logger: fakeLogger,
        port: '3000',
        exit: () => {}
    });

    assert.strictEqual(fakeApp.locals.db, fakeDb);
    assert.strictEqual(listenPort, '3000');
    assert.deepEqual(logs, [{ e: 'server_startup_success', c: 'none', f: { port: 3000 } }]);
    assert.deepEqual(result, { fakeServer: true });
});

test('omits port from log if invalid, but still passes it to listen untouched', async () => {
    const { startServer } = require('../server');
    for (const testPort of ['03000', '3000abc', '', '   ', '0', '65536', 0, 65536, ' 3000', '3000 ', null]) {
        const logs = [];
        const fakeLogger = { info: (e, c, f) => logs.push({ e, c, f }) };
        let listenPort;
        const fakeApp = { locals: {}, listen: (p, cb) => { listenPort = p; cb(); } };
        
        await startServer({
            application: fakeApp,
            getDatabase: async () => ({}),
            logger: fakeLogger,
            port: testPort,
            exit: () => {}
        });

        assert.strictEqual(listenPort, testPort);
        assert.deepEqual(logs, [{ e: 'server_startup_success', c: 'none', f: undefined }]);
    }
});

test('failure logs exact error, calls exit, and NEVER calls listen (async rejection)', async () => {
    const { startServer } = require('../server');
    const logs = [];
    const fakeLogger = {
        error: (e, c, err) => {
            if (err) throw new Error('No raw error allowed');
            logs.push({ e, c });
        }
    };
    const getDatabase = async () => { throw new Error('db broken async'); };
    
    let exitCode = null;
    let listenCalled = false;
    const fakeExit = (code) => { exitCode = code; };
    const fakeApp = { locals: {}, listen: () => { listenCalled = true; } };
    
    await startServer({
        application: fakeApp,
        getDatabase,
        logger: fakeLogger,
        exit: fakeExit
    });
    
    assert.strictEqual(exitCode, 1);
    assert.strictEqual(listenCalled, false);
    assert.deepEqual(logs, [{ e: 'server_startup_failed', c: 'startup_error' }]);
});

test('failure logs exact error, calls exit, and NEVER calls listen (sync throw)', async () => {
    const { startServer } = require('../server');
    const logs = [];
    const fakeLogger = {
        error: (e, c, err) => {
            if (err) throw new Error('No raw error allowed');
            logs.push({ e, c });
        }
    };
    const getDatabase = () => { throw new Error('db broken sync'); };
    
    let exitCode = null;
    let listenCalled = false;
    const fakeExit = (code) => { exitCode = code; };
    const fakeApp = { locals: {}, listen: () => { listenCalled = true; } };
    
    await startServer({
        application: fakeApp,
        getDatabase,
        logger: fakeLogger,
        exit: fakeExit
    });
    
    assert.strictEqual(exitCode, 1);
    assert.strictEqual(listenCalled, false);
    assert.deepEqual(logs, [{ e: 'server_startup_failed', c: 'startup_error' }]);
});

test('logger throwing continues to exit', async () => {
    const { startServer } = require('../server');
    const fakeLogger = {
        error: () => { throw new Error('logger boom'); }
    };
    const getDatabase = async () => { throw new Error('db broken'); };
    
    let exitCode = null;
    const fakeExit = (code) => { exitCode = code; };
    
    await startServer({
        application: { locals: {}, listen: () => {} },
        getDatabase,
        logger: fakeLogger,
        exit: fakeExit
    });
    
    assert.strictEqual(exitCode, 1);
});

test('exit throwing remains a handled rejection', async () => {
    const { startServer } = require('../server');
    const fakeLogger = { error: () => {} };
    const getDatabase = async () => { throw new Error('db broken'); };
    const exitExpected = new Error('exit boom');
    const fakeExit = () => { throw exitExpected; };
    
    await assert.rejects(
        startServer({
            application: { locals: {}, listen: () => {} },
            getDatabase,
            logger: fakeLogger,
            exit: fakeExit
        }),
        (err) => err === exitExpected
    );
});

test('validates injected dependencies', async () => {
    const { startServer } = require('../server');
    assert.throws(() => startServer({ getDatabase: 'not-a-function' }), TypeError);
    assert.throws(() => startServer({ exit: 'not-a-function' }), TypeError);
    assert.throws(() => startServer({ application: { listen: 'not-a-function' } }), TypeError);
});

test('dotenv is configured with quiet: true', () => {
    const { spawnSync } = require('node:child_process');
    const path = require('node:path');
    
    const script = `
        const m = require('node:module');
        const originalRequire = m.prototype.require;
        m.prototype.require = function (id) {
            if (id === 'dotenv') {
                return {
                    config: (options) => {
                        if (options && options.quiet === true) {
                            console.log('QUIET_TRUE');
                        } else {
                            console.log('QUIET_FALSE');
                        }
                    }
                };
            }
            return originalRequire.apply(this, arguments);
        };
        require('./server');
    `;
    
    const { stdout } = spawnSync(process.execPath, ['-e', script], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8'
    });
    
    assert.match(stdout, /QUIET_TRUE/);
    assert.doesNotMatch(stdout, /QUIET_FALSE/);
});
