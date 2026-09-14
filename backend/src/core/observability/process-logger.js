'use strict';
const crypto = require('node:crypto');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTRYPOINTS = new Set(['server', 'database', 'ubicaciones_service']);
const EVENTS = new Set([
    'server_startup_success',
    'server_startup_failed',
    'db_pool_connected',
    'db_rollback_failed',
    'cloudinary_config_missing',
    'horarios_parse_failed'
]);
const ERROR_CODES = new Set([
    'startup_error',
    'database_error',
    'configuration_missing',
    'invalid_schedule_data',
    'none'
]);

function isValidUUID(uuid) {
    return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}

function deepFreeze(obj) {
    if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(prop => {
            if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
                deepFreeze(obj[prop]);
            }
        });
        Object.freeze(obj);
    }
    return obj;
}


function createProcessLogger(options = {}) {
    let runId = options.runId;
    if (!isValidUUID(runId)) {
        try {
            const factory = options.uuidFactory || crypto.randomUUID;
            runId = factory();
            if (!isValidUUID(runId)) throw new Error('invalid uuid generator');
        } catch (e) {
            runId = '00000000-0000-4000-8000-000000000000';
        }
    }

    const entryPoint = ENTRYPOINTS.has(options.entryPoint) ? options.entryPoint : 'unknown_entry_point';
    const clock = options.clock;
    const stringify = options.stringify || JSON.stringify;
    const stdout = options.stdout || process.stdout;
    const stderr = options.stderr || process.stderr;

    function defaultWrite(level, record) {
        const stream = level === 'error' ? stderr : stdout;
        let str;
        try {
            str = stringify(record);
        } catch(e) {
            try {
                stream.write(`{"level":"${level}","event":"logger_fallback_error"}\n`);
            } catch(e2) {}
            return;
        }
        try {
            stream.write(str + '\n');
        } catch(e) {}
    }

    const sink = options.sink;

    function log(level, event, errorCode, fields) {
        let ts;
        const fallbackEpoch = '1970-01-01T00:00:00.000Z';
        try {
            ts = clock ? clock() : new Date().toISOString();
            if (typeof ts !== 'string' || Number.isNaN(Date.parse(ts)) || new Date(ts).toISOString() !== ts) {
                ts = fallbackEpoch;
            }
        } catch (e) {
            ts = fallbackEpoch;
        }

        const safeEvent = EVENTS.has(event) ? event : 'unknown_event';
        
        let safeCode;
        if (errorCode === undefined) {
            safeCode = undefined;
        } else {
            safeCode = ERROR_CODES.has(errorCode) ? errorCode : 'unknown_code';
        }

        let safeFields = undefined;
        if (fields && typeof fields === 'object') {
            if (Number.isInteger(fields.port) && fields.port >= 1 && fields.port <= 65535) {
                safeFields = { port: fields.port };
            }
        }

        const record = {
            timestamp: ts,
            level,
            runId,
            entryPoint,
            event: safeEvent
        };
        
        if (safeCode !== undefined) {
            record.errorCode = safeCode;
        }
        
        if (safeFields !== undefined) {
            record.fields = safeFields;
        }

        deepFreeze(record);

        let sinkHandled = false;
        if (sink && typeof sink[level] === 'function') {
            try {
                sink[level](record);
                sinkHandled = true;
            } catch (e) {
                // sink failed, fallback to defaultWrite to avoid losing logs silently
            }
        }
        
        if (!sinkHandled) {
            defaultWrite(level, record);
        }
    }

    return {
        info: (event, errorCode, fields) => log('info', event, errorCode, fields),
        warn: (event, errorCode, fields) => log('warn', event, errorCode, fields),
        error: (event, errorCode, fields) => log('error', event, errorCode, fields)
    };
}

module.exports = { createProcessLogger };
