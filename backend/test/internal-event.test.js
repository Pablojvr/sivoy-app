'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInternalEvent, InternalEventValidationError } = require('../src/core/events/internal-event');

test('Internal Event', async (t) => {
  const validPayload = { user: '123', data: { nested: true } };

  await t.test('creates valid deterministic envelope exact shape', () => {
    const event = createInternalEvent(
      { type: 'user.created.v1', source: 'auth-service', payload: validPayload },
      { generateId: () => '123e4567-e89b-12d3-a456-426614174000', now: () => '2026-09-13T00:00:00.000Z' }
    );
    assert.deepEqual(event, {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      type: 'user.created.v1',
      source: 'auth-service',
      payload: validPayload,
      privacy: 'internal',
      occurredAt: '2026-09-13T00:00:00.000Z'
    });
  });

  await t.test('default privacy is internal', () => {
    const event = createInternalEvent(
      { type: 'item.added.v2', source: 'inventory', payload: validPayload },
      { generateId: () => '123e4567-e89b-12d3-a456-426614174000', now: () => '2026-09-13T00:00:00.000Z' }
    );
    assert.equal(event.privacy, 'internal');
  });

  await t.test('invalid/unversioned type; v0 rejected', () => {
    assert.throws(
      () => createInternalEvent({ type: 'user.created', source: 'src', payload: {} }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_TYPE'
    );
    assert.throws(
      () => createInternalEvent({ type: 'user.created.v0', source: 'src', payload: {} }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_TYPE'
    );
    assert.throws(
      () => createInternalEvent({ type: 'User.Created.v1', source: 'src', payload: {} }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_TYPE'
    );
  });

  await t.test('blank source', () => {
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: '   ', payload: {} }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_SOURCE'
    );
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: '', payload: {} }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_SOURCE'
    );
  });

  await t.test('invalid payload null/array', () => {
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: null }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: [] }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: 'string' }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );
  });

  await t.test('invalid privacy', () => {
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: {}, privacy: 'secret' }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PRIVACY'
    );
  });

  await t.test('invalid UUID generator output', () => {
    assert.throws(
      () => createInternalEvent(
        { type: 'x.v1', source: 'src', payload: {} },
        { generateId: () => 'not-a-uuid', now: () => '2026-09-13T00:00:00.000Z' }
      ),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_ID'
    );
    // Malformed version (0)
    assert.throws(
      () => createInternalEvent(
        { type: 'x.v1', source: 'src', payload: {} },
        { generateId: () => '123e4567-e89b-02d3-a456-426614174000', now: () => '2026-09-13T00:00:00.000Z' }
      ),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_ID'
    );
    // Malformed variant (7)
    assert.throws(
      () => createInternalEvent(
        { type: 'x.v1', source: 'src', payload: {} },
        { generateId: () => '123e4567-e89b-12d3-7456-426614174000', now: () => '2026-09-13T00:00:00.000Z' }
      ),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_ID'
    );
  });

  await t.test('invalid clock output', () => {
    assert.throws(
      () => createInternalEvent(
        { type: 'x.v1', source: 'src', payload: {} },
        { generateId: () => '123e4567-e89b-12d3-a456-426614174000', now: () => 'not-a-date' }
      ),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_TIMESTAMP'
    );

    // date-only rejected
    assert.throws(
      () => createInternalEvent(
        { type: 'x.v1', source: 'src', payload: {} },
        { generateId: () => '123e4567-e89b-12d3-a456-426614174000', now: () => '2026-09-13' }
      ),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_TIMESTAMP'
    );
  });

  await t.test('invalid input handling', () => {
    assert.throws(
      () => createInternalEvent(null, { generateId: () => '123e4567-e89b-12d3-a456-426614174000', now: () => '2026-09-13T00:00:00.000Z' }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_INPUT'
    );
    assert.throws(
      () => createInternalEvent('string', { generateId: () => '123e4567-e89b-12d3-a456-426614174000', now: () => '2026-09-13T00:00:00.000Z' }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_INPUT'
    );
  });

  await t.test('immutability including nested payload', () => {
    const event = createInternalEvent(
      { type: 'x.v1', source: 'src', payload: { a: { b: 1 }, arr: [1, 2] } },
      { generateId: () => '123e4567-e89b-12d3-a456-426614174000', now: () => '2026-09-13T00:00:00.000Z' }
    );

    assert.throws(() => { event.type = 'y.v2'; }, TypeError);
    assert.throws(() => { event.payload.a = {}; }, TypeError);
    assert.throws(() => { event.payload.a.b = 2; }, TypeError);
    assert.throws(() => { event.payload.arr[0] = 3; }, TypeError);
    assert.throws(() => { event.payload.arr.push(3); }, TypeError);

    assert.equal(event.type, 'x.v1');
    assert.equal(event.payload.a.b, 1);
    assert.equal(event.payload.arr[0], 1);
  });

  await t.test('caller payload remains mutable and event is unaffected by caller mutation', () => {
    const callerPayload = { a: 1, nested: { b: 2 } };
    const event = createInternalEvent(
      { type: 'x.v1', source: 'src', payload: callerPayload },
      { generateId: () => '123e4567-e89b-12d3-a456-426614174000', now: () => '2026-09-13T00:00:00.000Z' }
    );

    // Caller payload is not frozen
    callerPayload.a = 42;
    callerPayload.nested.b = 43;

    assert.equal(callerPayload.a, 42);
    assert.equal(callerPayload.nested.b, 43);

    // Event remains unchanged
    assert.equal(event.payload.a, 1);
    assert.equal(event.payload.nested.b, 2);
  });

  await t.test('reject non-JSON-safe and circular payloads', () => {
    const circular = { a: 1 };
    circular.self = circular;

    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: circular }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: { d: new Date() } }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: { f: () => {} } }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: { s: Symbol('s') } }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: { b: 10n } }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: { u: undefined } }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: { nan: NaN } }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: { inf: Infinity } }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    class CustomClass {}
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: { custom: new CustomClass() } }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );
  });

  await t.test('prototype pollution, getters, non-enumerable, symbol', () => {
    // 1. JSON-parsed own __proto__
    const payloadWithProto = JSON.parse('{"__proto__": {"polluted": true}}');
    const event = createInternalEvent(
      { type: 'x.v1', source: 'src', payload: payloadWithProto },
      { generateId: () => '123e4567-e89b-12d3-a456-426614174000', now: () => '2026-09-13T00:00:00.000Z' }
    );
    assert.equal(event.payload.__proto__.polluted, true);
    assert.equal(Object.getPrototypeOf(event.payload), Object.prototype);
    assert.equal({}.polluted, undefined); // No pollution

    // 2. non-enumerable
    const nonEnumPayload = {};
    Object.defineProperty(nonEnumPayload, 'hidden', { value: 123, enumerable: false });
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: nonEnumPayload }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    // 3. getter
    const getterPayload = {};
    Object.defineProperty(getterPayload, 'prop', { get: () => 123, enumerable: true });
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: getterPayload }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    // 4. setter
    const setterPayload = {};
    Object.defineProperty(setterPayload, 'prop', { set: (v) => {}, enumerable: true });
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: setterPayload }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );

    // 5. symbol key
    const symbolKeyPayload = {};
    symbolKeyPayload[Symbol('secret')] = 'value';
    assert.throws(
      () => createInternalEvent({ type: 'x.v1', source: 'src', payload: symbolKeyPayload }),
      (err) => err instanceof InternalEventValidationError && err.code === 'INVALID_PAYLOAD'
    );
  });
});
