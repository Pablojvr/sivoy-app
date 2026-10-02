'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { compareEtaSnapshots } = require('../src/core/eta/eta-parity-comparator');

function createCanonicalSnapshot(custom = {}) {
  const base = {
    officialEntry: {
      status: 'open',
      officialDate: '2026-09-07',
      nextInterval: { openTime: '09:00', closeTime: '16:00' }
    },
    routeValidation: {
      status: 'possible',
      cutoffDate: '2026-09-06'
    },
    projectedRoutes: [
      {
        date: '2026-09-08',
        intervals: [
          { openTime: '08:00', closeTime: '12:00' },
          { openTime: '13:00', closeTime: '17:00' }
        ]
      }
    ]
  };

  return {
    officialEntry: {
      ...base.officialEntry,
      ...(custom.officialEntry || {})
    },
    routeValidation: custom.routeValidation !== undefined
      ? custom.routeValidation
      : base.routeValidation,
    projectedRoutes: custom.projectedRoutes !== undefined
      ? custom.projectedRoutes
      : base.projectedRoutes
  };
}

describe('T43a - compareEtaSnapshots: Exact Match', () => {
  test('returns matches: true and empty differences for identical canonical snapshots', () => {
    const expected = createCanonicalSnapshot();
    const actual = createCanonicalSnapshot();

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, true);
    assert.deepEqual(result.differences, []);
  });

  test('returns matches: true when routeValidation is null in both snapshots', () => {
    const expected = createCanonicalSnapshot({ routeValidation: null });
    const actual = createCanonicalSnapshot({ routeValidation: null });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, true);
    assert.deepEqual(result.differences, []);
  });

  test('returns matches: true when officialDate and nextInterval are null in both snapshots', () => {
    const expected = createCanonicalSnapshot({
      officialEntry: { status: 'closed', officialDate: null, nextInterval: null }
    });
    const actual = createCanonicalSnapshot({
      officialEntry: { status: 'closed', officialDate: null, nextInterval: null }
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, true);
    assert.deepEqual(result.differences, []);
  });

  test('returns matches: true when projectedRoutes is empty in both snapshots', () => {
    const expected = createCanonicalSnapshot({ projectedRoutes: [] });
    const actual = createCanonicalSnapshot({ projectedRoutes: [] });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, true);
    assert.deepEqual(result.differences, []);
  });

  test('returns matches: true with multiple routes and multiple intervals', () => {
    const complexRoutes = [
      {
        date: '2026-09-08',
        intervals: [{ openTime: '08:00', closeTime: '12:00' }]
      },
      {
        date: '2026-09-09',
        intervals: [
          { openTime: '09:00', closeTime: '13:00' },
          { openTime: '14:00', closeTime: '18:00' }
        ]
      }
    ];

    const expected = createCanonicalSnapshot({ projectedRoutes: complexRoutes });
    const actual = createCanonicalSnapshot({ projectedRoutes: complexRoutes });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, true);
    assert.deepEqual(result.differences, []);
  });
});

