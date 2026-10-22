const test = require('node:test');
const assert = require('node:assert/strict');
const { OFFICIAL_ENTRY_STATUS: S, calculateOfficialEntry } = require('../src/core/eta/official-entry');

test('official-entry core', async (t) => {
    const today = { year: 2024, month: 2, day: 20 }; // Tuesday
    const nextWeek = { year: 2024, month: 2, day: 27 };
    const tomorrow = { year: 2024, month: 2, day: 21 };

    const s1 = { weekday: 2, openTime: '08:00', closeTime: '18:00' };
    const s2 = { weekday: 2, openTime: '08:00', closeTime: '12:00' };
    const s3 = { weekday: 2, openTime: '14:00', closeTime: '18:00' };
    const s4 = { weekday: 3, openTime: '08:00', closeTime: '18:00' };

    const base = { isPin: false, dropoffDate: today, dropoffTime: '10:00', schedules: [], today };

    const cases = [
        [
            'PIN',
            { isPin: true },
            { status: S.PIN, officialDate: today }
        ],
        [
            'ACTIVE_TODAY',
            { schedules: [s1] },
            { status: S.ACTIVE_TODAY, officialDate: today }
        ],
        [
            'ACTIVE_FUTURE',
            { dropoffDate: nextWeek, schedules: [s1] },
            { status: S.ACTIVE_FUTURE, officialDate: nextWeek }
        ],
        [
            'exact close',
            { dropoffTime: '18:00', schedules: [s1] },
            { status: S.ACTIVE_TODAY, officialDate: today }
        ],
        [
            'split second interval',
            { dropoffTime: '15:00', schedules: [s2, s3] },
            { status: S.ACTIVE_TODAY, officialDate: today }
        ],
        [
            'between intervals',
            { dropoffTime: '13:00', schedules: [s2, s3] },
            {
                status: S.BEFORE_NEXT_INTERVAL,
                officialDate: today,
                nextInterval: { openTime: '14:00', closeTime: '18:00' }
            }
        ],
        [
            'before next interval',
            { dropoffTime: '07:00', schedules: [s1] },
            {
                status: S.BEFORE_NEXT_INTERVAL,
                officialDate: today,
                nextInterval: { openTime: '08:00', closeTime: '18:00' }
            }
        ],
        [
            'closed until next day (day 1)',
            { dropoffTime: '19:00', schedules: [s1, s4] },
            { status: S.CLOSED_UNTIL_NEXT_DAY, officialDate: tomorrow }
        ],
        [
            'closed until next day (day 7)',
            { dropoffTime: '19:00', schedules: [s1] },
            { status: S.CLOSED_UNTIL_NEXT_DAY, officialDate: nextWeek }
        ],
        [
            'no operating days',
            { dropoffTime: '19:00' },
            { status: S.NO_OPERATING_DAYS, officialDate: null }
        ]
    ];

    for (const [name, input, expectedResult] of cases) {
        await t.test(name, () => assert.deepEqual(calculateOfficialEntry({ ...base, ...input }), expectedResult));
    }

    await t.test('schedule input is not mutated', () => {
        const input = { ...base, dropoffTime: '13:00', schedules: [s3, s2] };
        const copy = JSON.parse(JSON.stringify(input.schedules));
        calculateOfficialEntry(input);
        assert.deepEqual(input.schedules, copy);
    });

    await t.test('result is deeply immutable and detached', () => {
        'use strict';
        const input = { ...base, dropoffTime: '07:00', schedules: [s1] };
        const result = calculateOfficialEntry(input);

        assert.notStrictEqual(result.officialDate, today);
        assert.notStrictEqual(result.nextInterval, s1);
        assert.ok(Object.isFrozen(result));
        assert.ok(Object.isFrozen(result.officialDate));
        assert.ok(Object.isFrozen(result.nextInterval));

        assert.throws(() => { result.status = 'X'; }, TypeError);
        assert.throws(() => { result.officialDate.year = 2025; }, TypeError);
        assert.throws(() => { result.nextInterval.openTime = '09:00'; }, TypeError);
    });
});
