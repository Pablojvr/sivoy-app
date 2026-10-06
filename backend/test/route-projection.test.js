'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    CUTOFF_TYPE,
    ROUTE_RULE_STATUS,
    getCutoffDate,
    validateDesiredDate,
    projectRoutes
} = require('../src/core/eta/route-projection');

const date1 = Object.freeze({ year: 2026, month: 9, day: 14 }); // Monday
const date2 = Object.freeze({ year: 2026, month: 9, day: 15 }); // Tuesday
const date3 = Object.freeze({ year: 2026, month: 9, day: 16 }); // Wednesday

describe('route-projection core', () => {
    describe('getCutoffDate', () => {
        it('should handle PREVIOUS_DAY', () => {
            const cutoff = getCutoffDate(date2, CUTOFF_TYPE.PREVIOUS_DAY, null);
            assert.deepStrictEqual(cutoff, date1);
        });

        it('should handle SAME_DAY', () => {
            const cutoff = getCutoffDate(date2, CUTOFF_TYPE.SAME_DAY, null);
            assert.deepStrictEqual(cutoff, date2);
            assert.notStrictEqual(cutoff, date2);
            assert.ok(Object.isFrozen(cutoff));
        });

        it('should handle WEEKDAY backward starting desired-1', () => {
            const cutoff = getCutoffDate(date2, CUTOFF_TYPE.WEEKDAY, 2);
            assert.deepStrictEqual(cutoff, { year: 2026, month: 9, day: 8 });
        });

        it('should fallback to previous day on unknown type', () => {
            const cutoff = getCutoffDate(date2, 'UNKNOWN', null);
            assert.deepStrictEqual(cutoff, date1);
        });

        it('falls back safely for an invalid weekday index', () => {
            const cutoff = getCutoffDate(date2, CUTOFF_TYPE.WEEKDAY, -1);
            assert.deepStrictEqual(cutoff, date1);
        });
    });

    describe('validateDesiredDate', () => {
        it('should return PIN status for pin destination', () => {
            const res = validateDesiredDate(true, [], date1, date2);
            assert.strictEqual(res.status, ROUTE_RULE_STATUS.PIN);
            assert.ok(Object.isFrozen(res));
            assert.strictEqual(res.cutoffDate, undefined);
        });

        it('should return NO_DELIVERY if no rule matches', () => {
            const res = validateDesiredDate(false, [{ deliveryWeekday: 1 }], date1, date2);
            assert.strictEqual(res.status, ROUTE_RULE_STATUS.NO_DELIVERY);
            assert.ok(Object.isFrozen(res));
            assert.strictEqual(res.cutoffDate, undefined);
        });

        it('should use first matching rule and return APPROVED if ingress <= cutoff', () => {
            const res = validateDesiredDate(false, [
                { deliveryWeekday: 1, cutoffType: CUTOFF_TYPE.PREVIOUS_DAY },
                { deliveryWeekday: 3, cutoffType: CUTOFF_TYPE.PREVIOUS_DAY }
            ], date1, date3);

            assert.strictEqual(res.status, ROUTE_RULE_STATUS.APPROVED);
            assert.deepStrictEqual(res.cutoffDate, date2);
            assert.ok(Object.isFrozen(res));
            assert.ok(Object.isFrozen(res.cutoffDate));
        });

        it('should reject if ingress > cutoff', () => {
            const res = validateDesiredDate(
                false,
                [{ deliveryWeekday: null, cutoffType: CUTOFF_TYPE.PREVIOUS_DAY }],
                date3,
                date2
            );
            assert.strictEqual(res.status, ROUTE_RULE_STATUS.REJECTED_CUTOFF);
            assert.deepStrictEqual(res.cutoffDate, date1);
            assert.ok(Object.isFrozen(res));
            assert.ok(Object.isFrozen(res.cutoffDate));
        });

        it('true first-match precedence with multiple rules', () => {
            const rules = [
                { deliveryWeekday: 3, cutoffType: CUTOFF_TYPE.PREVIOUS_DAY },
                { deliveryWeekday: null, cutoffType: CUTOFF_TYPE.SAME_DAY }
            ];
            const res1 = validateDesiredDate(false, rules, date3, date3);
            assert.strictEqual(res1.status, ROUTE_RULE_STATUS.REJECTED_CUTOFF);

            const rulesReversed = [
                { deliveryWeekday: null, cutoffType: CUTOFF_TYPE.SAME_DAY },
                { deliveryWeekday: 3, cutoffType: CUTOFF_TYPE.PREVIOUS_DAY }
            ];
            const res2 = validateDesiredDate(false, rulesReversed, date3, date3);
            assert.strictEqual(res2.status, ROUTE_RULE_STATUS.APPROVED);
        });
    });

    describe('projectRoutes', () => {
        it('pin without schedules => []', () => {
            const res = projectRoutes(true, [], [], date1, 3);
            assert.deepStrictEqual(res, []);
            assert.ok(Object.isFrozen(res));
        });

        it('pin with valid schedules => options', () => {
            const rules = []; const schedules = [
                { weekday: 1, openTime: '08:00', closeTime: '18:00' }
            ];
            const res = projectRoutes(true, rules, schedules, date1, 1);
            assert.strictEqual(res.length, 1);
            assert.deepStrictEqual(res[0].date, date1);
            assert.strictEqual(res[0].intervals[0].openTime, '08:00');
            assert.ok(Object.isFrozen(res));
        });

        it('should skip days with 0 public intervals or missing times', () => {
            const rules = [{ deliveryWeekday: null, cutoffType: CUTOFF_TYPE.PREVIOUS_DAY }];

            const schedules = [
                { weekday: 2, openTime: null, closeTime: '18:00' },
                { weekday: 3, openTime: '08:00', closeTime: '18:00' },
                { weekday: 3, openTime: '10:00', closeTime: '12:00' }
            ];

            const res = projectRoutes(false, rules, schedules, date1, 1);

            assert.strictEqual(res.length, 1);
            assert.deepStrictEqual(res[0].date, date3);
            assert.strictEqual(res[0].intervals[0].openTime, '08:00');
            assert.strictEqual(res[0].intervals[1].openTime, '10:00');
            assert.ok(Object.isFrozen(res));
            assert.ok(Object.isFrozen(res[0]));
            assert.ok(Object.isFrozen(res[0].intervals));
            assert.ok(Object.isFrozen(res[0].intervals[0]));
        });

        it('skips weekday with valid and incomplete interval', () => {
            const rules = [{ deliveryWeekday: null, cutoffType: CUTOFF_TYPE.PREVIOUS_DAY }];
            const schedules = [
                { weekday: 1, openTime: '08:00', closeTime: '18:00' },
                { weekday: 1, openTime: '10:00', closeTime: null },
                { weekday: 2, openTime: '08:00', closeTime: '12:00' }
            ];

            const res = projectRoutes(false, rules, schedules, date1, 1);
            assert.strictEqual(res.length, 1);
            assert.deepStrictEqual(res[0].date, date2);         });

        it('should preserve JS comparison for limit (0, negative, fractional, NaN, Infinity)', () => {
            const rules = [{ deliveryWeekday: null, cutoffType: CUTOFF_TYPE.SAME_DAY }];
            const schedules = [{ weekday: 1, openTime: '10:00', closeTime: '12:00' }];

            assert.strictEqual(projectRoutes(false, rules, schedules, date1, 0).length, 0);
            assert.strictEqual(projectRoutes(false, rules, schedules, date1, -5).length, 0);
            assert.strictEqual(projectRoutes(false, rules, schedules, date1, NaN).length, 0);
            assert.strictEqual(projectRoutes(false, rules, schedules, date1, 0.5).length, 1);

            const allSchedules = [0,1,2,3,4,5,6].map(w => ({ weekday: w, openTime: '08:00', closeTime: '17:00' }));
            const resInf = projectRoutes(false, rules, allSchedules, date1, Infinity);
            assert.strictEqual(resInf.length, 60);
        });

        it('deep immutability and no alias of inputs', () => {
            const rules = [{ deliveryWeekday: null, cutoffType: CUTOFF_TYPE.SAME_DAY }];
            const schedules = [
                { weekday: 1, openTime: '18:00', closeTime: '19:00' },
                { weekday: 1, openTime: '08:00', closeTime: '09:00' }
            ];
            const dateInput = { year: 2026, month: 9, day: 14 };

            const res = projectRoutes(false, rules, schedules, dateInput, 1);

            assert.ok(Object.isFrozen(res));
            assert.ok(Object.isFrozen(res[0]));
            assert.ok(Object.isFrozen(res[0].date));
            assert.ok(Object.isFrozen(res[0].intervals));
            assert.ok(Object.isFrozen(res[0].intervals[0]));

            assert.strictEqual(Object.isFrozen(rules), false);
            assert.strictEqual(Object.isFrozen(rules[0]), false);
            assert.strictEqual(Object.isFrozen(schedules), false);
            assert.strictEqual(Object.isFrozen(schedules[0]), false);
            assert.strictEqual(Object.isFrozen(dateInput), false);

            schedules[0].openTime = '20:00';
            assert.strictEqual(res[0].intervals[1].openTime, '18:00');
            dateInput.day = 15;
            assert.strictEqual(res[0].date.day, 14);
        });
    });
});
