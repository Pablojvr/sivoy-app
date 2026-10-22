'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createProcessLogger } = require('../src/core/observability/process-logger');

test('ProcessLogger', async (t) => {
    await t.test('generates valid UUID and uses unknown_entry_point by default', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const logger = createProcessLogger({ sink });
        logger.info('server_startup_success');
        
        assert.ok(captured);
        assert.match(captured.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        assert.strictEqual(captured.entryPoint, 'unknown_entry_point');
    });

    await t.test('uses injected runId and known entryPoint', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const logger = createProcessLogger({
            runId: '123e4567-e89b-12d3-a456-426614174000',
            entryPoint: 'server',
            sink
        });
        logger.info('server_startup_success');
        
        assert.strictEqual(captured.runId, '123e4567-e89b-12d3-a456-426614174000');
        assert.strictEqual(captured.entryPoint, 'server');
    });

    await t.test('validates event and errorCode allowlists', () => {
        let captured = null;
        const sink = { error: (obj) => { captured = obj; } };
        const logger = createProcessLogger({ sink });
        
        logger.error('invalid_event', 'invalid_code');
        assert.strictEqual(captured.event, 'unknown_event');
        assert.strictEqual(captured.errorCode, 'unknown_code');
        
        const recordStr = JSON.stringify(captured);
        assert.ok(!recordStr.includes('invalid_event'));
        assert.ok(!recordStr.includes('invalid_code'));
    });

    await t.test('accepts valid events and errorCodes', () => {
        let captured = null;
        const sink = { warn: (obj) => { captured = obj; } };
        const logger = createProcessLogger({ sink });
        
        logger.warn('db_pool_connected', 'database_error');
        assert.strictEqual(captured.event, 'db_pool_connected');
        assert.strictEqual(captured.errorCode, 'database_error');
    });

    await t.test('shutdown events stay allowlisted without leaking error details', () => {
        const records = [];
        const logger = createProcessLogger({
            entryPoint: 'server',
            sink: {
                info: record => records.push(record),
                error: record => records.push(record)
            }
        });
        logger.info('server_shutdown_success', 'none', { password: 'secret' });
        logger.error('server_shutdown_failed', 'shutdown_error', { message: 'postgres://secret' });
        assert.deepStrictEqual(records.map(record => [record.event, record.errorCode]), [
            ['server_shutdown_success', 'none'],
            ['server_shutdown_failed', 'shutdown_error']
        ]);
        assert.doesNotMatch(JSON.stringify(records), /postgres:\/\/secret|password|secret/);
    });
    
    await t.test('handles omitted errorCode correctly', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const logger = createProcessLogger({ sink });
        
        logger.info('server_startup_success');
        assert.strictEqual('errorCode' in captured, false);
    });

    await t.test('filters fields, keeping only port integer 1..65535 and removing secrets', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const logger = createProcessLogger({ sink });
        
        logger.info('server_startup_success', 'none', {
            port: 3000,
            secret: 'supersecret',
            token: '12345',
            password: 'pwd',
            message: 'hello',
            stack: 'Error',
            code: 500,
            arbitrary: 'value'
        });
        
        assert.deepStrictEqual(captured.fields, { port: 3000 });
        const recordStr = JSON.stringify(captured);
        assert.ok(!recordStr.includes('supersecret'));
        assert.ok(!recordStr.includes('12345'));
        assert.ok(!recordStr.includes('pwd'));
        assert.ok(!recordStr.includes('hello'));
        assert.ok(!recordStr.includes('Error'));
    });

    await t.test('omits fields entirely if empty or invalid port', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const logger = createProcessLogger({ sink });
        
        logger.info('server_startup_success', 'none', { port: -1, secret: 'x' });
        assert.strictEqual(captured.fields, undefined);
        
        logger.info('server_startup_success', 'none', { port: 65536 });
        assert.strictEqual(captured.fields, undefined);
        
        logger.info('server_startup_success', 'none', { port: 80.5 });
        assert.strictEqual(captured.fields, undefined);
        
        logger.info('server_startup_success', 'none', null);
        assert.strictEqual(captured.fields, undefined);
    });

    await t.test('deep freezes the record before sink', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const logger = createProcessLogger({ sink });
        
        logger.info('server_startup_success', 'none', { port: 8080 });
        
        assert.throws(() => {
            captured.event = 'hacked';
        }, TypeError);
        
        assert.throws(() => {
            captured.fields.port = 9999;
        }, TypeError);
    });

    await t.test('handles clock failures safely with deterministic fallback', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const logger = createProcessLogger({
            clock: () => { throw new Error('Clock broke'); },
            sink
        });
        
        logger.info('server_startup_success');
        assert.strictEqual(captured.timestamp, '1970-01-01T00:00:00.000Z');
    });

    await t.test('handles invalid ISO strings from clock safely', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const logger = createProcessLogger({
            clock: () => 'invalid-date',
            sink
        });
        
        logger.info('server_startup_success');
        assert.strictEqual(captured.timestamp, '1970-01-01T00:00:00.000Z');
    });

    await t.test('handles sink failure and falls back to defaultWrite', () => {
        let written = '';
        const mockStdout = {
            write: (chunk) => { written += chunk; }
        };
        const sink = { info: () => { throw new Error('Sink broken'); } };
        const logger = createProcessLogger({ sink, stdout: mockStdout });
        
        assert.doesNotThrow(() => {
            logger.info('server_startup_success');
        });
        
        assert.ok(written.includes('server_startup_success'));
        assert.ok(written.endsWith('\n'));
    });

    await t.test('uses default sink to write exactly one JSON line to stdout for info', () => {
        let written = '';
        const mockStdout = {
            write: (chunk) => { written += chunk; }
        };
        const logger = createProcessLogger({ stdout: mockStdout });
        logger.info('server_startup_success');
        
        assert.ok(written.endsWith('\n'));
        const lines = written.trim().split('\n');
        assert.strictEqual(lines.length, 1);
        
        const parsed = JSON.parse(lines[0]);
        assert.strictEqual(parsed.event, 'server_startup_success');
        assert.strictEqual(parsed.level, 'info');
        assert.ok(parsed.runId);
    });

    await t.test('uses default sink to write exactly one JSON line to stderr for error', () => {
        let written = '';
        const mockStderr = {
            write: (chunk) => { written += chunk; }
        };
        const logger = createProcessLogger({ stderr: mockStderr });
        logger.error('server_startup_failed');
        
        assert.ok(written.endsWith('\n'));
        const lines = written.trim().split('\n');
        assert.strictEqual(lines.length, 1);
        
        const parsed = JSON.parse(lines[0]);
        assert.strictEqual(parsed.event, 'server_startup_failed');
        assert.strictEqual(parsed.level, 'error');
    });

    await t.test('default sink handles serialization failures gracefully', () => {
        let written = '';
        const mockStdout = {
            write: (chunk) => { written += chunk; }
        };
        const mockStringify = () => { throw new Error('Serialization Error'); };
        
        const logger = createProcessLogger({ stdout: mockStdout, stringify: mockStringify });
        logger.info('server_startup_success');
        
        assert.strictEqual(written, '{"level":"info","event":"logger_fallback_error"}\n');
    });

    await t.test('handles default UUID generator failure', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const mockUuidFactory = () => { throw new Error('Crypto error'); };
        
        const logger = createProcessLogger({ sink, uuidFactory: mockUuidFactory });
        logger.info('server_startup_success');
        
        assert.strictEqual(captured.runId, '00000000-0000-4000-8000-000000000000');
    });

    await t.test('preserves exact canonical ISO from clock', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const canonical = "2026-09-13T12:34:56.789Z";
        const logger = createProcessLogger({
            clock: () => canonical,
            sink
        });
        
        logger.info('server_startup_success');
        assert.strictEqual(captured.timestamp, canonical);
    });

    await t.test('falls back to epoch for parseable but non-canonical ISO', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const nonCanonical = "2026-09-13T12:34:56Z";
        const logger = createProcessLogger({
            clock: () => nonCanonical,
            sink
        });
        
        logger.info('server_startup_success');
        assert.strictEqual(captured.timestamp, '1970-01-01T00:00:00.000Z');
    });

    await t.test('logger.warn usa exclusivamente stdout inyectado', () => {
        let stdoutWritten = '';
        let stderrWritten = '';
        const mockStdout = { write: (chunk) => { stdoutWritten += chunk; } };
        const mockStderr = { write: (chunk) => { stderrWritten += chunk; } };
        
        const logger = createProcessLogger({ stdout: mockStdout, stderr: mockStderr });
        logger.warn('server_startup_failed');
        
        assert.strictEqual(stderrWritten, '');
        assert.ok(stdoutWritten.endsWith('\n'));
        const lines = stdoutWritten.trim().split('\n');
        assert.strictEqual(lines.length, 1);
        
        const parsed = JSON.parse(lines[0]);
        assert.strictEqual(parsed.event, 'server_startup_failed');
        assert.strictEqual(parsed.level, 'warn');
    });

    await t.test('runId is stable across info/warn/error', () => {
        const captured = [];
        const sink = {
            info: (obj) => captured.push(obj),
            warn: (obj) => captured.push(obj),
            error: (obj) => captured.push(obj)
        };
        const logger = createProcessLogger({ sink });
        
        logger.info('server_startup_success');
        logger.warn('server_startup_success');
        logger.error('server_startup_success');
        
        assert.strictEqual(captured.length, 3);
        const runId = captured[0].runId;
        assert.ok(runId);
        assert.strictEqual(captured[1].runId, runId);
        assert.strictEqual(captured[2].runId, runId);
    });

    await t.test('stdout.write and stderr.write exceptions do not propagate', () => {
        const mockStdout = { write: () => { throw new Error('Stdout Error'); } };
        const mockStderr = { write: () => { throw new Error('Stderr Error'); } };
        
        const logger = createProcessLogger({ stdout: mockStdout, stderr: mockStderr });
        
        assert.doesNotThrow(() => {
            logger.info('server_startup_success');
            logger.warn('server_startup_success');
            logger.error('server_startup_failed');
        });
    });

    await t.test('partial sink and non-object sink fall back to defaultWrite safely', () => {
        let written = '';
        const mockStdout = { write: (chunk) => { written += chunk; } };
        
        const partialSink = { info: () => {} };
        const logger1 = createProcessLogger({ sink: partialSink, stdout: mockStdout });
        logger1.warn('server_startup_failed');
        
        assert.ok(written.includes('server_startup_failed'));
        assert.ok(written.includes('"level":"warn"'));
        
        written = '';
        const nonObjectSink = "not-an-object";
        const logger2 = createProcessLogger({ sink: nonObjectSink, stdout: mockStdout });
        logger2.info('server_startup_success');
        
        assert.ok(written.includes('server_startup_success'));
        assert.ok(written.includes('"level":"info"'));
    });

    await t.test('uuidFactory returning invalid UUID yields valid sentinel v4', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const mockUuidFactory = () => 'invalid-uuid';
        
        const logger = createProcessLogger({ sink, uuidFactory: mockUuidFactory });
        logger.info('server_startup_success');
        
        assert.strictEqual(captured.runId, '00000000-0000-4000-8000-000000000000');
    });

    await t.test('removes sensible raw code from JSON', () => {
        let captured = null;
        const sink = { info: (obj) => { captured = obj; } };
        const logger = createProcessLogger({ sink });
        
        logger.info('server_startup_success', 'none', {
            port: 3000,
            code: 'CRITICAL_RAW_CODE'
        });
        
        const recordStr = JSON.stringify(captured);
        assert.ok(!recordStr.includes('CRITICAL_RAW_CODE'));
    });
});
