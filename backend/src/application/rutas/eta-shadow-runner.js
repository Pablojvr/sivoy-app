'use strict';

const SHADOW_RUNNER_STATUS = Object.freeze({
  DISABLED: 'DISABLED',
  ENQUEUED: 'ENQUEUED',
  DROPPED: 'DROPPED',
  REJECTED: 'REJECTED'
});

const SHADOW_RUNNER_EVENT = Object.freeze({
  ENQUEUED: 'ENQUEUED',
  DROPPED: 'DROPPED',
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  ERROR: 'ERROR'
});

const SHADOW_RUNNER_STAGE = Object.freeze({
  RUNNER: 'RUNNER',
  LEGACY: 'LEGACY',
  CURRENT: 'CURRENT',
  COMPARE: 'COMPARE'
});

function requireFunction(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function createEtaShadowRunner(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    env = process.env,
    maxQueueSize = 100,
    defer = setImmediate,
    clone = structuredClone,
    runLegacy,
    runCurrent,
    compare,
    onEvent = () => {}
  } = options;

  if (!Number.isInteger(maxQueueSize)) {
    throw new TypeError('maxQueueSize must be an integer');
  }
  if (maxQueueSize <= 0) {
    throw new RangeError('maxQueueSize must be greater than zero');
  }

  const deferWork = requireFunction('defer', defer);
  const cloneScenario = requireFunction('clone', clone);
  const executeLegacy = requireFunction('runLegacy', runLegacy);
  const executeCurrent = requireFunction('runCurrent', runCurrent);
  const compareSnapshots = requireFunction('compare', compare);
  const publishEvent = requireFunction('onEvent', onEvent);
  const enabled = env?.ETA_SHADOW_PARITY === 'true';
  const queue = [];
  let workerScheduled = false;
  let workerActive = false;

  function emit(event) {
    try {
      const result = publishEvent(Object.freeze(event));
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).catch(() => {});
      }
    } catch {
      // Observability is deliberately isolated from the request path.
    }
  }

  function emitError(stage) {
    emit({ type: SHADOW_RUNNER_EVENT.ERROR, stage });
  }

  async function processNext() {
    workerScheduled = false;
    workerActive = true;
    const scenario = queue.shift();

    try {
      let legacySnapshot;
      try {
        legacySnapshot = await executeLegacy(scenario);
      } catch {
        emitError(SHADOW_RUNNER_STAGE.LEGACY);
        return;
      }

      let currentSnapshot;
      try {
        currentSnapshot = await executeCurrent(scenario);
      } catch {
        emitError(SHADOW_RUNNER_STAGE.CURRENT);
        return;
      }

      let comparison;
      try {
        comparison = await compareSnapshots(legacySnapshot, currentSnapshot);
      } catch {
        emitError(SHADOW_RUNNER_STAGE.COMPARE);
        return;
      }

      emit({
        type: comparison?.matches === true
          ? SHADOW_RUNNER_EVENT.MATCH
          : SHADOW_RUNNER_EVENT.MISMATCH
      });
    } finally {
      workerActive = false;
      if (queue.length > 0) scheduleWorker();
    }
  }

  function scheduleWorker() {
    if (workerScheduled || workerActive || queue.length === 0) return true;

    workerScheduled = true;
    try {
      deferWork(processNext);
      return true;
    } catch {
      workerScheduled = false;
      emitError(SHADOW_RUNNER_STAGE.RUNNER);
      return false;
    }
  }

  function enqueue(scenario) {
    if (!enabled) return SHADOW_RUNNER_STATUS.DISABLED;

    if (queue.length >= maxQueueSize) {
      emit({ type: SHADOW_RUNNER_EVENT.DROPPED, reason: 'QUEUE_FULL' });
      return SHADOW_RUNNER_STATUS.DROPPED;
    }

    let snapshot;
    try {
      snapshot = cloneScenario(scenario);
    } catch {
      emitError(SHADOW_RUNNER_STAGE.RUNNER);
      return SHADOW_RUNNER_STATUS.REJECTED;
    }

    queue.push(snapshot);
    if (!scheduleWorker()) {
      queue.pop();
      return SHADOW_RUNNER_STATUS.REJECTED;
    }

    emit({ type: SHADOW_RUNNER_EVENT.ENQUEUED });
    return SHADOW_RUNNER_STATUS.ENQUEUED;
  }

  return Object.freeze({
    enqueue,
    getQueueDepth: () => queue.length
  });
}

module.exports = {
  createEtaShadowRunner,
  SHADOW_RUNNER_STATUS,
  SHADOW_RUNNER_EVENT,
  SHADOW_RUNNER_STAGE
};
