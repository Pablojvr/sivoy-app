const crypto = require('node:crypto');

const { CatalogError } = require('../../domains/catalog/catalog.validation');

function queryFingerprint(query) {
  const filters = {
    companyId: query.companyId,
    department: query.department,
    municipality: query.municipality,
    pointType: query.pointType,
    q: query.q,
    matchMode: query.matchMode,
    limit: query.limit
  };
  return crypto.createHash('sha256').update(JSON.stringify(filters)).digest('hex');
}

function encodeCursor({ revision, query, position }) {
  const payload = {
    v: 1,
    revision,
    query: queryFingerprint(query),
    name: position.normalizedName,
    pointId: position.pointId
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function invalidCursor() {
  return new CatalogError(400, 'CURSOR_INVALID', 'El cursor no es válido.', ['cursor']);
}

function decodeCursor(cursor, { revision, query }) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }

  if (!payload || payload.v !== 1 ||
      typeof payload.revision !== 'string' ||
      typeof payload.query !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.pointId !== 'string') {
    throw invalidCursor();
  }

  if (payload.revision !== revision || payload.query !== queryFingerprint(query)) {
    throw new CatalogError(409, 'CURSOR_STALE', 'El catálogo cambió; inicia nuevamente la búsqueda.');
  }

  return { normalizedName: payload.name, pointId: payload.pointId };
}

module.exports = { decodeCursor, encodeCursor, queryFingerprint };
