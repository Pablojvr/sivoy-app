'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  parseCompanyListQuery
} = require('../src/domains/catalog/company-catalog.validation');
const {
  decodeCompanyCursor,
  encodeCompanyCursor
} = require('../src/application/catalog/company-cursor');
const {
  encodeCursor: encodePointCursor
} = require('../src/application/catalog/catalog-cursor');
const {
  parseListQuery: parsePointListQuery
} = require('../src/domains/catalog/catalog.validation');

describe('public company catalog cursor', () => {
  test('round-trips the total company ordering position', () => {
    const query = parseCompanyListQuery({ q: 'Pédidos', limit: '2' });
    const cursor = encodeCompanyCursor({
      revision: 'catalog:12',
      query,
      position: {
        matchRank: 1,
        normalizedName: 'pedidos express',
        companyId: '7'
      }
    });

    assert.match(cursor, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(
      decodeCompanyCursor(cursor, { revision: 'catalog:12', query }),
      {
        matchRank: 1,
        normalizedName: 'pedidos express',
        companyId: '7'
      }
    );
  });

  test('binds the cursor to an explicit company type and version', () => {
    const query = parseCompanyListQuery({ q: 'pedidos' });
    const cursor = encodeCompanyCursor({
      revision: 'catalog:12',
      query,
      position: {
        matchRank: 0,
        normalizedName: 'pedidos express',
        companyId: '1'
      }
    });
    const payload = readOpaquePayload(cursor);

    assert.equal(typeof payload.type, 'string');
    assert.notEqual(payload.type.length, 0);
    assert.equal(payload.v, 1);

    assertInvalidCursor(
      () => decodeCompanyCursor(
        rewriteOpaquePayload(cursor, (value) => ({ ...value, type: 'points' })),
        { revision: 'catalog:12', query }
      )
    );
    assertInvalidCursor(
      () => decodeCompanyCursor(
        rewriteOpaquePayload(cursor, (value) => ({ ...value, v: 2 })),
        { revision: 'catalog:12', query }
      )
    );
  });

  test('accepts the same normalized query representation', () => {
    const encodedQuery = parseCompanyListQuery({ q: '  PÉDIDOS %_\\  ', limit: '20' });
    const equivalentQuery = parseCompanyListQuery({ q: 'pedidos %_\\', limit: '20' });
    const cursor = encodeCompanyCursor({
      revision: 'catalog:12',
      query: encodedQuery,
      position: {
        matchRank: 2,
        normalizedName: 'pedidos express',
        companyId: '3'
      }
    });

    assert.deepEqual(
      decodeCompanyCursor(cursor, {
        revision: 'catalog:12',
        query: equivalentQuery
      }),
      {
        matchRank: 2,
        normalizedName: 'pedidos express',
        companyId: '3'
      }
    );
  });

  test('marks a cursor stale when the literal normalized search or limit changes', () => {
    const query = parseCompanyListQuery({ q: 'empresa %_\\', limit: '20' });
    const cursor = encodeCompanyCursor({
      revision: 'catalog:12',
      query,
      position: {
        matchRank: 2,
        normalizedName: 'empresa central',
        companyId: '8'
      }
    });

    for (const changedQuery of [
      parseCompanyListQuery({ q: 'empresa', limit: '20' }),
      parseCompanyListQuery({ q: 'empresa %_\\', limit: '21' })
    ]) {
      assertStaleCursor(
        () => decodeCompanyCursor(cursor, {
          revision: 'catalog:12',
          query: changedQuery
        })
      );
    }
  });

  test('marks a cursor stale when the catalog revision changes', () => {
    const query = parseCompanyListQuery({});
    const cursor = encodeCompanyCursor({
      revision: 'catalog:12',
      query,
      position: {
        matchRank: 0,
        normalizedName: 'empresa central',
        companyId: '8'
      }
    });

    assertStaleCursor(
      () => decodeCompanyCursor(cursor, {
        revision: 'catalog:13',
        query
      })
    );
  });

  test('rejects malformed and structurally manipulated cursors as untrusted pagination state', () => {
    const query = parseCompanyListQuery({ q: 'empresa' });
    const cursor = encodeCompanyCursor({
      revision: 'catalog:12',
      query,
      position: {
        matchRank: 1,
        normalizedName: 'empresa central',
        companyId: '8'
      }
    });

    const missingPosition = rewriteOpaquePayload(cursor, (payload) => {
      const changed = { ...payload };
      delete changed.companyId;
      return changed;
    });

    for (const untrustedCursor of [
      'not-a-company-cursor',
      Buffer.from('{', 'utf8').toString('base64url'),
      missingPosition
    ]) {
      assertInvalidCursor(
        () => decodeCompanyCursor(untrustedCursor, {
          revision: 'catalog:12',
          query
        })
      );
    }
  });

  test('rejects ordering positions outside the real ranking domain', () => {
    const query = parseCompanyListQuery({ q: 'empresa' });
    const cursor = encodeCompanyCursor({
      revision: 'catalog:12',
      query,
      position: {
        matchRank: 1,
        normalizedName: 'empresa central',
        companyId: '8'
      }
    });

    for (const matchRank of [-1, 3, 99]) {
      assertInvalidCursor(
        () => decodeCompanyCursor(
          rewriteOpaquePayload(cursor, (payload) => ({ ...payload, matchRank })),
          { revision: 'catalog:12', query }
        )
      );
    }
  });

  test('never emits a cursor that exceeds the parser contract', () => {
    const query = parseCompanyListQuery({ q: 'empresa' });

    assert.throws(
      () => encodeCompanyCursor({
        revision: 'catalog:12',
        query,
        position: {
          matchRank: 1,
          normalizedName: '界'.repeat(500),
          companyId: '8'
        }
      }),
      TypeError
    );
  });

  test('rejects Unicode control characters inside an opaque ordering position', () => {
    const query = parseCompanyListQuery({ q: 'empresa' });
    const cursor = encodeCompanyCursor({
      revision: 'catalog:12',
      query,
      position: {
        matchRank: 1,
        normalizedName: 'empresa central',
        companyId: '8'
      }
    });

    assertInvalidCursor(
      () => decodeCompanyCursor(
        rewriteOpaquePayload(cursor, (payload) => ({
          ...payload,
          normalizedName: 'empresa\u0085central'
        })),
        { revision: 'catalog:12', query }
      )
    );
  });

  test('rejects a point cursor instead of treating it as company pagination state', () => {
    const pointQuery = parsePointListQuery({ municipality: 'Soyapango' });
    const pointCursor = encodePointCursor({
      revision: 'catalog:12',
      query: pointQuery,
      position: {
        normalizedName: 'agencia centro',
        pointId: 'AG_01'
      }
    });

    assertInvalidCursor(
      () => decodeCompanyCursor(pointCursor, {
        revision: 'catalog:12',
        query: parseCompanyListQuery({})
      })
    );
  });
});

function readOpaquePayload(cursor) {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
}

function rewriteOpaquePayload(cursor, change) {
  const payload = change(readOpaquePayload(cursor));
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function assertInvalidCursor(action) {
  assert.throws(action, (error) => {
    assert.equal(error?.status, 400);
    assert.equal(error?.code, 'CURSOR_INVALID');
    assert.deepEqual(error.fields, ['cursor']);
    return true;
  });
}

function assertStaleCursor(action) {
  assert.throws(action, (error) => {
    assert.equal(error?.status, 409);
    assert.equal(error?.code, 'CURSOR_STALE');
    return true;
  });
}
