'use strict';

const crypto = require('node:crypto');

const { CatalogError } = require('../../domains/catalog/catalog.validation');
const { parseCompanyId } = require('../../domains/catalog/company-catalog.validation');

const CURSOR_TYPE = 'company';
const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2048;
const MAX_NORMALIZED_NAME_LENGTH = 500;
const MAX_NORMALIZED_NAME_BYTES = 1024;
const CONTROL_CHARACTERS = /\p{Cc}/u;

function companyQueryFingerprint(query) {
  const filters = {
    q: query.q,
    limit: query.limit
  };
  return crypto.createHash('sha256').update(JSON.stringify(filters)).digest('hex');
}

function encodeCompanyCursor({ revision, query, position }) {
  validateEncodeInput(revision, query, position);
  const payload = {
    type: CURSOR_TYPE,
    v: CURSOR_VERSION,
    revision,
    query: companyQueryFingerprint(query),
    matchRank: position.matchRank,
    normalizedName: position.normalizedName,
    companyId: position.companyId
  };
  const cursor = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  if (cursor.length > MAX_CURSOR_LENGTH) {
    throw new TypeError('Company cursor input is invalid');
  }
  return cursor;
}

function decodeCompanyCursor(cursor, { revision, query }) {
  const payload = readPayload(cursor);
  if (!isValidPayload(payload)) throw invalidCursor();

  if (payload.revision !== revision || payload.query !== companyQueryFingerprint(query)) {
    throw new CatalogError(409, 'CURSOR_STALE', 'El catálogo cambió; inicia nuevamente la búsqueda.');
  }

  return {
    matchRank: payload.matchRank,
    normalizedName: payload.normalizedName,
    companyId: payload.companyId
  };
}

function readPayload(cursor) {
  if (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > MAX_CURSOR_LENGTH ||
      !/^[A-Za-z0-9_-]+$/u.test(cursor)) {
    throw invalidCursor();
  }

  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
}

function isValidPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.type !== CURSOR_TYPE || payload.v !== CURSOR_VERSION) return false;
  if (typeof payload.revision !== 'string' || payload.revision.length < 1) return false;
  if (typeof payload.query !== 'string' || !/^[a-f0-9]{64}$/u.test(payload.query)) return false;
  if (!Number.isSafeInteger(payload.matchRank) || payload.matchRank < 0 || payload.matchRank > 2) {
    return false;
  }
  if (typeof payload.normalizedName !== 'string' || payload.normalizedName.length < 1 ||
      payload.normalizedName.length > MAX_NORMALIZED_NAME_LENGTH ||
      Buffer.byteLength(payload.normalizedName, 'utf8') > MAX_NORMALIZED_NAME_BYTES ||
      CONTROL_CHARACTERS.test(payload.normalizedName)) {
    return false;
  }
  try {
    parseCompanyId(payload.companyId);
  } catch {
    return false;
  }
  return true;
}

function validateEncodeInput(revision, query, position) {
  if (typeof revision !== 'string' || revision.length < 1 || !query || typeof query !== 'object' ||
      !position || typeof position !== 'object' || !isValidPayload({
        type: CURSOR_TYPE,
        v: CURSOR_VERSION,
        revision,
        query: companyQueryFingerprint(query),
        matchRank: position.matchRank,
        normalizedName: position.normalizedName,
        companyId: position.companyId
      })) {
    throw new TypeError('Company cursor input is invalid');
  }
}

function invalidCursor() {
  return new CatalogError(400, 'CURSOR_INVALID', 'El cursor no es válido.', ['cursor']);
}

module.exports = {
  companyQueryFingerprint,
  decodeCompanyCursor,
  encodeCompanyCursor
};
