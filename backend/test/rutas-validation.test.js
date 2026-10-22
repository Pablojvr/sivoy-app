'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
    validateUpcomingRoutes,
    validateMunicipalityRoutes,
    validateSearchFlights
} = require('../src/domains/rutas/rutas.validation');

test('validateUpcomingRoutes', async (t) => {
    await t.test('valid payload', () => {
        const payload = {
            origen: 'A',
            destino: 'B',
            dropoff_date: '2026-09-16',
            dropoff_time: '10:00'
        };
        const result = validateUpcomingRoutes(payload);
        assert.strictEqual(result.origen, 'A');
        assert.strictEqual(result.destino, 'B');
        assert.strictEqual(result.dropoff_date, '2026-09-16');
        assert.strictEqual(result.dropoff_time, '10:00');
    });

    await t.test('conserve absence of dropoff if one is missing', () => {
        const payload = { origen: 'A', destino: 'B', dropoff_date: '2026-09-16' };
        const result = validateUpcomingRoutes(payload);
        assert.strictEqual(result.dropoff_date, undefined);
        assert.strictEqual(result.dropoff_time, undefined);
    });

    await t.test('validates present dropoff fields even if one is missing (legacy absence)', () => {
        const payload1 = { origen: 'A', destino: 'B', dropoff_date: '2026-09-16', dropoff_time: '99:99' };
        assert.throws(() => validateUpcomingRoutes(payload1), { code: 'VALIDATION_ERROR' });

        const payload2 = { origen: 'A', destino: 'B', dropoff_date: 'invalid', dropoff_time: '10:00' };
        assert.throws(() => validateUpcomingRoutes(payload2), { code: 'VALIDATION_ERROR' });

        const payload3 = { origen: 'A', destino: 'B', dropoff_date: false, dropoff_time: '10:00' };
        assert.throws(() => validateUpcomingRoutes(payload3), { code: 'VALIDATION_ERROR' });

        const payload4 = { origen: 'A', destino: 'B', dropoff_date: '2026-09-16', dropoff_time: 0 };
        assert.throws(() => validateUpcomingRoutes(payload4), { code: 'VALIDATION_ERROR' });

        const payload5 = { origen: 'A', destino: 'B', dropoff_date: ' ', dropoff_time: '10:00' };
        assert.throws(() => validateUpcomingRoutes(payload5), { code: 'VALIDATION_ERROR' });

        const payload6 = { origen: 'A', destino: 'B', dropoff_date: null, dropoff_time: '10:00' };
        assert.throws(() => validateUpcomingRoutes(payload6), { code: 'VALIDATION_ERROR' });
    });

    await t.test('fails if not plain object', () => {
        assert.throws(() => validateUpcomingRoutes([]), { code: 'VALIDATION_ERROR' });
        assert.throws(() => validateUpcomingRoutes(null), { code: 'VALIDATION_ERROR' });
        assert.throws(() => validateUpcomingRoutes("string"), { code: 'VALIDATION_ERROR' });
    });

    await t.test('accepts exact 160 chars and rejects 161', () => {
        const str160 = 'A'.repeat(160);
        const res = validateUpcomingRoutes({ origen: str160, destino: 'B' });
        assert.strictEqual(res.origen, str160);

        const str161 = 'A'.repeat(161);
        assert.throws(() => validateUpcomingRoutes({ origen: str161, destino: 'B' }), { code: 'VALIDATION_ERROR' });
    });

    await t.test('accepts list of 100 items and rejects 101', () => {
        const list100 = Array(100).fill('A');
        const res = validateUpcomingRoutes({ origen: list100, destino: 'B' });
        assert.strictEqual(res.origen.length, 100);

        const list101 = Array(101).fill('A');
        assert.throws(() => validateUpcomingRoutes({ origen: list101, destino: 'B' }), { code: 'VALIDATION_ERROR' });
    });

    await t.test('fails on string length limits (empty)', () => {
        assert.throws(() => validateUpcomingRoutes({ origen: '', destino: 'B' }), { code: 'VALIDATION_ERROR' });
    });

    await t.test('fails on array length limits (empty)', () => {
        assert.throws(() => validateUpcomingRoutes({ origen: [], destino: 'B' }), { code: 'VALIDATION_ERROR' });
    });

    await t.test('does not retain payload arrays (mutability)', () => {
        const payload = { origen: ['A'], destino: 'B' };
        const result = validateUpcomingRoutes(payload);
        payload.origen.push('C');
        assert.deepStrictEqual(result.origen, ['A']);
    });

    await t.test('handles frozen objects', () => {
        const payload = Object.freeze({ origen: 'A', destino: 'B' });
        const result = validateUpcomingRoutes(payload);
        assert.strictEqual(result.origen, 'A');
        assert.strictEqual(result.destino, 'B');
    });

    await t.test('handles frozen inputs arrays', () => {
        const payload = { origen: Object.freeze(['A']), destino: 'B' };
        const result = validateUpcomingRoutes(payload);
        assert.deepStrictEqual(result.origen, ['A']);
    });

    await t.test('does not leak payload data in errors', () => {
        try {
            validateUpcomingRoutes({ origen: 'SECRET_DATA_LEAK_TEST'.repeat(10), destino: 'B' });
            assert.fail('Should have thrown');
        } catch (e) {
            assert.strictEqual(e.code, 'VALIDATION_ERROR');
            assert.ok(!e.message.includes('SECRET_DATA_LEAK_TEST'));
        }
    });

    await t.test('handles hostile getters safely', () => {
        const hostile = {
            get origen() { throw new Error('Hostile'); },
            destino: 'B'
        };
        assert.throws(() => validateUpcomingRoutes(hostile), { code: 'VALIDATION_ERROR' });
    });

    await t.test('handles revoked proxies for arrays safely', () => {
        const { proxy, revoke } = Proxy.revocable([], {});
        revoke();
        assert.throws(() => validateUpcomingRoutes({ origen: proxy, destino: 'B' }), { code: 'VALIDATION_ERROR' });

        try {
            validateUpcomingRoutes({ origen: proxy, destino: 'B' });
        } catch (e) {
            assert.strictEqual(e.code, 'VALIDATION_ERROR');
            assert.ok(!e.message.includes('Cannot perform'));
        }
    });
});