describe('T43a - compareEtaSnapshots: Value Changes (kind: "changed")', () => {
  test('detects changed officialEntry.status', () => {
    const expected = createCanonicalSnapshot({ officialEntry: { status: 'open' } });
    const actual = createCanonicalSnapshot({ officialEntry: { status: 'closed' } });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'officialEntry.status',
      kind: 'changed',
      expected: 'open',
      actual: 'closed'
    });
  });

  test('detects changed officialEntry.officialDate', () => {
    const expected = createCanonicalSnapshot({ officialEntry: { officialDate: '2026-09-07' } });
    const actual = createCanonicalSnapshot({ officialEntry: { officialDate: '2026-09-08' } });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'officialEntry.officialDate',
      kind: 'changed',
      expected: '2026-09-07',
      actual: '2026-09-08'
    });
  });

  test('detects changed officialEntry.nextInterval times', () => {
    const expected = createCanonicalSnapshot({
      officialEntry: { nextInterval: { openTime: '09:00', closeTime: '16:00' } }
    });
    const actual = createCanonicalSnapshot({
      officialEntry: { nextInterval: { openTime: '10:00', closeTime: '16:00' } }
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'officialEntry.nextInterval.openTime',
      kind: 'changed',
      expected: '09:00',
      actual: '10:00'
    });
  });

  test('detects changed routeValidation.status and cutoffDate', () => {
    const expected = createCanonicalSnapshot({
      routeValidation: { status: 'possible', cutoffDate: '2026-09-06' }
    });
    const actual = createCanonicalSnapshot({
      routeValidation: { status: 'cutoff_passed', cutoffDate: '2026-09-05' }
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 2);
    assert.deepEqual(result.differences[0], {
      path: 'routeValidation.cutoffDate',
      kind: 'changed',
      expected: '2026-09-06',
      actual: '2026-09-05'
    });
    assert.deepEqual(result.differences[1], {
      path: 'routeValidation.status',
      kind: 'changed',
      expected: 'possible',
      actual: 'cutoff_passed'
    });
  });

  test('detects routeValidation changed between object and null', () => {
    const expected = createCanonicalSnapshot({
      routeValidation: { status: 'possible', cutoffDate: '2026-09-06' }
    });
    const actual = createCanonicalSnapshot({ routeValidation: null });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'routeValidation',
      kind: 'changed',
      expected: { status: 'possible', cutoffDate: '2026-09-06' },
      actual: null
    });
  });

  test('detects changed projectedRoutes date and interval times', () => {
    const expected = createCanonicalSnapshot({
      projectedRoutes: [
        {
          date: '2026-09-08',
          intervals: [{ openTime: '08:00', closeTime: '12:00' }]
        }
      ]
    });
    const actual = createCanonicalSnapshot({
      projectedRoutes: [
        {
          date: '2026-09-08',
          intervals: [{ openTime: '08:30', closeTime: '12:00' }]
        }
      ]
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'projectedRoutes[0].intervals[0].openTime',
      kind: 'changed',
      expected: '08:00',
      actual: '08:30'
    });
  });
});

describe('T43a - compareEtaSnapshots: Missing Fields (kind: "missing")', () => {
  test('detects missing property inside officialEntry', () => {
    const expected = createCanonicalSnapshot();
    const actual = createCanonicalSnapshot();
    delete actual.officialEntry.status;

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'officialEntry.status',
      kind: 'missing',
      expected: 'open'
    });
  });

  test('detects missing routeValidation when expected is present and actual omits it', () => {
    const expected = createCanonicalSnapshot({
      routeValidation: { status: 'possible', cutoffDate: '2026-09-06' }
    });
    const actual = createCanonicalSnapshot();
    delete actual.routeValidation;

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'routeValidation',
      kind: 'missing',
      expected: { status: 'possible', cutoffDate: '2026-09-06' }
    });
  });

  test('detects missing route element in projectedRoutes', () => {
    const expected = createCanonicalSnapshot({
      projectedRoutes: [
        { date: '2026-09-08', intervals: [{ openTime: '08:00', closeTime: '12:00' }] },
        { date: '2026-09-09', intervals: [{ openTime: '09:00', closeTime: '13:00' }] }
      ]
    });
    const actual = createCanonicalSnapshot({
      projectedRoutes: [
        { date: '2026-09-08', intervals: [{ openTime: '08:00', closeTime: '12:00' }] }
      ]
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'projectedRoutes[1]',
      kind: 'missing',
      expected: { date: '2026-09-09', intervals: [{ openTime: '09:00', closeTime: '13:00' }] }
    });
  });

  test('detects missing interval element inside route intervals', () => {
    const expected = createCanonicalSnapshot({
      projectedRoutes: [
        {
          date: '2026-09-08',
          intervals: [
            { openTime: '08:00', closeTime: '12:00' },
            { openTime: '13:00', closeTime: '17:00' }
          ]
        }
      ]
    });
    const actual = createCanonicalSnapshot({
      projectedRoutes: [
        {
          date: '2026-09-08',
          intervals: [
            { openTime: '08:00', closeTime: '12:00' }
          ]
        }
      ]
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'projectedRoutes[0].intervals[1]',
      kind: 'missing',
      expected: { openTime: '13:00', closeTime: '17:00' }
    });
  });
});

