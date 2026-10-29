'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  parseCompanyId,
  parseCompanyListQuery
} = require('../src/domains/catalog/company-catalog.validation');

describe('public company catalog validation', () => {
  test('normalizes a one-character search and applies bounded pagination defaults', () => {
    assert.deepEqual(parseCompanyListQuery({ q: '  Á  ' }), {
      q: 'a',
      limit: 20,
      cursor: null
    });

    assert.deepEqual(parseCompanyListQuery({}), {
      q: null,
      limit: 20,
      cursor: null
    });
  });

  test('normalizes case and accents while preserving SQL wildcard characters as literal text', () => {
    const query = parseCompanyListQuery({
      q: '  PÉDIDOS %_\\  ',
      limit: '50'
    });

    assert.deepEqual(query, {
      q: 'pedidos %_\\',
      limit: 50,
      cursor: null
    });
  });

  test('accepts the exact query and cursor boundaries', () => {
    const query = parseCompanyListQuery({
      q: 'Á'.repeat(80),
      cursor: 'c'.repeat(2048),
      limit: '1'
    });

    assert.equal(query.q, 'a'.repeat(80));
    assert.equal(query.cursor, 'c'.repeat(2048));
    assert.equal(query.limit, 1);
  });

  test('rejects empty, oversized, non-string and control-bearing searches with a stable error', () => {
    for (const q of [
      '',
      '   ',
      'a'.repeat(81),
      'company\nname',
      'company\u0000name',
      'company\u0085name',
      '\u0301',
      1,
      ['company']
    ]) {
      assertValidationError(
        () => parseCompanyListQuery({ q }),
        ['q']
      );
    }
  });

  test('accepts only canonical integer limits from 1 through 50', () => {
    assert.equal(parseCompanyListQuery({ limit: '1' }).limit, 1);
    assert.equal(parseCompanyListQuery({ limit: '50' }).limit, 50);

    for (const limit of ['0', '51', '01', '+1', '1.0', '-1', '', ' 20 ', 20, ['20']]) {
      assertValidationError(
        () => parseCompanyListQuery({ limit }),
        ['limit']
      );
    }
  });

  test('rejects empty, oversized, non-string and control-bearing cursor inputs before decoding', () => {
    for (const cursor of [
      '',
      '   ',
      'c'.repeat(2049),
      'opaque\rvalue',
      'opaque\u009fvalue',
      1,
      ['opaque']
    ]) {
      assertValidationError(
        () => parseCompanyListQuery({ cursor }),
        ['cursor']
      );
    }
  });

  test('accepts only canonical decimal company identifiers in the PostgreSQL integer range', () => {
    assert.equal(parseCompanyId('1'), '1');
    assert.equal(parseCompanyId('2147483647'), '2147483647');

    for (const companyId of [
      '0',
      '2147483648',
      '01',
      '+1',
      '1.0',
      '-1',
      '',
      ' 1 ',
      '1\n',
      1,
      ['1']
    ]) {
      assertValidationError(
        () => parseCompanyId(companyId),
        ['companyId']
      );
    }
  });

  test('rejects non-object query containers without exposing their content', () => {
    for (const query of [null, [], 'SECRET_QUERY_VALUE']) {
      assertValidationError(
        () => parseCompanyListQuery(query),
        undefined,
        'SECRET_QUERY_VALUE'
      );
    }
  });

  test('converts hostile property access into a safe validation error', () => {
    const query = {};
    Object.defineProperty(query, 'q', {
      enumerable: true,
      get() {
        throw new Error('SECRET_FROM_HOSTILE_GETTER');
      }
    });

    assertValidationError(
      () => parseCompanyListQuery(query),
      ['q'],
      'SECRET_FROM_HOSTILE_GETTER'
    );
  });
});

function assertValidationError(action, fields, secret) {
  assert.throws(action, (error) => {
    assert.equal(error?.status, 400);
    assert.equal(error?.code, 'VALIDATION_ERROR');
    if (fields !== undefined) assert.deepEqual(error.fields, fields);
    if (secret) assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
}