test('dates and times', async (t) => {
    await t.test('normalizes time with seconds', () => {
        const res = validateUpcomingRoutes({ origen: 'A', destino: 'B', dropoff_date: '2026-09-16', dropoff_time: '08:00:59' });
        assert.strictEqual(res.dropoff_time, '08:00');
    });

    await t.test('fails on impossible dates', () => {
        const payload = { origen: 'A', destino: 'B', dropoff_date: '2026-02-29', dropoff_time: '10:00' };
        assert.throws(() => validateUpcomingRoutes(payload), { code: 'VALIDATION_ERROR' });
    });

    await t.test('validates real leap years and rejects fake ones', () => {
        const p1 = { origen: 'A', destino: 'B', dropoff_date: '2024-02-29', dropoff_time: '10:00' };
        const res = validateUpcomingRoutes(p1);
        assert.strictEqual(res.dropoff_date, '2024-02-29');

        const p2 = { origen: 'A', destino: 'B', dropoff_date: '2026-02-29', dropoff_time: '10:00' };
        assert.throws(() => validateUpcomingRoutes(p2), { code: 'VALIDATION_ERROR' });
    });

    await t.test('accepts exact 1900 and 2100 dates', () => {
        const p1 = { origen: 'A', destino: 'B', dropoff_date: '1900-01-01', dropoff_time: '10:00' };
        const res1 = validateUpcomingRoutes(p1);
        assert.strictEqual(res1.dropoff_date, '1900-01-01');

        const p2 = { origen: 'A', destino: 'B', dropoff_date: '2100-12-31', dropoff_time: '10:00' };
        const res2 = validateUpcomingRoutes(p2);
        assert.strictEqual(res2.dropoff_date, '2100-12-31');
    });

    await t.test('fails on years out of bounds', () => {
        const p1 = { origen: 'A', destino: 'B', dropoff_date: '1899-12-31', dropoff_time: '10:00' };
        assert.throws(() => validateUpcomingRoutes(p1), { code: 'VALIDATION_ERROR' });
        const p2 = { origen: 'A', destino: 'B', dropoff_date: '2101-01-01', dropoff_time: '10:00' };
        assert.throws(() => validateUpcomingRoutes(p2), { code: 'VALIDATION_ERROR' });
    });

    await t.test('fails on impossible time', () => {
        const payload = { origen: 'A', destino: 'B', dropoff_date: '2026-10-10', dropoff_time: '24:00' };
        assert.throws(() => validateUpcomingRoutes(payload), { code: 'VALIDATION_ERROR' });
        const payload2 = { origen: 'A', destino: 'B', dropoff_date: '2026-10-10', dropoff_time: '10:60' };
        assert.throws(() => validateUpcomingRoutes(payload2), { code: 'VALIDATION_ERROR' });
    });

    await t.test('UTC date independent of TZ', () => {
        const originalTz = process.env.TZ;
        const tzs = ['Pacific/Apia', 'America/New_York', 'Asia/Tokyo'];
        try {
            for (const tz of tzs) {
                process.env.TZ = tz;
                // Apia skipped Dec 30 2011
                const payload = { origen: 'A', destino: 'B', dropoff_date: '2011-12-30', dropoff_time: '10:00' };
                const res = validateUpcomingRoutes(payload);
                assert.strictEqual(res.dropoff_date, '2011-12-30', `Failed in TZ ${tz}`);
            }
        } finally {
            process.env.TZ = originalTz;
        }
    });
});

