'use strict';

const { CatalogError } = require('./catalog.validation');

const MAX_COMPANY_ID = 2_147_483_647;
const CONTROL_CHARACTERS = /\p{Cc}/u;
const READ_ERROR = Symbol('company-query-read-error');

function parseCompanyListQuery(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw validationError();
  }

  const errors = new Set();
  const q = parseSearch(safeRead(query, 'q'), errors);
  const limit = parseLimit(safeRead(query, 'limit'), errors);
  const cursor = parseCursor(safeRead(query, 'cursor'), errors);

  if (errors.size > 0) {
    throw validationError([...errors].sort());
  }

  return { q, limit, cursor };
}

function parseCompanyId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) {
    throw validationError(['companyId']);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_COMPANY_ID) {
    throw validationError(['companyId']);
  }

  return value;
}

function parseSearch(value, errors) {
  if (value === undefined) return null;
  if (value === READ_ERROR || typeof value !== 'string') {
    errors.add('q');
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || CONTROL_CHARACTERS.test(trimmed)) {
    errors.add('q');
    return null;
  }

  const normalized = normalizeSearch(trimmed);
  if (!normalized || normalized.length > 80 || CONTROL_CHARACTERS.test(normalized)) {
    errors.add('q');
    return null;
  }

  return normalized;
}

function parseLimit(value, errors) {
  if (value === undefined) return 20;
  if (value === READ_ERROR || typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) {
    errors.add('limit');
    return 20;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 50) {
    errors.add('limit');
    return 20;
  }
  return parsed;
}

function parseCursor(value, errors) {
  if (value === undefined) return null;
  if (value === READ_ERROR || typeof value !== 'string' || value.length < 1 ||
      value.length > 2048 || value.trim() !== value || CONTROL_CHARACTERS.test(value)) {
    errors.add('cursor');
    return null;
  }
  return value;
}

function normalizeSearch(value) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es');
}

function safeRead(object, key) {
  try {
    return object[key];
  } catch {
    return READ_ERROR;
  }
}

function validationError(fields = undefined) {
  return new CatalogError(
    400,
    'VALIDATION_ERROR',
    'Los filtros de empresas no son válidos.',
    fields
  );
}

module.exports = { CatalogError, parseCompanyId, parseCompanyListQuery };