describe('T43a - compareEtaSnapshots: Unexpected Fields (kind: "unexpected")', () => {
  test('detects unexpected property at snapshot root', () => {
    const expected = createCanonicalSnapshot();
    const actual = { ...createCanonicalSnapshot(), unapprovedMetadata: 'extra' };

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'unapprovedMetadata',
      kind: 'unexpected',
      actual: 'extra'
    });
  });

  test('detects unexpected property inside officialEntry', () => {
    const expected = createCanonicalSnapshot();
    const actual = createCanonicalSnapshot();
    actual.officialEntry.legacyMessage = 'Abierto hoy';

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'officialEntry.legacyMessage',
      kind: 'unexpected',
      actual: 'Abierto hoy'
    });
  });

  test('reports __proto__ as data without polluting object prototypes', () => {
    const expected = createCanonicalSnapshot();
    const actual = createCanonicalSnapshot();
    Object.defineProperty(actual, '__proto__', {
      value: { polluted: true },
      enumerable: true
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.deepEqual(result.differences[0], {
      path: '__proto__',
      kind: 'unexpected',
      actual: { polluted: true }
    });
    assert.equal({}.polluted, undefined);
  });

  test('detects additional route element in projectedRoutes', () => {
    const expected = createCanonicalSnapshot({
      projectedRoutes: [
        { date: '2026-09-08', intervals: [{ openTime: '08:00', closeTime: '12:00' }] }
      ]
    });
    const actual = createCanonicalSnapshot({
      projectedRoutes: [
        { date: '2026-09-08', intervals: [{ openTime: '08:00', closeTime: '12:00' }] },
        { date: '2026-09-09', intervals: [{ openTime: '09:00', closeTime: '13:00' }] }
      ]
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'projectedRoutes[1]',
      kind: 'unexpected',
      actual: { date: '2026-09-09', intervals: [{ openTime: '09:00', closeTime: '13:00' }] }
    });
  });

  test('detects additional interval element inside route intervals', () => {
    const expected = createCanonicalSnapshot({
      projectedRoutes: [
        {
          date: '2026-09-08',
          intervals: [
            { openTime: '08:00', closeTime: '12:00' }
          ]
        }
      ]
    });
    const actual = createCanonicalSnapshot({
      projectedRoutes: [
        {
          date: '2026-09-08',
          intervals: [
            { openTime: '08:00', closeTime: '12:00' },
            { openTime: '13:00', closeTime: '17:00' }
          ]
        }
      ]
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.equal(result.differences.length, 1);
    assert.deepEqual(result.differences[0], {
      path: 'projectedRoutes[0].intervals[1]',
      kind: 'unexpected',
      actual: { openTime: '13:00', closeTime: '17:00' }
    });
  });
});

describe('T43a - compareEtaSnapshots: Order Sensitivity', () => {
  test('detects order changes in projectedRoutes as positional differences', () => {
    const routeA = { date: '2026-09-08', intervals: [{ openTime: '08:00', closeTime: '12:00' }] };
    const routeB = { date: '2026-09-09', intervals: [{ openTime: '09:00', closeTime: '13:00' }] };

    const expected = createCanonicalSnapshot({ projectedRoutes: [routeA, routeB] });
    const actual = createCanonicalSnapshot({ projectedRoutes: [routeB, routeA] });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.ok(result.differences.length > 0);
    assert.ok(result.differences.some(d => d.path.startsWith('projectedRoutes[0]')));
    assert.ok(result.differences.some(d => d.path.startsWith('projectedRoutes[1]')));
  });

  test('detects order changes in intervals inside a route', () => {
    const intervalA = { openTime: '08:00', closeTime: '12:00' };
    const intervalB = { openTime: '13:00', closeTime: '17:00' };

    const expected = createCanonicalSnapshot({
      projectedRoutes: [{ date: '2026-09-08', intervals: [intervalA, intervalB] }]
    });
    const actual = createCanonicalSnapshot({
      projectedRoutes: [{ date: '2026-09-08', intervals: [intervalB, intervalA] }]
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.ok(result.differences.length > 0);
    assert.ok(result.differences.some(d => d.path.startsWith('projectedRoutes[0].intervals[0]')));
    assert.ok(result.differences.some(d => d.path.startsWith('projectedRoutes[0].intervals[1]')));
  });
});

describe('T43a - compareEtaSnapshots: Stable Ordering by Path', () => {
  test('sorts differences stably and deterministically by path in lexicographical order', () => {
    const expected = createCanonicalSnapshot({
      officialEntry: { status: 'open' },
      routeValidation: { status: 'possible', cutoffDate: '2026-09-06' },
      projectedRoutes: [
        { date: '2026-09-08', intervals: [{ openTime: '08:00', closeTime: '12:00' }] }
      ]
    });
    const actual = createCanonicalSnapshot({
      officialEntry: { status: 'closed' },
      routeValidation: { status: 'cutoff_passed', cutoffDate: '2026-09-05' },
      projectedRoutes: [
        { date: '2026-09-09', intervals: [{ openTime: '09:00', closeTime: '12:00' }] }
      ]
    });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    assert.ok(result.differences.length >= 3);

    const paths = result.differences.map(d => d.path);
    const sortedPaths = [...paths].sort();

    assert.deepEqual(paths, sortedPaths);
  });
});

describe('T43a - compareEtaSnapshots: Deep Immutability & Defensive Isolation', () => {
  test('returns deeply frozen result and differences array', () => {
    const expected = createCanonicalSnapshot({ officialEntry: { status: 'open' } });
    const actual = createCanonicalSnapshot({ officialEntry: { status: 'closed' } });

    const result = compareEtaSnapshots(expected, actual);

    assert.ok(Object.isFrozen(result), 'result must be frozen');
    assert.ok(Object.isFrozen(result.differences), 'differences array must be frozen');

    assert.throws(() => {
      result.matches = true;
    }, TypeError);

    assert.throws(() => {
      result.differences.push({ path: 'tamper', kind: 'changed' });
    }, TypeError);

    for (const diff of result.differences) {
      assert.ok(Object.isFrozen(diff), 'each difference object must be frozen');
      assert.throws(() => {
        diff.path = 'modified';
      }, TypeError);
    }
  });

  test('does not retain mutable references to inputs inside differences', () => {
    const expectedRoute = { date: '2026-09-08', intervals: [{ openTime: '08:00', closeTime: '12:00' }] };
    const expected = createCanonicalSnapshot({ projectedRoutes: [expectedRoute] });
    const actual = createCanonicalSnapshot({ projectedRoutes: [] });

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, false);
    const missingDiff = result.differences.find(d => d.path === 'projectedRoutes[0]');
    assert.ok(missingDiff);

    // Mutating the caller's input object after comparison must not alter the recorded difference
    expectedRoute.date = '2099-01-01';
    assert.equal(missingDiff.expected.date, '2026-09-08');
    assert.ok(Object.isFrozen(missingDiff.expected));
    assert.ok(Object.isFrozen(missingDiff.expected.intervals));
    assert.ok(Object.isFrozen(missingDiff.expected.intervals[0]));
  });

  test('does not mutate input snapshots', () => {
    const expected = createCanonicalSnapshot();
    const actual = createCanonicalSnapshot({ officialEntry: { status: 'closed' } });

    const expectedClone = JSON.parse(JSON.stringify(expected));
    const actualClone = JSON.parse(JSON.stringify(actual));

    compareEtaSnapshots(expected, actual);

    assert.deepEqual(expected, expectedClone);
    assert.deepEqual(actual, actualClone);
  });

  test('safely operates on pre-frozen input objects without mutating them', () => {
    const expected = Object.freeze(createCanonicalSnapshot());
    const actual = Object.freeze(createCanonicalSnapshot());

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, true);
  });

  test('compares a null-prototype snapshot consistently with a standard object', () => {
    const expected = Object.assign(Object.create(null), createCanonicalSnapshot());
    const actual = createCanonicalSnapshot();

    const result = compareEtaSnapshots(expected, actual);

    assert.equal(result.matches, true);
    assert.deepEqual(result.differences, []);
  });
});

describe('T43a - compareEtaSnapshots: Input Validation & Generic TypeError', () => {
  const validSnapshot = createCanonicalSnapshot();

  test('throws TypeError on null expected or actual', () => {
    assert.throws(() => compareEtaSnapshots(null, validSnapshot), TypeError);
    assert.throws(() => compareEtaSnapshots(validSnapshot, null), TypeError);
  });

  test('throws TypeError on undefined expected or actual', () => {
    assert.throws(() => compareEtaSnapshots(undefined, validSnapshot), TypeError);
    assert.throws(() => compareEtaSnapshots(validSnapshot, undefined), TypeError);
  });

  test('throws TypeError when array is supplied as root', () => {
    assert.throws(() => compareEtaSnapshots([], validSnapshot), TypeError);
    assert.throws(() => compareEtaSnapshots(validSnapshot, []), TypeError);
  });

  test('throws TypeError on primitive root inputs', () => {
    assert.throws(() => compareEtaSnapshots('not-an-object', validSnapshot), TypeError);
    assert.throws(() => compareEtaSnapshots(validSnapshot, 12345), TypeError);
    assert.throws(() => compareEtaSnapshots(true, validSnapshot), TypeError);
  });

  test('throws TypeError on non-serializable inputs like circular references', () => {
    const circular = createCanonicalSnapshot();
    circular.self = circular;

    assert.throws(() => compareEtaSnapshots(circular, validSnapshot), TypeError);
    assert.throws(() => compareEtaSnapshots(validSnapshot, circular), TypeError);
  });

  test('throws TypeError on non-serializable values like functions or BigInt', () => {
    const withFn = { ...createCanonicalSnapshot(), fn: () => {} };
    assert.throws(() => compareEtaSnapshots(withFn, validSnapshot), TypeError);

    const withBigInt = { ...createCanonicalSnapshot(), num: BigInt(42) };
    assert.throws(() => compareEtaSnapshots(withBigInt, validSnapshot), TypeError);
  });

  test('throws TypeError on undefined, non-finite numbers, non-plain objects and sparse arrays', () => {
    assert.throws(
      () => compareEtaSnapshots({ ...createCanonicalSnapshot(), value: undefined }, validSnapshot),
      TypeError
    );
    assert.throws(
      () => compareEtaSnapshots({ ...createCanonicalSnapshot(), value: Number.NaN }, validSnapshot),
      TypeError
    );
    assert.throws(
      () => compareEtaSnapshots({ ...createCanonicalSnapshot(), value: new Date() }, validSnapshot),
      TypeError
    );
    const sparseRoutes = [];
    sparseRoutes.length = 1;
    assert.throws(
      () => compareEtaSnapshots(createCanonicalSnapshot({ projectedRoutes: sparseRoutes }), validSnapshot),
      TypeError
    );
  });

  test('rejects symbol keys and values', () => {
    const withSymbolKey = createCanonicalSnapshot();
    withSymbolKey[Symbol('private')] = 'hidden';
    assert.throws(() => compareEtaSnapshots(withSymbolKey, validSnapshot), TypeError);

    const withSymbolValue = { ...createCanonicalSnapshot(), value: Symbol('private') };
    assert.throws(() => compareEtaSnapshots(withSymbolValue, validSnapshot), TypeError);
  });

  test('rejects array accessors without invoking them', () => {
    let accessorCalls = 0;
    const routes = [];
    Object.defineProperty(routes, '0', {
      get() {
        accessorCalls += 1;
        return { date: '2026-09-08', intervals: [] };
      },
      enumerable: true
    });
    routes.length = 1;

    assert.throws(
      () => compareEtaSnapshots(createCanonicalSnapshot({ projectedRoutes: routes }), validSnapshot),
      TypeError
    );
    assert.equal(accessorCalls, 0);
  });

  test('ensures TypeError message is generic and does not leak payload values', () => {
    const sensitiveValue = 'SECRET_TOKEN_DO_NOT_LEAK_12345';
    try {
      compareEtaSnapshots(sensitiveValue, validSnapshot);
      assert.fail('Expected compareEtaSnapshots to throw');
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message.includes(sensitiveValue), false);
    }
  });
});
