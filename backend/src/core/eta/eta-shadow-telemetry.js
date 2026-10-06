'use strict';

const ALLOWED_DROPPED_REASONS = Object.freeze(['QUEUE_FULL']);

const ALLOWED_ERROR_STAGES = Object.freeze([
  'RUNNER',
  'LEGACY',
  'CURRENT',
  'COMPARE'
]);

function createEtaShadowTelemetry() {
  let enqueued = 0;
  let droppedQueueFull = 0;
  let match = 0;
  let mismatch = 0;
  let errorRunner = 0;
  let errorLegacy = 0;
  let errorCurrent = 0;
  let errorCompare = 0;
  let invalidEvents = 0;

  function recordEvent(event) {
    if (event === null || typeof event !== 'object') {
      invalidEvents++;
      return;
    }

    let type;
    try {
      if (Array.isArray(event)) {
        invalidEvents++;
        return;
      }
      type = event.type;
    } catch {
      invalidEvents++;
      return;
    }

    if (typeof type !== 'string') {
      invalidEvents++;
      return;
    }

    if (type === 'ENQUEUED') {
      enqueued++;
      return;
    }

    if (type === 'MATCH') {
      match++;
      return;
    }

    if (type === 'MISMATCH') {
      mismatch++;
      return;
    }

    if (type === 'DROPPED') {
      let reason;
      try {
        reason = event.reason;
      } catch {
        invalidEvents++;
        return;
      }
      if (ALLOWED_DROPPED_REASONS.includes(reason)) {
        droppedQueueFull++;
        return;
      }
      invalidEvents++;
      return;
    }

    if (type === 'ERROR') {
      let stage;
      try {
        stage = event.stage;
      } catch {
        invalidEvents++;
        return;
      }
      if (ALLOWED_ERROR_STAGES.includes(stage)) {
        if (stage === 'RUNNER') {
          errorRunner++;
        } else if (stage === 'LEGACY') {
          errorLegacy++;
        } else if (stage === 'CURRENT') {
          errorCurrent++;
        } else if (stage === 'COMPARE') {
          errorCompare++;
        }
        return;
      }
      invalidEvents++;
      return;
    }

    invalidEvents++;
  }

  function getSnapshot() {
    return Object.freeze({
      enqueued,
      dropped: Object.freeze({
        QUEUE_FULL: droppedQueueFull
      }),
      match,
      mismatch,
      errors: Object.freeze({
        RUNNER: errorRunner,
        LEGACY: errorLegacy,
        CURRENT: errorCurrent,
        COMPARE: errorCompare
      }),
      invalidEvents
    });
  }

  function resetMetrics() {
    enqueued = 0;
    droppedQueueFull = 0;
    match = 0;
    mismatch = 0;
    errorRunner = 0;
    errorLegacy = 0;
    errorCurrent = 0;
    errorCompare = 0;
    invalidEvents = 0;
  }

  return Object.freeze({
    recordEvent,
    getSnapshot,
    resetMetrics
  });
}

const defaultEtaShadowTelemetry = createEtaShadowTelemetry();

module.exports = {
  createEtaShadowTelemetry,
  defaultEtaShadowTelemetry
};
