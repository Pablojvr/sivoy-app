'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
    parseIsoDateOnly,
    addDays,
    weekday,
    compare,
    toIsoDate
} = require('../src/core/eta/date.js');

test('parseIsoDateOnly', async (t) => {
    await t.test('valid dates', () => {
        const d = parseIsoDateOnly('2023-10-15');
        assert.deepStrictEqual(d, { year: 2023, month: 10, day: 15 });
        assert.ok(Object.isFrozen(d));
    });

    await t.test('leap year valid', () => {
        const d = parseIsoDateOnly('2024-02-29');
        assert.deepStrictEqual(d, { year: 2024, month: 2, day: 29 });
    });

    await t.test('invalid leap year', () => {
        assert.throws(() => parseIsoDateOnly('2023-02-29'), RangeError);
    });

    await t.test('impossible dates', () => {
        assert.throws(() => parseIsoDateOnly('2023-13-01'), RangeError);
        assert.throws(() => parseIsoDateOnly('2023-00-01'), RangeError);
        assert.throws(() => parseIsoDateOnly('2023-10-32'), RangeError);
        assert.throws(() => parseIsoDateOnly('2023-04-31'), RangeError);
    });

    await t.test('malformed format', () => {
        assert.throws(() => parseIsoDateOnly('10-15-2023'), TypeError);
        assert.throws(() => parseIsoDateOnly('2023/10/15'), TypeError);
        assert.throws(() => parseIsoDateOnly(null), TypeError);
    });
});

test('addDays', async (t) => {
    await t.test('add across month', () => {
        const d = { year: 2023, month: 10, day: 30 };
        const d2 = addDays(d, 5);
        assert.deepStrictEqual(d2, { year: 2023, month: 11, day: 4 });
        assert.ok(Object.isFrozen(d2));
    });

    await t.test('add across year', () => {
        const d = { year: 2023, month: 12, day: 30 };
        const d2 = addDays(d, 3);
        assert.deepStrictEqual(d2, { year: 2024, month: 1, day: 2 });
    });

    await t.test('add across leap year', () => {
        const d = { year: 2024, month: 2, day: 28 };
        const d2 = addDays(d, 2);
        assert.deepStrictEqual(d2, { year: 2024, month: 3, day: 1 });
    });

    await t.test('subtract days', () => {
        const d = { year: 2023, month: 3, day: 2 };
        const d2 = addDays(d, -5);
        assert.deepStrictEqual(d2, { year: 2023, month: 2, day: 25 });
    });

    await t.test('immutability', () => {
        const d = { year: 2023, month: 10, day: 15 };
        Object.freeze(d);
        addDays(d, 1);
        assert.deepStrictEqual(d, { year: 2023, month: 10, day: 15 });
    });

    await t.test('invalid days', () => {
        const d = { year: 2023, month: 10, day: 15 };
        assert.throws(() => addDays(d, 1.5), TypeError);
        assert.throws(() => addDays(d, '1'), TypeError);
    });
    
    await t.test('malformed civil date', () => {
        assert.throws(() => addDays({ year: 2023, month: 10 }, 1), TypeError);
        assert.throws(() => addDays({ year: '2023', month: 10, day: 15 }, 1), TypeError);
    });
});

test('weekday', async (t) => {
    await t.test('returns correct weekday', () => {
        // 2023-10-15 is Sunday (0)
        assert.strictEqual(weekday({ year: 2023, month: 10, day: 15 }), 0);
        // 2023-10-16 is Monday (1)
        assert.strictEqual(weekday({ year: 2023, month: 10, day: 16 }), 1);
        // 2023-10-21 is Saturday (6)
        assert.strictEqual(weekday({ year: 2023, month: 10, day: 21 }), 6);
    });
});

test('compare', async (t) => {
    await t.test('less than', () => {
        assert.ok(compare({ year: 2023, month: 10, day: 15 }, { year: 2023, month: 10, day: 16 }) < 0);
        assert.ok(compare({ year: 2023, month: 9, day: 15 }, { year: 2023, month: 10, day: 15 }) < 0);
        assert.ok(compare({ year: 2022, month: 10, day: 15 }, { year: 2023, month: 10, day: 15 }) < 0);
    });

    await t.test('greater than', () => {
        assert.ok(compare({ year: 2023, month: 10, day: 16 }, { year: 2023, month: 10, day: 15 }) > 0);
    });

    await t.test('equal', () => {
        assert.strictEqual(compare({ year: 2023, month: 10, day: 15 }, { year: 2023, month: 10, day: 15 }), 0);
    });
});

test('toIsoDate', async (t) => {
    await t.test('formats correctly', () => {
        assert.strictEqual(toIsoDate({ year: 2023, month: 10, day: 15 }), '2023-10-15');
        assert.strictEqual(toIsoDate({ year: 2023, month: 1, day: 5 }), '2023-01-05');
    });

    await t.test('validates input', () => {
        assert.throws(() => toIsoDate({ year: 2023, month: 13, day: 1 }), RangeError);
    });
});
