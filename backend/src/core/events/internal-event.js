const crypto = require('node:crypto');

class InternalEventValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'InternalEventValidationError';
    this.code = code;
  }
}

const TYPE_REGEX = /^[a-z]+(?:\.[a-z]+)*\.v[1-9][0-9]*$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val) && (Object.getPrototypeOf(val) === Object.prototype || Object.getPrototypeOf(val) === null);
}

function deepCloneAndValidateJSON(val, pathSeen = new Set()) {
  if (val === null) return null;
  if (typeof val === 'string' || typeof val === 'boolean') return val;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new InternalEventValidationError('NaN/Infinity not allowed', 'INVALID_PAYLOAD');
    }
    return val;
  }

  if (typeof val === 'object') {
    if (pathSeen.has(val)) {
      throw new InternalEventValidationError('Circular reference', 'INVALID_PAYLOAD');
    }

    if (Array.isArray(val)) {
      pathSeen.add(val);
      const clone = new Array(val.length);
      for (let i = 0; i < val.length; i++) {
        if (val[i] === undefined) {
          throw new InternalEventValidationError('undefined not allowed in arrays', 'INVALID_PAYLOAD');
        }
        clone[i] = deepCloneAndValidateJSON(val[i], pathSeen);
      }
      pathSeen.delete(val);
      return clone;
    }

    if (isPlainObject(val)) {
      pathSeen.add(val);
      const clone = {};
      const keys = Reflect.ownKeys(val);
      for (const key of keys) {
        if (typeof key === 'symbol') {
          throw new InternalEventValidationError('Symbol keys are not allowed', 'INVALID_PAYLOAD');
        }
        const desc = Object.getOwnPropertyDescriptor(val, key);
        if (!desc.enumerable) {
          throw new InternalEventValidationError('Non-enumerable properties are not allowed', 'INVALID_PAYLOAD');
        }
        if (desc.get || desc.set) {
          throw new InternalEventValidationError('Accessor properties (get/set) are not allowed', 'INVALID_PAYLOAD');
        }
        if (desc.value === undefined) {
           throw new InternalEventValidationError('undefined not allowed in objects', 'INVALID_PAYLOAD');
        }

        const clonedValue = deepCloneAndValidateJSON(desc.value, pathSeen);
        Object.defineProperty(clone, key, {
          value: clonedValue,
          enumerable: true,
          writable: true,
          configurable: true
        });
      }
      pathSeen.delete(val);
      return clone;
    }

    throw new InternalEventValidationError('Invalid object type (Date/custom prototype/etc)', 'INVALID_PAYLOAD');
  }

  throw new InternalEventValidationError(`Invalid type: ${typeof val}`, 'INVALID_PAYLOAD');
}

function deepFreeze(object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

function createInternalEvent(input, dependencies = {}) {
  if (!isPlainObject(input)) {
    throw new InternalEventValidationError('Input must be a plain object', 'INVALID_INPUT');
  }

  const {
    type,
    source,
    payload,
    privacy = 'internal'
  } = input;

  const generateId = dependencies.generateId || crypto.randomUUID;
  const now = dependencies.now || (() => new Date().toISOString());

  if (!type || !TYPE_REGEX.test(type)) {
    throw new InternalEventValidationError('Invalid event type format. Must be lowercase dot-separated ending with .vN (N>=1)', 'INVALID_TYPE');
  }

  if (typeof source !== 'string' || source.trim() === '') {
    throw new InternalEventValidationError('Source must be a non-blank string', 'INVALID_SOURCE');
  }

  if (!isPlainObject(payload)) {
    throw new InternalEventValidationError('Payload must be a plain object', 'INVALID_PAYLOAD');
  }

  const clonedPayload = deepCloneAndValidateJSON(payload);

  if (!['public', 'internal', 'pii'].includes(privacy)) {
    throw new InternalEventValidationError('Privacy must be one of: public, internal, pii', 'INVALID_PRIVACY');
  }

  const eventId = generateId();
  if (!eventId || !UUID_REGEX.test(eventId)) {
    throw new InternalEventValidationError('Invalid UUID generator output', 'INVALID_ID');
  }

  const occurredAt = now();
  let isStrictIso = false;
  try {
    isStrictIso = (typeof occurredAt === 'string' && occurredAt === new Date(occurredAt).toISOString());
  } catch (e) {
    isStrictIso = false;
  }

  if (!isStrictIso) {
    throw new InternalEventValidationError('Invalid clock output for occurredAt, must be strict canonical ISO instant', 'INVALID_TIMESTAMP');
  }

  const event = {
    eventId,
    type,
    source,
    payload: clonedPayload,
    privacy,
    occurredAt
  };

  return deepFreeze(event);
}

module.exports = {
  createInternalEvent,
  InternalEventValidationError
};
