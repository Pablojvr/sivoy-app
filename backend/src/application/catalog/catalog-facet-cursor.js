const { CatalogError } = require('../../domains/catalog/catalog.validation');
const { queryFingerprint } = require('./catalog-cursor');

function encodeFacetCursor({ revision, query, position }) {
  const payload = {
    v: 1,
    kind: 'facet',
    revision,
    query: queryFingerprint(query),
    label: position.normalizedLabel,
    value: position.value
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeFacetCursor(cursor, { revision, query }) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (!payload || payload.v !== 1 || payload.kind !== 'facet' ||
      typeof payload.revision !== 'string' || typeof payload.query !== 'string' ||
      typeof payload.label !== 'string' || typeof payload.value !== 'string') {
    throw invalidCursor();
  }
  if (payload.revision !== revision || payload.query !== queryFingerprint(query)) {
    throw new CatalogError(409, 'CURSOR_STALE', 'El catálogo cambió; inicia nuevamente la búsqueda.');
  }
  return { normalizedLabel: payload.label, value: payload.value };
}

function invalidCursor() {
  return new CatalogError(400, 'CURSOR_INVALID', 'El cursor no es válido.', ['cursor']);
}

module.exports = { decodeFacetCursor, encodeFacetCursor };
