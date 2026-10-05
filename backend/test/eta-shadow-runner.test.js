'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createEtaShadowRunner,
  SHADOW_RUNNER_STATUS,
  SHADOW_RUNNER_EVENT,
  SHADOW_RUNNER_STAGE
} = require('../src/application/rutas/eta-shadow-runner');

// Manual scheduler for deterministic async queue control without real timers or sleep
function createManualScheduler() {
  const queue = [];
  return {
    defer(fn) {
      queue.push(fn);
    },
    async step() {
      if (queue.length === 0) return false;
      const fn = queue.shift();
      const result = fn();
      if (result && typeof result.then === 'function') {
        await result;
      }
      return true;
    },
    async drain() {
      let count = 0;
      while (queue.length > 0) {
        const fn = queue.shift();
        const result = fn();
        if (result && typeof result.then === 'function') {
          await result;
        }
        count++;
      }
      return count;
    },
    get pendingCount() {
      return queue.length;
    }
  };
}

function createDummyEngines(overrides = {}) {
  return {
    runLegacy: overrides.runLegacy || (() => ({ dummyLegacy: true })),
    runCurrent: overrides.runCurrent || (() => ({ dummyCurrent: true })),
    compare: overrides.compare || (() => ({ matches: true, differences: [] }))
  };
}

