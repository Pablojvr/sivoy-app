'use strict';

const INVALID_SNAPSHOT_MESSAGE = 'Invalid canonical ETA snapshot: expected a plain serializable object';

function invalidSnapshot() {
  return new TypeError(INVALID_SNAPSHOT_MESSAGE);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneSerializable(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalidSnapshot();
    return value;
  }
  if (typeof value !== 'object') throw invalidSnapshot();
  if (ancestors.has(value)) throw invalidSnapshot();

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) throw invalidSnapshot();
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.getOwnPropertyNames(value).length !== value.length + 1) throw invalidSnapshot();
      const clone = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw invalidSnapshot();
        clone[index] = cloneSerializable(descriptor.value, ancestors);
      }
      return clone;
    }

    if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
      throw invalidSnapshot();
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const clone = {};
    for (const key of Object.keys(descriptors).sort()) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw invalidSnapshot();
      Object.defineProperty(clone, key, {
        value: cloneSerializable(descriptor.value, ancestors),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return clone;
  } finally {
    ancestors.delete(value);
  }
}

function appendObjectPath(path, key) {
  return path ? `${path}.${key}` : key;
}

function appendArrayPath(path, index) {
  return `${path}[${index}]`;
}

function addDifference(differences, path, kind, expected, actual) {
  const difference = { path, kind };
  if (kind !== 'unexpected') {
    Object.defineProperty(difference, 'expected', {
      value: expected,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  if (kind !== 'missing') {
    Object.defineProperty(difference, 'actual', {
      value: actual,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  differences.push(difference);
}

function compareValues(expected, actual, path, differences) {
  if (Object.is(expected, actual)) return;

  const expectedArray = Array.isArray(expected);
  const actualArray = Array.isArray(actual);
  if (expectedArray || actualArray) {
    if (!expectedArray || !actualArray) {
      addDifference(differences, path, 'changed', expected, actual);
      return;
    }

    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      const itemPath = appendArrayPath(path, index);
      if (index >= actual.length) {
        addDifference(differences, itemPath, 'missing', expected[index]);
      } else if (index >= expected.length) {
        addDifference(differences, itemPath, 'unexpected', undefined, actual[index]);
      } else {
        compareValues(expected[index], actual[index], itemPath, differences);
      }
    }
    return;
  }

  const expectedObject = isPlainObject(expected);
  const actualObject = isPlainObject(actual);
  if (expectedObject || actualObject) {
    if (!expectedObject || !actualObject) {
      addDifference(differences, path, 'changed', expected, actual);
      return;
    }

    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      const propertyPath = appendObjectPath(path, key);
      const hasExpected = Object.hasOwn(expected, key);
      const hasActual = Object.hasOwn(actual, key);
      if (!hasActual) {
        addDifference(differences, propertyPath, 'missing', expected[key]);
      } else if (!hasExpected) {
        addDifference(differences, propertyPath, 'unexpected', undefined, actual[key]);
      } else {
        compareValues(expected[key], actual[key], propertyPath, differences);
      }
    }
    return;
  }

  addDifference(differences, path, 'changed', expected, actual);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function compareEtaSnapshots(expected, actual) {
  if (!isPlainObject(expected) || !isPlainObject(actual)) throw invalidSnapshot();

  const expectedClone = cloneSerializable(expected);
  const actualClone = cloneSerializable(actual);
  const differences = [];
  compareValues(expectedClone, actualClone, '', differences);
  differences.sort((left, right) => {
    if (left.path < right.path) return -1;
    if (left.path > right.path) return 1;
    return 0;
  });

  return deepFreeze({
    matches: differences.length === 0,
    differences
  });
}

module.exports = {
  compareEtaSnapshots
};