test('validateMunicipalityRoutes', async (t) => {
    await t.test('valid payload with array destinos', () => {
        const payload = { origen: 'A', destinos: ['B', 'C'] };
        const result = validateMunicipalityRoutes(payload);
        assert.strictEqual(result.origen, 'A');
        assert.deepStrictEqual(result.destinos, ['B', 'C']);
    });

    await t.test('fails if missing parameters or destinos is not array', () => {
        assert.throws(() => validateMunicipalityRoutes({ origen: 'A', destinos: 'B' }), { code: 'VALIDATION_ERROR', message: 'Missing parameters or destinos is not an array' });
        assert.throws(() => validateMunicipalityRoutes({ origen: 'A' }), { code: 'VALIDATION_ERROR', message: 'Missing parameters or destinos is not an array' });
    });

    await t.test('rejects arrival_date when present and invalid (e.g. false, 0)', () => {
        assert.throws(() => validateMunicipalityRoutes({ origen: 'A', destinos: ['B'], arrival_date: false }), { code: 'VALIDATION_ERROR' });
        assert.throws(() => validateMunicipalityRoutes({ origen: 'A', destinos: ['B'], arrival_date: 0 }), { code: 'VALIDATION_ERROR' });
    });

    await t.test('arrival date cannot be before dropoff date', () => {
        const payload = { origen: 'A', destinos: ['B'], dropoff_date: '2026-09-16', dropoff_time: '10:00', arrival_date: '2026-09-15' };
        assert.throws(() => validateMunicipalityRoutes(payload), { code: 'VALIDATION_ERROR' });
    });

    await t.test('arrival date cannot be before dropoff date even if time is missing', () => {
        const payload = { origen: 'A', destinos: ['B'], dropoff_date: '2026-09-16', arrival_date: '2026-09-15' };
        assert.throws(() => validateMunicipalityRoutes(payload), { code: 'VALIDATION_ERROR', message: 'arrival_date cannot be before dropoff_date' });
    });

    await t.test('arrival date can be same as dropoff date or posterior even if time is missing', () => {
        const payload1 = { origen: 'A', destinos: ['B'], dropoff_date: '2026-09-16', arrival_date: '2026-09-16' };
        const result1 = validateMunicipalityRoutes(payload1);
        assert.strictEqual(result1.arrival_date, '2026-09-16');

        const payload2 = { origen: 'A', destinos: ['B'], dropoff_date: '2026-09-16', arrival_date: '2026-09-17' };
        const result2 = validateMunicipalityRoutes(payload2);
        assert.strictEqual(result2.arrival_date, '2026-09-17');
    });

    await t.test('reads a supplied dropoff date only once before comparing arrival', () => {
        let reads = 0;
        const payload = {
            origen: 'A',
            destinos: ['B'],
            get dropoff_date() {
                reads++;
                return reads === 1 ? '2026-09-16' : '2026-09-14';
            },
            arrival_date: '2026-09-15'
        };
        assert.throws(() => validateMunicipalityRoutes(payload), {
            code: 'VALIDATION_ERROR',
            message: 'arrival_date cannot be before dropoff_date'
        });
        assert.strictEqual(reads, 1);
    });

    await t.test('arrival date can be same as dropoff date', () => {
        const payload = { origen: 'A', destinos: ['B'], dropoff_date: '2026-09-16', dropoff_time: '10:00', arrival_date: '2026-09-16' };
        const result = validateMunicipalityRoutes(payload);
        assert.strictEqual(result.arrival_date, '2026-09-16');
    });
});

test('validateSearchFlights', async (t) => {
    await t.test('valid payload', () => {
        const payload = { origen_municipio: 'A', destino_municipio: 'B' };
        const result = validateSearchFlights(payload);
        assert.strictEqual(result.origen_municipio, 'A');
        assert.strictEqual(result.destino_municipio, 'B');
    });

    await t.test('fails if missing origin or destination municipality', () => {
        assert.throws(() => validateSearchFlights({ origen_municipio: 'A' }), { code: 'VALIDATION_ERROR', message: 'Missing origin or destination' });
    });

    await t.test('rejects optional departamentos when present and invalid (e.g. false, 0)', () => {
        assert.throws(() => validateSearchFlights({ origen_municipio: 'A', destino_municipio: 'B', origen_departamento: false }), { code: 'VALIDATION_ERROR' });
        assert.throws(() => validateSearchFlights({ origen_municipio: 'A', destino_municipio: 'B', destino_departamento: 0 }), { code: 'VALIDATION_ERROR' });
    });

    await t.test('ignores extra fields', () => {
        const payload = { origen_municipio: 'A', destino_municipio: 'B', extra: 'bad' };
        const result = validateSearchFlights(payload);
        assert.strictEqual(result.extra, undefined);
    });
});