describe('T43c2b — ETA Shadow Runner', () => {

  describe('1) Strict default-off and non-exact values, zero effects', () => {

    test('default environment (empty or undefined ETA_SHADOW_PARITY) returns DISABLED with zero effects', () => {
      let deferCalls = 0;
      let cloneCalls = 0;
      let eventCalls = 0;
      let legacyCalls = 0;
      let currentCalls = 0;
      let compareCalls = 0;

      const runner = createEtaShadowRunner({
        env: {},
        defer: () => { deferCalls++; },
        clone: (val) => { cloneCalls++; return structuredClone(val); },
        onEvent: () => { eventCalls++; },
        runLegacy: () => { legacyCalls++; return {}; },
        runCurrent: () => { currentCalls++; return {}; },
        compare: () => { compareCalls++; return { matches: true }; }
      });

      const result = runner.enqueue({ origin: { id: 1 }, destination: { id: 2 } });

      assert.strictEqual(result, SHADOW_RUNNER_STATUS.DISABLED);
      assert.strictEqual(runner.getQueueDepth(), 0);
      assert.strictEqual(deferCalls, 0);
      assert.strictEqual(cloneCalls, 0);
      assert.strictEqual(eventCalls, 0);
      assert.strictEqual(legacyCalls, 0);
      assert.strictEqual(currentCalls, 0);
      assert.strictEqual(compareCalls, 0);
    });

    test('any non-exact value of ETA_SHADOW_PARITY remains strictly disabled', () => {
      const nonExactValues = [
        'false',
        'FALSE',
        '1',
        '0',
        'true ',
        ' true',
        'TRUE',
        'True',
        'yes',
        'on',
        'enabled',
        '',
        'undefined',
        'null'
      ];

      for (const val of nonExactValues) {
        let cloneCalled = false;
        let eventCalled = false;

        const runner = createEtaShadowRunner({
          env: { ETA_SHADOW_PARITY: val },
          clone: (v) => { cloneCalled = true; return structuredClone(v); },
          onEvent: () => { eventCalled = true; },
          ...createDummyEngines()
        });

        const status = runner.enqueue({ test: true });
        assert.strictEqual(status, SHADOW_RUNNER_STATUS.DISABLED, `Expected DISABLED for value: "${val}"`);
        assert.strictEqual(runner.getQueueDepth(), 0);
        assert.strictEqual(cloneCalled, false);
        assert.strictEqual(eventCalled, false);
      }
    });

    test('override option "enabled" is strictly ignored; only env.ETA_SHADOW_PARITY is used', () => {
      let eventCalled = false;
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'false' },
        enabled: true,
        onEvent: () => { eventCalled = true; },
        ...createDummyEngines()
      });

      const status = runner.enqueue({ scenario: 1 });
      assert.strictEqual(status, SHADOW_RUNNER_STATUS.DISABLED);
      assert.strictEqual(runner.getQueueDepth(), 0);
      assert.strictEqual(eventCalled, false);
    });

    test('env is evaluated once at construction time; mutating env object afterwards has no effect', () => {
      const mutableEnv = { ETA_SHADOW_PARITY: 'false' };
      const runner = createEtaShadowRunner({
        env: mutableEnv,
        ...createDummyEngines()
      });

      mutableEnv.ETA_SHADOW_PARITY = 'true';

      const status = runner.enqueue({ scenario: 1 });
      assert.strictEqual(status, SHADOW_RUNNER_STATUS.DISABLED);
      assert.strictEqual(runner.getQueueDepth(), 0);
    });

  });

  describe('2) FIFO, no-inline, one tick per job, maxQueueSize/drop-on-full, exact and frozen returns/events', () => {

    test('enqueue never executes inline and returns frozen ENQUEUED status and event', () => {
      const scheduler = createManualScheduler();
      const events = [];
      let legacyRan = false;

      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: (ev) => events.push(ev),
        runLegacy: () => { legacyRan = true; return {}; },
        runCurrent: () => ({}),
        compare: () => ({ matches: true, differences: [] })
      });

      const status = runner.enqueue({ id: 'job-1' });

      assert.strictEqual(status, SHADOW_RUNNER_STATUS.ENQUEUED);
      assert.strictEqual(runner.getQueueDepth(), 1);
      assert.strictEqual(legacyRan, false, 'Engine must not run inline on enqueue');
      assert.strictEqual(scheduler.pendingCount, 1, 'Exactly one drain tick must be deferred');

      assert.strictEqual(events.length, 1);
      assert.strictEqual(Object.isFrozen(events[0]), true);
      assert.deepStrictEqual(events[0], { type: SHADOW_RUNNER_EVENT.ENQUEUED });
    });

    test('processes jobs in strict FIFO order, one tick per job, rescheduling only when jobs remain', async () => {
      const scheduler = createManualScheduler();
      const executedOrder = [];
      const events = [];

      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: (ev) => events.push(ev),
        runLegacy: (s) => { executedOrder.push(`legacy-${s.name}`); return {}; },
        runCurrent: (s) => { executedOrder.push(`current-${s.name}`); return {}; },
        compare: () => ({ matches: true, differences: [] })
      });

      const s1 = runner.enqueue({ name: 'A' });
      const s2 = runner.enqueue({ name: 'B' });
      const s3 = runner.enqueue({ name: 'C' });

      assert.strictEqual(s1, SHADOW_RUNNER_STATUS.ENQUEUED);
      assert.strictEqual(s2, SHADOW_RUNNER_STATUS.ENQUEUED);
      assert.strictEqual(s3, SHADOW_RUNNER_STATUS.ENQUEUED);
      assert.strictEqual(runner.getQueueDepth(), 3);
      assert.strictEqual(scheduler.pendingCount, 1, 'Only one drain tick must be scheduled initially');

      // Tick 1: processes A
      await scheduler.step();
      assert.strictEqual(runner.getQueueDepth(), 2);
      assert.strictEqual(scheduler.pendingCount, 1, 'Scheduled next tick for job B');
      assert.deepStrictEqual(executedOrder, ['legacy-A', 'current-A']);

      // Tick 2: processes B
      await scheduler.step();
      assert.strictEqual(runner.getQueueDepth(), 1);
      assert.strictEqual(scheduler.pendingCount, 1, 'Scheduled next tick for job C');
      assert.deepStrictEqual(executedOrder, ['legacy-A', 'current-A', 'legacy-B', 'current-B']);

      // Tick 3: processes C
      await scheduler.step();
      assert.strictEqual(runner.getQueueDepth(), 0);
      assert.strictEqual(scheduler.pendingCount, 0, 'No more ticks scheduled when queue is empty');
      assert.deepStrictEqual(executedOrder, ['legacy-A', 'current-A', 'legacy-B', 'current-B', 'legacy-C', 'current-C']);
    });

    test('drop-on-full drops when queue depth reaches maxQueueSize with DROPPED status and QUEUE_FULL event', async () => {
      const scheduler = createManualScheduler();
      const events = [];
      let cloneCount = 0;

      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        maxQueueSize: 2,
        defer: scheduler.defer,
        clone: (val) => { cloneCount++; return structuredClone(val); },
        onEvent: (ev) => events.push(ev),
        ...createDummyEngines()
      });

      const res1 = runner.enqueue({ id: 1 });
      const res2 = runner.enqueue({ id: 2 });
      assert.strictEqual(res1, SHADOW_RUNNER_STATUS.ENQUEUED);
      assert.strictEqual(res2, SHADOW_RUNNER_STATUS.ENQUEUED);
      assert.strictEqual(runner.getQueueDepth(), 2);
      assert.strictEqual(cloneCount, 2);

      // Third enqueue reaches maxQueueSize -> drop-tail BEFORE clone
      const res3 = runner.enqueue({ id: 3 });
      assert.strictEqual(res3, SHADOW_RUNNER_STATUS.DROPPED);
      assert.strictEqual(runner.getQueueDepth(), 2);
      assert.strictEqual(cloneCount, 2, 'Clone must not be called when job is dropped');

      const dropEvent = events.find((e) => e.type === SHADOW_RUNNER_EVENT.DROPPED);
      assert.ok(dropEvent, 'DROPPED event must be emitted');
      assert.strictEqual(Object.isFrozen(dropEvent), true);
      assert.deepStrictEqual(dropEvent, {
        type: SHADOW_RUNNER_EVENT.DROPPED,
        reason: 'QUEUE_FULL'
      });

      // Drain one job to make space
      await scheduler.step();
      assert.strictEqual(runner.getQueueDepth(), 1);

      // Fourth enqueue now succeeds
      const res4 = runner.enqueue({ id: 4 });
      assert.strictEqual(res4, SHADOW_RUNNER_STATUS.ENQUEUED);
      assert.strictEqual(runner.getQueueDepth(), 2);
      assert.strictEqual(cloneCount, 3);
    });

    test('emits MATCH event when compare.matches is true', async () => {
      const scheduler = createManualScheduler();
      const events = [];

      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: (ev) => events.push(ev),
        runLegacy: () => ({ a: 1 }),
        runCurrent: () => ({ a: 1 }),
        compare: () => ({ matches: true, differences: [] })
      });

      runner.enqueue({ scenario: 'match-test' });
      await scheduler.step();

      const matchEvent = events.find((e) => e.type === SHADOW_RUNNER_EVENT.MATCH);
      assert.ok(matchEvent, 'MATCH event must be emitted');
      assert.strictEqual(Object.isFrozen(matchEvent), true);
      assert.deepStrictEqual(matchEvent, { type: SHADOW_RUNNER_EVENT.MATCH });
    });

    test('emits MISMATCH event when compare.matches is false, without differences or paths', async () => {
      const scheduler = createManualScheduler();
      const events = [];

      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: (ev) => events.push(ev),
        runLegacy: () => ({ a: 1 }),
        runCurrent: () => ({ a: 2 }),
        compare: () => ({
          matches: false,
          differences: [{ path: 'officialEntry.status', kind: 'changed', expected: 'A', actual: 'B' }]
        })
      });

      runner.enqueue({ scenario: 'mismatch-test' });
      await scheduler.step();

      const mismatchEvent = events.find((e) => e.type === SHADOW_RUNNER_EVENT.MISMATCH);
      assert.ok(mismatchEvent, 'MISMATCH event must be emitted');
      assert.strictEqual(Object.isFrozen(mismatchEvent), true);
      assert.deepStrictEqual(mismatchEvent, { type: SHADOW_RUNNER_EVENT.MISMATCH });
      assert.strictEqual(Object.keys(mismatchEvent).length, 1);
    });

  });

  describe('3) Defensive cloning', () => {

    test('mutating input scenario after enqueue does not alter data observed by engines', async () => {
      const scheduler = createManualScheduler();
      let legacyObserved = null;
      let currentObserved = null;

      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        runLegacy: (s) => { legacyObserved = s; return {}; },
        runCurrent: (s) => { currentObserved = s; return {}; },
        compare: () => ({ matches: true, differences: [] })
      });

      const mutableInput = {
        origin: { name: 'Original Agency', coordinates: [13.7, -89.2] },
        tags: ['standard']
      };

      runner.enqueue(mutableInput);

      // Mutate input immediately after enqueue
      mutableInput.origin.name = 'MUTATED NAME';
      mutableInput.origin.coordinates.push(999);
      mutableInput.tags.push('corrupted');

      await scheduler.step();

      assert.strictEqual(legacyObserved.origin.name, 'Original Agency');
      assert.deepStrictEqual(legacyObserved.origin.coordinates, [13.7, -89.2]);
      assert.deepStrictEqual(legacyObserved.tags, ['standard']);

      assert.strictEqual(currentObserved.origin.name, 'Original Agency');
      assert.deepStrictEqual(currentObserved.origin.coordinates, [13.7, -89.2]);
      assert.deepStrictEqual(currentObserved.tags, ['standard']);
    });

    test('clone error returns REJECTED, emits ERROR stage RUNNER, without throwing', () => {
      const events = [];
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        clone: () => { throw new Error('Structured clone failed: circular or symbol'); },
        onEvent: (ev) => events.push(ev),
        ...createDummyEngines()
      });

      const status = runner.enqueue({ test: 'cannot-clone' });

      assert.strictEqual(status, SHADOW_RUNNER_STATUS.REJECTED);
      assert.strictEqual(runner.getQueueDepth(), 0);

      const errEvent = events.find((e) => e.type === SHADOW_RUNNER_EVENT.ERROR);
      assert.ok(errEvent, 'ERROR event must be emitted');
      assert.strictEqual(Object.isFrozen(errEvent), true);
      assert.deepStrictEqual(errEvent, {
        type: SHADOW_RUNNER_EVENT.ERROR,
        stage: SHADOW_RUNNER_STAGE.RUNNER
      });
    });

  });

  describe('4) Isolation of sync/async errors in each stage, onEvent and defer', () => {

    test('runLegacy sync error is absorbed, emits ERROR stage LEGACY, and next job continues', async () => {
      const scheduler = createManualScheduler();
      const events = [];
      let job2Ran = false;

      let callCount = 0;
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: (ev) => events.push(ev),
        runLegacy: () => {
          callCount++;
          if (callCount === 1) throw new Error('Legacy sync failure');
          job2Ran = true;
          return { ok: true };
        },
        runCurrent: () => ({ ok: true }),
        compare: () => ({ matches: true, differences: [] })
      });

      runner.enqueue({ id: 'job-1' });
      runner.enqueue({ id: 'job-2' });

      // Step job 1
      await scheduler.step();
      const errEvent = events.find((e) => e.type === SHADOW_RUNNER_EVENT.ERROR);
      assert.ok(errEvent);
      assert.strictEqual(Object.isFrozen(errEvent), true);
      assert.deepStrictEqual(errEvent, {
        type: SHADOW_RUNNER_EVENT.ERROR,
        stage: SHADOW_RUNNER_STAGE.LEGACY
      });

      // Step job 2
      await scheduler.step();
      assert.strictEqual(job2Ran, true);
      const matchEvent = events.find((e) => e.type === SHADOW_RUNNER_EVENT.MATCH);
      assert.ok(matchEvent);
      assert.strictEqual(runner.getQueueDepth(), 0);
    });

    test('runLegacy async rejection is absorbed, emits ERROR stage LEGACY, and next job continues', async () => {
      const scheduler = createManualScheduler();
      const events = [];

      let callCount = 0;
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: (ev) => events.push(ev),
        runLegacy: async () => {
          callCount++;
          if (callCount === 1) throw new Error('Legacy async rejection');
          return { ok: true };
        },
        runCurrent: async () => ({ ok: true }),
        compare: async () => ({ matches: true, differences: [] })
      });

      runner.enqueue({ id: 'job-1' });
      runner.enqueue({ id: 'job-2' });

      await scheduler.step();
      const legacyErr = events.find((e) => e.type === SHADOW_RUNNER_EVENT.ERROR && e.stage === SHADOW_RUNNER_STAGE.LEGACY);
      assert.ok(legacyErr);

      await scheduler.step();
      const match = events.find((e) => e.type === SHADOW_RUNNER_EVENT.MATCH);
      assert.ok(match);
      assert.strictEqual(runner.getQueueDepth(), 0);
    });

    test('runCurrent sync error and async rejection are absorbed, emitting ERROR stage CURRENT', async () => {
      const scheduler = createManualScheduler();
      const events = [];

      let callCount = 0;
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: (ev) => events.push(ev),
        runLegacy: () => ({}),
        runCurrent: () => {
          callCount++;
          if (callCount === 1) throw new Error('Current sync error');
          return Promise.reject(new Error('Current async rejection'));
        },
        compare: () => ({ matches: true, differences: [] })
      });

      runner.enqueue({ id: 'job-1' });
      runner.enqueue({ id: 'job-2' });

      await scheduler.step();
      await scheduler.step();

      const currentErrors = events.filter((e) => e.type === SHADOW_RUNNER_EVENT.ERROR && e.stage === SHADOW_RUNNER_STAGE.CURRENT);
      assert.strictEqual(currentErrors.length, 2);
      assert.strictEqual(Object.isFrozen(currentErrors[0]), true);
      assert.strictEqual(Object.isFrozen(currentErrors[1]), true);
      assert.strictEqual(runner.getQueueDepth(), 0);
    });

    test('compare sync error and async rejection are absorbed, emitting ERROR stage COMPARE', async () => {
      const scheduler = createManualScheduler();
      const events = [];

      let callCount = 0;
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: (ev) => events.push(ev),
        runLegacy: () => ({}),
        runCurrent: () => ({}),
        compare: () => {
          callCount++;
          if (callCount === 1) throw new Error('Compare sync error');
          return Promise.reject(new Error('Compare async rejection'));
        }
      });

      runner.enqueue({ id: 'job-1' });
      runner.enqueue({ id: 'job-2' });

      await scheduler.step();
      await scheduler.step();

      const compareErrors = events.filter((e) => e.type === SHADOW_RUNNER_EVENT.ERROR && e.stage === SHADOW_RUNNER_STAGE.COMPARE);
      assert.strictEqual(compareErrors.length, 2);
      assert.strictEqual(runner.getQueueDepth(), 0);
    });

    test('onEvent throwing synchronously is completely absorbed without affecting runner or queue', async () => {
      const scheduler = createManualScheduler();

      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: () => {
          throw new Error('Telemetry explosion');
        },
        ...createDummyEngines()
      });

      // Enqueue should not throw despite onEvent throwing on ENQUEUED
      const status = runner.enqueue({ id: 'job-1' });
      assert.strictEqual(status, SHADOW_RUNNER_STATUS.ENQUEUED);
      assert.strictEqual(runner.getQueueDepth(), 1);

      // Drain should not throw despite onEvent throwing on MATCH
      await scheduler.step();
      assert.strictEqual(runner.getQueueDepth(), 0);
    });

    test('onEvent returning a rejected promise is absorbed without an unhandled rejection', async () => {
      const scheduler = createManualScheduler();
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        onEvent: () => Promise.reject(new Error('Async telemetry explosion')),
        ...createDummyEngines()
      });

      const status = runner.enqueue({ id: 'job-1' });
      assert.strictEqual(status, SHADOW_RUNNER_STATUS.ENQUEUED);

      await scheduler.step();
      await Promise.resolve();
      assert.strictEqual(runner.getQueueDepth(), 0);
    });

    test('defer throwing sync when scheduling is absorbed, frees queue slot, returns REJECTED, emits ERROR stage RUNNER', () => {
      const events = [];
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: () => {
          throw new Error('Immediate scheduler crashed');
        },
        onEvent: (ev) => events.push(ev),
        ...createDummyEngines()
      });

      const status = runner.enqueue({ id: 'job-1' });

      assert.strictEqual(status, SHADOW_RUNNER_STATUS.REJECTED);
      assert.strictEqual(runner.getQueueDepth(), 0, 'Queue depth must be released upon scheduling failure');

      const errEvent = events.find((e) => e.type === SHADOW_RUNNER_EVENT.ERROR);
      assert.ok(errEvent);
      assert.strictEqual(errEvent.stage, SHADOW_RUNNER_STAGE.RUNNER);
    });

  });

  describe('5) Factory/API validation, getQueueDepth and architectural hygiene', () => {

    test('factory rejects missing or invalid functional dependencies', () => {
      assert.throws(() => createEtaShadowRunner(), TypeError);
      assert.throws(() => createEtaShadowRunner(null), TypeError);

      // Missing runLegacy
      assert.throws(() => createEtaShadowRunner({
        runCurrent: () => ({}),
        compare: () => ({})
      }), TypeError);

      // Non-function runLegacy
      assert.throws(() => createEtaShadowRunner({
        runLegacy: 'not-a-fn',
        runCurrent: () => ({}),
        compare: () => ({})
      }), TypeError);

      // Missing runCurrent
      assert.throws(() => createEtaShadowRunner({
        runLegacy: () => ({}),
        compare: () => ({})
      }), TypeError);

      // Missing compare
      assert.throws(() => createEtaShadowRunner({
        runLegacy: () => ({}),
        runCurrent: () => ({})
      }), TypeError);

      // Invalid defer
      assert.throws(() => createEtaShadowRunner({
        defer: 'invalid',
        ...createDummyEngines()
      }), TypeError);

      // Invalid clone
      assert.throws(() => createEtaShadowRunner({
        clone: 'invalid',
        ...createDummyEngines()
      }), TypeError);

      // Invalid onEvent
      assert.throws(() => createEtaShadowRunner({
        onEvent: 'invalid',
        ...createDummyEngines()
      }), TypeError);
    });

    test('factory rejects non-positive or non-integer maxQueueSize', () => {
      const invalidSizes = [0, -1, -100, 1.5, NaN, Infinity, '100', null, {}];

      for (const size of invalidSizes) {
        assert.throws(
          () => createEtaShadowRunner({ maxQueueSize: size, ...createDummyEngines() }),
          (err) => err instanceof TypeError || err instanceof RangeError,
          `Expected error for maxQueueSize: ${size}`
        );
      }
    });

    test('public API is frozen and provides only enqueue and getQueueDepth', () => {
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        ...createDummyEngines()
      });

      assert.strictEqual(Object.isFrozen(runner), true);
      assert.strictEqual(typeof runner.enqueue, 'function');
      assert.strictEqual(typeof runner.getQueueDepth, 'function');

      const methods = Object.keys(runner).sort();
      assert.deepStrictEqual(methods, ['enqueue', 'getQueueDepth']);

      assert.throws(() => {
        runner.arbitraryProperty = 123;
      }, TypeError);
    });

    test('exported constants are frozen and match expected members', () => {
      assert.strictEqual(Object.isFrozen(SHADOW_RUNNER_STATUS), true);
      assert.deepStrictEqual(SHADOW_RUNNER_STATUS, {
        DISABLED: 'DISABLED',
        ENQUEUED: 'ENQUEUED',
        DROPPED: 'DROPPED',
        REJECTED: 'REJECTED'
      });

      assert.strictEqual(Object.isFrozen(SHADOW_RUNNER_EVENT), true);
      assert.deepStrictEqual(SHADOW_RUNNER_EVENT, {
        ENQUEUED: 'ENQUEUED',
        DROPPED: 'DROPPED',
        MATCH: 'MATCH',
        MISMATCH: 'MISMATCH',
        ERROR: 'ERROR'
      });

      assert.strictEqual(Object.isFrozen(SHADOW_RUNNER_STAGE), true);
      assert.deepStrictEqual(SHADOW_RUNNER_STAGE, {
        RUNNER: 'RUNNER',
        LEGACY: 'LEGACY',
        CURRENT: 'CURRENT',
        COMPARE: 'COMPARE'
      });
    });

    test('getQueueDepth returns pending count without exposing references', async () => {
      const scheduler = createManualScheduler();
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        defer: scheduler.defer,
        ...createDummyEngines()
      });

      assert.strictEqual(typeof runner.getQueueDepth(), 'number');
      assert.strictEqual(runner.getQueueDepth(), 0);

      runner.enqueue({ id: 1 });
      assert.strictEqual(runner.getQueueDepth(), 1);

      runner.enqueue({ id: 2 });
      assert.strictEqual(runner.getQueueDepth(), 2);

      await scheduler.step();
      assert.strictEqual(runner.getQueueDepth(), 1);

      await scheduler.step();
      assert.strictEqual(runner.getQueueDepth(), 0);
    });

    test('runtime source file has zero imports from test, express, http, or concrete observability', () => {
      const runtimeFilePath = path.resolve(__dirname, '../src/application/rutas/eta-shadow-runner.js');
      if (!fs.existsSync(runtimeFilePath)) {
        assert.fail(`Runtime file does not exist: ${runtimeFilePath}`);
      }
      const content = fs.readFileSync(runtimeFilePath, 'utf8');

      // Zero imports from test directory
      assert.doesNotMatch(content, /require\(['"][^'"]*test[^'"]*['"]\)/i);
      // Zero HTTP / Express imports
      assert.doesNotMatch(content, /require\(['"]express['"]\)/i);
      assert.doesNotMatch(content, /require\(['"](?:node:)?http['"]\)/i);
      assert.doesNotMatch(content, /require\(['"](?:node:)?https['"]\)/i);
      // Zero database imports
      assert.doesNotMatch(content, /require\(['"][^'"]*(?:db|pool|postgres|pg)[^'"]*['"]\)/i);
      // Zero concrete observability imports
      assert.doesNotMatch(content, /require\(['"][^'"]*observability[^'"]*['"]\)/i);
      assert.doesNotMatch(content, /require\(['"][^'"]*telemetry[^'"]*['"]\)/i);
    });

  });

  describe('6) Event serialization and strict data sanitization', () => {

    test('all emitted event types are frozen, have strict allowed keys, and contain zero sensitive data', async () => {
      const scheduler = createManualScheduler();
      const emittedEvents = [];

      let stageCount = 0;
      const runner = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        maxQueueSize: 2,
        defer: scheduler.defer,
        onEvent: (ev) => emittedEvents.push(ev),
        runLegacy: (s) => {
          if (s.triggerError === 'LEGACY') throw new Error('Sensitive legacy error with user password and table details');
          return { canonical: true };
        },
        runCurrent: (s) => {
          if (s.triggerError === 'CURRENT') throw new Error('Sensitive current error with JWT secret');
          return { canonical: true };
        },
        compare: (leg, cur) => {
          stageCount++;
          if (stageCount === 1) return { matches: true, differences: [] };
          if (stageCount === 2) return {
            matches: false,
            differences: [{ path: 'sensitive.field', kind: 'changed', expected: 'SECRET_A', actual: 'SECRET_B' }]
          };
          throw new Error('Sensitive compare error with SQL injection payload');
        }
      });

      // 1. ENQUEUED event
      runner.enqueue({
        name: 'sensitive scenario with client address and credit card',
        secretId: 98765
      });

      // 2. MATCH event
      await scheduler.step();

      // 3. MISMATCH event
      runner.enqueue({ id: 'mismatch-job' });
      await scheduler.step();

      // 4. ERROR (LEGACY) event
      runner.enqueue({ triggerError: 'LEGACY' });
      await scheduler.step();

      // 5. ERROR (CURRENT) event
      runner.enqueue({ triggerError: 'CURRENT' });
      await scheduler.step();

      // 6. ERROR (COMPARE) event
      runner.enqueue({ id: 'compare-err' });
      await scheduler.step();

      // 7. DROPPED event
      runner.enqueue({ fill: 1 });
      runner.enqueue({ fill: 2 });
      runner.enqueue({ fill: 3 }); // Dropped (queue full)

      // 8. ERROR (RUNNER) event from clone failure
      const runnerCloneErr = createEtaShadowRunner({
        env: { ETA_SHADOW_PARITY: 'true' },
        clone: () => { throw new Error('Internal clone error with sensitive memory dump'); },
        onEvent: (ev) => emittedEvents.push(ev),
        ...createDummyEngines()
      });
      runnerCloneErr.enqueue({ id: 'runner-err' });

      assert.ok(emittedEvents.length >= 8, `Expected at least 8 events, received: ${emittedEvents.length}`);

      const FORBIDDEN_KEYS = [
        'payload',
        'scenario',
        'expected',
        'actual',
        'differences',
        'diffs',
        'paths',
        'diffCount',
        'message',
        'stack',
        'error',
        'Error',
        'timestamp',
        'date',
        'time',
        'id',
        'secret',
        'token'
      ];

      const FORBIDDEN_TEXT_SUBSTRINGS = [
        'sensitive',
        'password',
        'credit card',
        'SECRET',
        'JWT',
        'SQL',
        'memory dump',
        '98765'
      ];

      for (const event of emittedEvents) {
        // Must be frozen
        assert.strictEqual(Object.isFrozen(event), true, `Event must be frozen: ${JSON.stringify(event)}`);

        // Check strict allowed keys per event type
        const keys = Object.keys(event).sort();
        if (event.type === SHADOW_RUNNER_EVENT.ENQUEUED) {
          assert.deepStrictEqual(keys, ['type']);
        } else if (event.type === SHADOW_RUNNER_EVENT.MATCH) {
          assert.deepStrictEqual(keys, ['type']);
        } else if (event.type === SHADOW_RUNNER_EVENT.MISMATCH) {
          assert.deepStrictEqual(keys, ['type']);
        } else if (event.type === SHADOW_RUNNER_EVENT.DROPPED) {
          assert.deepStrictEqual(keys, ['reason', 'type']);
          assert.strictEqual(event.reason, 'QUEUE_FULL');
        } else if (event.type === SHADOW_RUNNER_EVENT.ERROR) {
          assert.deepStrictEqual(keys, ['stage', 'type']);
          assert.ok(
            Object.values(SHADOW_RUNNER_STAGE).includes(event.stage),
            `Invalid error stage: ${event.stage}`
          );
        } else {
          assert.fail(`Unknown event type: ${event.type}`);
        }

        // Serialization check
        const serialized = JSON.stringify(event);

        for (const forbiddenKey of FORBIDDEN_KEYS) {
          assert.strictEqual(
            Object.prototype.hasOwnProperty.call(event, forbiddenKey),
            false,
            `Event must not contain property "${forbiddenKey}": ${serialized}`
          );
        }

        for (const forbiddenText of FORBIDDEN_TEXT_SUBSTRINGS) {
          assert.strictEqual(
            serialized.includes(forbiddenText),
            false,
            `Serialized event must not contain sensitive string "${forbiddenText}": ${serialized}`
          );
        }
      }
    });

  });

});
