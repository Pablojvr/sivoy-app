'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createEtaShadowTelemetry,
  defaultEtaShadowTelemetry
} = require('../src/core/eta/eta-shadow-telemetry');

describe('T43c2d1 — ETA Shadow Telemetry', () => {

  beforeEach(() => {
    defaultEtaShadowTelemetry.resetMetrics();
  });

  describe('1) CommonJS exports and public API surface', () => {

    test('exports createEtaShadowTelemetry function and defaultEtaShadowTelemetry object', () => {
      assert.strictEqual(typeof createEtaShadowTelemetry, 'function');
      assert.strictEqual(typeof defaultEtaShadowTelemetry, 'object');
      assert.notStrictEqual(defaultEtaShadowTelemetry, null);
    });

    test('exported module surface contains only createEtaShadowTelemetry and defaultEtaShadowTelemetry', () => {
      const exported = require('../src/core/eta/eta-shadow-telemetry');
      const keys = Object.keys(exported).sort();
      assert.deepStrictEqual(keys, ['createEtaShadowTelemetry', 'defaultEtaShadowTelemetry']);
    });

    test('instances and default singleton are Object.freeze and expose only recordEvent, getSnapshot, resetMetrics', () => {
      const customTelemetry = createEtaShadowTelemetry();

      for (const instance of [customTelemetry, defaultEtaShadowTelemetry]) {
        assert.strictEqual(Object.isFrozen(instance), true);
        assert.strictEqual(typeof instance.recordEvent, 'function');
        assert.strictEqual(typeof instance.getSnapshot, 'function');
        assert.strictEqual(typeof instance.resetMetrics, 'function');

        const methods = Object.keys(instance).sort();
        assert.deepStrictEqual(methods, ['getSnapshot', 'recordEvent', 'resetMetrics']);

        // Explicitly forbidden to expose onEvent alias
        assert.strictEqual(instance.onEvent, undefined);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(instance, 'onEvent'), false);

        // Attempting to mutate instance throws TypeError in strict mode
        assert.throws(() => {
          instance.newProperty = 'mutated';
        }, TypeError);
      }
    });

  });

  describe('2) Exact initial snapshot, deep freeze, and disconnection from internal state', () => {

    test('initial snapshot matches the exact approved contract', () => {
      const telemetry = createEtaShadowTelemetry();
      const snapshot = telemetry.getSnapshot();

      assert.deepStrictEqual(snapshot, {
        enqueued: 0,
        dropped: { QUEUE_FULL: 0 },
        match: 0,
        mismatch: 0,
        errors: { RUNNER: 0, LEGACY: 0, CURRENT: 0, COMPARE: 0 },
        invalidEvents: 0
      });
    });

    test('snapshot root and nested objects are deeply frozen', () => {
      const telemetry = createEtaShadowTelemetry();
      const snapshot = telemetry.getSnapshot();

      assert.strictEqual(Object.isFrozen(snapshot), true);
      assert.strictEqual(Object.isFrozen(snapshot.dropped), true);
      assert.strictEqual(Object.isFrozen(snapshot.errors), true);

      assert.throws(() => {
        snapshot.enqueued = 99;
      }, TypeError);

      assert.throws(() => {
        snapshot.dropped.QUEUE_FULL = 99;
      }, TypeError);

      assert.throws(() => {
        snapshot.errors.RUNNER = 99;
      }, TypeError);

      assert.throws(() => {
        snapshot.newKey = 'test';
      }, TypeError);
    });

    test('getSnapshot returns brand new object references on every call', () => {
      const telemetry = createEtaShadowTelemetry();
      const s1 = telemetry.getSnapshot();
      const s2 = telemetry.getSnapshot();

      assert.notStrictEqual(s1, s2);
      assert.notStrictEqual(s1.dropped, s2.dropped);
      assert.notStrictEqual(s1.errors, s2.errors);
      assert.deepStrictEqual(s1, s2);
    });

    test('snapshots are disconnected from internal state: subsequent events do not mutate past snapshots', () => {
      const telemetry = createEtaShadowTelemetry();
      const s1 = telemetry.getSnapshot();

      telemetry.recordEvent({ type: 'ENQUEUED' });
      telemetry.recordEvent({ type: 'MATCH' });
      telemetry.recordEvent({ type: 'DROPPED', reason: 'QUEUE_FULL' });
      telemetry.recordEvent({ type: 'ERROR', stage: 'RUNNER' });
      telemetry.recordEvent({ type: 'INVALID' });

      assert.strictEqual(s1.enqueued, 0);
      assert.strictEqual(s1.match, 0);
      assert.strictEqual(s1.dropped.QUEUE_FULL, 0);
      assert.strictEqual(s1.errors.RUNNER, 0);
      assert.strictEqual(s1.invalidEvents, 0);

      const s2 = telemetry.getSnapshot();
      assert.strictEqual(s2.enqueued, 1);
      assert.strictEqual(s2.match, 1);
      assert.strictEqual(s2.dropped.QUEUE_FULL, 1);
      assert.strictEqual(s2.errors.RUNNER, 1);
      assert.strictEqual(s2.invalidEvents, 1);
    });

  });

  describe('3) Valid event consumption and counter increments', () => {

    test('ENQUEUED increments enqueued counter only', () => {
      const telemetry = createEtaShadowTelemetry();
      telemetry.recordEvent({ type: 'ENQUEUED' });

      assert.deepStrictEqual(telemetry.getSnapshot(), {
        enqueued: 1,
        dropped: { QUEUE_FULL: 0 },
        match: 0,
        mismatch: 0,
        errors: { RUNNER: 0, LEGACY: 0, CURRENT: 0, COMPARE: 0 },
        invalidEvents: 0
      });
    });

    test('DROPPED with reason QUEUE_FULL increments dropped.QUEUE_FULL counter only', () => {
      const telemetry = createEtaShadowTelemetry();
      telemetry.recordEvent({ type: 'DROPPED', reason: 'QUEUE_FULL' });

      assert.deepStrictEqual(telemetry.getSnapshot(), {
        enqueued: 0,
        dropped: { QUEUE_FULL: 1 },
        match: 0,
        mismatch: 0,
        errors: { RUNNER: 0, LEGACY: 0, CURRENT: 0, COMPARE: 0 },
        invalidEvents: 0
      });
    });

    test('MATCH increments match counter only without divergence metrics', () => {
      const telemetry = createEtaShadowTelemetry();
      telemetry.recordEvent({ type: 'MATCH' });

      assert.deepStrictEqual(telemetry.getSnapshot(), {
        enqueued: 0,
        dropped: { QUEUE_FULL: 0 },
        match: 1,
        mismatch: 0,
        errors: { RUNNER: 0, LEGACY: 0, CURRENT: 0, COMPARE: 0 },
        invalidEvents: 0
      });
    });

    test('MISMATCH increments mismatch counter only', () => {
      const telemetry = createEtaShadowTelemetry();
      telemetry.recordEvent({ type: 'MISMATCH' });

      assert.deepStrictEqual(telemetry.getSnapshot(), {
        enqueued: 0,
        dropped: { QUEUE_FULL: 0 },
        match: 0,
        mismatch: 1,
        errors: { RUNNER: 0, LEGACY: 0, CURRENT: 0, COMPARE: 0 },
        invalidEvents: 0
      });
    });

    test('ERROR with stage RUNNER increments errors.RUNNER counter only', () => {
      const telemetry = createEtaShadowTelemetry();
      telemetry.recordEvent({ type: 'ERROR', stage: 'RUNNER' });

      assert.deepStrictEqual(telemetry.getSnapshot(), {
        enqueued: 0,
        dropped: { QUEUE_FULL: 0 },
        match: 0,
        mismatch: 0,
        errors: { RUNNER: 1, LEGACY: 0, CURRENT: 0, COMPARE: 0 },
        invalidEvents: 0
      });
    });

    test('ERROR with stage LEGACY increments errors.LEGACY counter only', () => {
      const telemetry = createEtaShadowTelemetry();
      telemetry.recordEvent({ type: 'ERROR', stage: 'LEGACY' });

      assert.deepStrictEqual(telemetry.getSnapshot(), {
        enqueued: 0,
        dropped: { QUEUE_FULL: 0 },
        match: 0,
        mismatch: 0,
        errors: { RUNNER: 0, LEGACY: 1, CURRENT: 0, COMPARE: 0 },
        invalidEvents: 0
      });
    });

    test('ERROR with stage CURRENT increments errors.CURRENT counter only', () => {
      const telemetry = createEtaShadowTelemetry();
      telemetry.recordEvent({ type: 'ERROR', stage: 'CURRENT' });

      assert.deepStrictEqual(telemetry.getSnapshot(), {
        enqueued: 0,
        dropped: { QUEUE_FULL: 0 },
        match: 0,
        mismatch: 0,
        errors: { RUNNER: 0, LEGACY: 0, CURRENT: 1, COMPARE: 0 },
        invalidEvents: 0
      });
    });

    test('ERROR with stage COMPARE increments errors.COMPARE counter only', () => {
      const telemetry = createEtaShadowTelemetry();
      telemetry.recordEvent({ type: 'ERROR', stage: 'COMPARE' });

      assert.deepStrictEqual(telemetry.getSnapshot(), {
        enqueued: 0,
        dropped: { QUEUE_FULL: 0 },
        match: 0,
        mismatch: 0,
        errors: { RUNNER: 0, LEGACY: 0, CURRENT: 0, COMPARE: 1 },
        invalidEvents: 0
      });
    });

    test('multiple repetitions of events increment counters cumulatively and independently', () => {
      const telemetry = createEtaShadowTelemetry();

      for (let i = 0; i < 5; i++) telemetry.recordEvent({ type: 'ENQUEUED' });
      for (let i = 0; i < 2; i++) telemetry.recordEvent({ type: 'DROPPED', reason: 'QUEUE_FULL' });
      for (let i = 0; i < 10; i++) telemetry.recordEvent({ type: 'MATCH' });
      for (let i = 0; i < 3; i++) telemetry.recordEvent({ type: 'MISMATCH' });
      telemetry.recordEvent({ type: 'ERROR', stage: 'RUNNER' });
      for (let i = 0; i < 2; i++) telemetry.recordEvent({ type: 'ERROR', stage: 'LEGACY' });
      for (let i = 0; i < 3; i++) telemetry.recordEvent({ type: 'ERROR', stage: 'CURRENT' });
      for (let i = 0; i < 4; i++) telemetry.recordEvent({ type: 'ERROR', stage: 'COMPARE' });

      assert.deepStrictEqual(telemetry.getSnapshot(), {
        enqueued: 5,
        dropped: { QUEUE_FULL: 2 },
        match: 10,
        mismatch: 3,
        errors: { RUNNER: 1, LEGACY: 2, CURRENT: 3, COMPARE: 4 },
        invalidEvents: 0
      });
    });

  });

  describe('4) Defensive handling of invalid and hostile inputs', () => {

    test('null and undefined increment invalidEvents exactly once without throwing', () => {
      const telemetry = createEtaShadowTelemetry();

      assert.doesNotThrow(() => telemetry.recordEvent(null));
      assert.strictEqual(telemetry.getSnapshot().invalidEvents, 1);

      assert.doesNotThrow(() => telemetry.recordEvent(undefined));
      assert.strictEqual(telemetry.getSnapshot().invalidEvents, 2);
    });

    test('primitives increment invalidEvents exactly once without throwing', () => {
      const telemetry = createEtaShadowTelemetry();
      const primitives = [
        0,
        1,
        -1,
        NaN,
        Infinity,
        '',
        'ENQUEUED',
        'MATCH',
        true,
        false,
        Symbol('event'),
        100n
      ];

      for (let i = 0; i < primitives.length; i++) {
        assert.doesNotThrow(() => telemetry.recordEvent(primitives[i]));
        assert.strictEqual(telemetry.getSnapshot().invalidEvents, i + 1);
      }
    });

    test('arrays and empty objects increment invalidEvents exactly once without throwing', () => {
      const telemetry = createEtaShadowTelemetry();

      telemetry.recordEvent([]);
      assert.strictEqual(telemetry.getSnapshot().invalidEvents, 1);

      telemetry.recordEvent(['ENQUEUED']);
      assert.strictEqual(telemetry.getSnapshot().invalidEvents, 2);

      telemetry.recordEvent({});
      assert.strictEqual(telemetry.getSnapshot().invalidEvents, 3);
    });

    test('unrecognized or malformed type increments invalidEvents', () => {
      const telemetry = createEtaShadowTelemetry();
      const invalidTypes = [
        { type: 'UNKNOWN' },
        { type: 'enqueued' }, // case-sensitive
        { type: 'match' },
        { type: 'mismatch' },
        { type: 'dropped' },
        { type: 'error' },
        { type: 123 },
        { type: null },
        { type: true },
        { type: {} },
        { type: [] }
      ];

      for (let i = 0; i < invalidTypes.length; i++) {
        telemetry.recordEvent(invalidTypes[i]);
        assert.strictEqual(telemetry.getSnapshot().invalidEvents, i + 1);
      }
    });

    test('DROPPED with missing, non-string, or disallowed reason increments invalidEvents', () => {
      const telemetry = createEtaShadowTelemetry();
      const invalidDropped = [
        { type: 'DROPPED' },
        { type: 'DROPPED', reason: undefined },
        { type: 'DROPPED', reason: null },
        { type: 'DROPPED', reason: 'queue_full' }, // lowercase
        { type: 'DROPPED', reason: 'QUEUE_TIMEOUT' },
        { type: 'DROPPED', reason: 'OVERFLOW' },
        { type: 'DROPPED', reason: 123 },
        { type: 'DROPPED', reason: { reason: 'QUEUE_FULL' } }
      ];

      for (let i = 0; i < invalidDropped.length; i++) {
        telemetry.recordEvent(invalidDropped[i]);
        assert.strictEqual(telemetry.getSnapshot().invalidEvents, i + 1);
        assert.strictEqual(telemetry.getSnapshot().dropped.QUEUE_FULL, 0);
      }
    });

    test('ERROR with missing, non-string, or disallowed stage increments invalidEvents', () => {
      const telemetry = createEtaShadowTelemetry();
      const invalidErrors = [
        { type: 'ERROR' },
        { type: 'ERROR', stage: undefined },
        { type: 'ERROR', stage: null },
        { type: 'ERROR', stage: 'runner' }, // lowercase
        { type: 'ERROR', stage: 'legacy' },
        { type: 'ERROR', stage: 'current' },
        { type: 'ERROR', stage: 'compare' },
        { type: 'ERROR', stage: 'DATABASE' },
        { type: 'ERROR', stage: 'HTTP' },
        { type: 'ERROR', stage: 'QUEUE_FULL' },
        { type: 'ERROR', stage: 123 },
        { type: 'ERROR', stage: {} }
      ];

      for (let i = 0; i < invalidErrors.length; i++) {
        telemetry.recordEvent(invalidErrors[i]);
        assert.strictEqual(telemetry.getSnapshot().invalidEvents, i + 1);
      }

      assert.deepStrictEqual(telemetry.getSnapshot().errors, {
        RUNNER: 0,
        LEGACY: 0,
        CURRENT: 0,
        COMPARE: 0
      });
    });

    test('hostile getters that throw are captured and increment invalidEvents exactly once', () => {
      const telemetry = createEtaShadowTelemetry();

      const hostileTypeEvent = {
        get type() {
          throw new Error('Hostile type getter boom');
        }
      };

      const hostileReasonEvent = {
        type: 'DROPPED',
        get reason() {
          throw new Error('Hostile reason getter boom');
        }
      };

      const hostileStageEvent = {
        type: 'ERROR',
        get stage() {
          throw new Error('Hostile stage getter boom');
        }
      };

      assert.doesNotThrow(() => telemetry.recordEvent(hostileTypeEvent));
      assert.strictEqual(telemetry.getSnapshot().invalidEvents, 1);

      assert.doesNotThrow(() => telemetry.recordEvent(hostileReasonEvent));
      assert.strictEqual(telemetry.getSnapshot().invalidEvents, 2);

      assert.doesNotThrow(() => telemetry.recordEvent(hostileStageEvent));
      assert.strictEqual(telemetry.getSnapshot().invalidEvents, 3);
    });

    test('revoked Proxy is captured and increments invalidEvents exactly once without throwing', () => {
      const telemetry = createEtaShadowTelemetry();
      const { proxy, revoke } = Proxy.revocable({ type: 'ENQUEUED' }, {});
      revoke();

      assert.doesNotThrow(() => telemetry.recordEvent(proxy));
      assert.strictEqual(telemetry.getSnapshot().invalidEvents, 1);
      assert.strictEqual(telemetry.getSnapshot().enqueued, 0);
    });

  });

  describe('5) Total absence of sensitive data and extra properties', () => {

    test('extra sensitive properties on valid events are completely ignored and never retained', () => {
      const telemetry = createEtaShadowTelemetry();

      telemetry.recordEvent({
        type: 'ENQUEUED',
        payload: {
          clientName: 'Juan Perez',
          originPointId: 'pt-1234',
          destinationAddress: 'Av. Las Magnolias #123',
          departureDate: '2026-10-15',
          schedule: '08:00-12:00'
        },
        token: 'secret-bearer-token',
        userId: 98765,
        apiKey: 'sk-live-123456789'
      });

      telemetry.recordEvent({
        type: 'DROPPED',
        reason: 'QUEUE_FULL',
        droppedAt: '2026-10-05T12:00:00Z',
        queueDump: [{ scenarioId: 101, secret: 'dump' }]
      });

      telemetry.recordEvent({
        type: 'MATCH',
        expected: { status: 'ACTIVE_TODAY', officialDate: '2026-10-05' },
        actual: { status: 'ACTIVE_TODAY', officialDate: '2026-10-05' },
        divergenceRatio: 0.0
      });

      telemetry.recordEvent({
        type: 'MISMATCH',
        expected: { status: 'ACTIVE_TODAY', officialDate: '2026-10-05' },
        actual: { status: 'BEFORE_NEXT_INTERVAL', officialDate: '2026-10-06' },
        differences: [{ path: 'officialEntry.status', kind: 'changed' }],
        diffCount: 1,
        rules: 'STANDARD_CUTOFF'
      });

      telemetry.recordEvent({
        type: 'ERROR',
        stage: 'RUNNER',
        error: new Error('Postgres connection pool exhausted at db.sivoy.internal'),
        stack: 'Error: at Query.run (/var/app/db.js:42:15)',
        scenarioInput: { originId: 'ag-55' }
      });

      const snapshot = telemetry.getSnapshot();
      assert.strictEqual(snapshot.enqueued, 1);
      assert.strictEqual(snapshot.dropped.QUEUE_FULL, 1);
      assert.strictEqual(snapshot.match, 1);
      assert.strictEqual(snapshot.mismatch, 1);
      assert.strictEqual(snapshot.errors.RUNNER, 1);

      const serialized = JSON.stringify(snapshot);

      // Verify absence of sensitive words, tokens, rules, stacks, IDs, payloads
      const sensitiveKeywords = [
        'Juan Perez',
        'pt-1234',
        'Las Magnolias',
        '2026-10-15',
        '08:00-12:00',
        'secret-bearer-token',
        '98765',
        'sk-live-123456789',
        'droppedAt',
        'queueDump',
        'scenarioId',
        'ACTIVE_TODAY',
        'BEFORE_NEXT_INTERVAL',
        'divergenceRatio',
        'differences',
        'diffCount',
        'STANDARD_CUTOFF',
        'Postgres',
        'db.sivoy.internal',
        'stack',
        'ag-55',
        'payload',
        'expected',
        'actual'
      ];

      for (const keyword of sensitiveKeywords) {
        assert.strictEqual(
          serialized.includes(keyword),
          false,
          `Serialized snapshot must not contain sensitive string: "${keyword}"`
        );
      }

      // Verify JSON round-trip retains exact allowed keys only
      const parsed = JSON.parse(serialized);
      assert.deepStrictEqual(Object.keys(parsed).sort(), [
        'dropped',
        'enqueued',
        'errors',
        'invalidEvents',
        'match',
        'mismatch'
      ]);
      assert.deepStrictEqual(Object.keys(parsed.dropped), ['QUEUE_FULL']);
      assert.deepStrictEqual(Object.keys(parsed.errors).sort(), [
        'COMPARE',
        'CURRENT',
        'LEGACY',
        'RUNNER'
      ]);
    });

  });

  describe('6) Metrics reset functionality', () => {

    test('resetMetrics clears all counters back to zero', () => {
      const telemetry = createEtaShadowTelemetry();

      telemetry.recordEvent({ type: 'ENQUEUED' });
      telemetry.recordEvent({ type: 'DROPPED', reason: 'QUEUE_FULL' });
      telemetry.recordEvent({ type: 'MATCH' });
      telemetry.recordEvent({ type: 'MISMATCH' });
      telemetry.recordEvent({ type: 'ERROR', stage: 'RUNNER' });
      telemetry.recordEvent({ type: 'ERROR', stage: 'LEGACY' });
      telemetry.recordEvent({ type: 'ERROR', stage: 'CURRENT' });
      telemetry.recordEvent({ type: 'ERROR', stage: 'COMPARE' });
      telemetry.recordEvent({ type: 'INVALID' });

      const beforeReset = telemetry.getSnapshot();
      assert.strictEqual(beforeReset.enqueued, 1);
      assert.strictEqual(beforeReset.invalidEvents, 1);

      telemetry.resetMetrics();

      const afterReset = telemetry.getSnapshot();
      assert.deepStrictEqual(afterReset, {
        enqueued: 0,
        dropped: { QUEUE_FULL: 0 },
        match: 0,
        mismatch: 0,
        errors: { RUNNER: 0, LEGACY: 0, CURRENT: 0, COMPARE: 0 },
        invalidEvents: 0
      });
    });

  });

  describe('7) Isolation between factory instances and default singleton', () => {

    test('factory instances do not share state with each other', () => {
      const t1 = createEtaShadowTelemetry();
      const t2 = createEtaShadowTelemetry();

      t1.recordEvent({ type: 'ENQUEUED' });
      t1.recordEvent({ type: 'MATCH' });

      assert.strictEqual(t1.getSnapshot().enqueued, 1);
      assert.strictEqual(t1.getSnapshot().match, 1);

      assert.strictEqual(t2.getSnapshot().enqueued, 0);
      assert.strictEqual(t2.getSnapshot().match, 0);

      t2.recordEvent({ type: 'MISMATCH' });
      assert.strictEqual(t1.getSnapshot().mismatch, 0);
      assert.strictEqual(t2.getSnapshot().mismatch, 1);

      t1.resetMetrics();
      assert.strictEqual(t1.getSnapshot().enqueued, 0);
      assert.strictEqual(t2.getSnapshot().mismatch, 1);
    });

    test('defaultEtaShadowTelemetry is completely isolated from factory instances', () => {
      const custom = createEtaShadowTelemetry();

      custom.recordEvent({ type: 'ENQUEUED' });
      assert.strictEqual(custom.getSnapshot().enqueued, 1);
      assert.strictEqual(defaultEtaShadowTelemetry.getSnapshot().enqueued, 0);

      defaultEtaShadowTelemetry.recordEvent({ type: 'MATCH' });
      assert.strictEqual(defaultEtaShadowTelemetry.getSnapshot().match, 1);
      assert.strictEqual(custom.getSnapshot().match, 0);

      defaultEtaShadowTelemetry.resetMetrics();
      assert.strictEqual(defaultEtaShadowTelemetry.getSnapshot().match, 0);
      assert.strictEqual(custom.getSnapshot().enqueued, 1);
    });

  });

  describe('8) Static analysis of runtime file (dependencies, Date, console, I/O)', () => {

    test('eta-shadow-telemetry.js has zero forbidden imports, no Date, no console, no I/O', () => {
      const runtimePath = path.resolve(__dirname, '../src/core/eta/eta-shadow-telemetry.js');
      if (!fs.existsSync(runtimePath)) {
        assert.fail(`Runtime file does not exist: ${runtimePath}`);
      }

      const content = fs.readFileSync(runtimePath, 'utf8');

      // Prohibited imports: runner, tests, express, http, db, observability
      assert.doesNotMatch(content, /require\s*\(\s*['"][^'"]*eta-shadow-runner[^'"]*['"]\s*\)/i);
      assert.doesNotMatch(content, /require\s*\(\s*['"][^'"]*test[^'"]*['"]\s*\)/i);
      assert.doesNotMatch(content, /require\s*\(\s*['"][^'"]*application[^'"]*['"]\s*\)/i);
      assert.doesNotMatch(content, /require\s*\(\s*['"]express['"]\s*\)/i);
      assert.doesNotMatch(content, /require\s*\(\s*['"](?:node:)?http['"]\s*\)/i);
      assert.doesNotMatch(content, /require\s*\(\s*['"](?:node:)?https['"]\s*\)/i);
      assert.doesNotMatch(content, /require\s*\(\s*['"][^'"]*(?:db|pool|postgres|pg)[^'"]*['"]\s*\)/i);
      assert.doesNotMatch(content, /require\s*\(\s*['"][^'"]*observability[^'"]*['"]\s*\)/i);
      assert.doesNotMatch(content, /require\s*\(\s*['"](?:node:)?fs['"]\s*\)/i);
      assert.doesNotMatch(content, /require\s*\(\s*['"](?:node:)?net['"]\s*\)/i);

      // In fact, eta-shadow-telemetry.js should have ZERO require calls altogether
      assert.doesNotMatch(content, /require\s*\(/);

      // Prohibited Date / timestamps
      assert.doesNotMatch(content, /\bDate\b/);
      assert.doesNotMatch(content, /timestamp/i);
      assert.doesNotMatch(content, /lastEvaluatedAt/i);

      // Prohibited console logging
      assert.doesNotMatch(content, /\bconsole\s*\./);
    });

  });

});
