class CatalogError extends Error {
  constructor(status, code, message, fields = undefined) {
    super(message);
    this.name = 'CatalogError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function singleString(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function boundedFilter(query, key, maximum, errors) {
  const raw = query[key];
  if (raw === undefined) return null;
  const value = singleString(raw);
  if (!value || value.length > maximum) errors.add(key);
  return value;
}

function parseLimit(value, errors) {
  if (value === undefined) return 20;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    errors.add('limit');
    return 20;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 50) errors.add('limit');
  return parsed;
}

function parseListQuery(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw new CatalogError(400, 'VALIDATION_ERROR', 'Los filtros de búsqueda no son válidos.');
  }

  const errors = new Set();
  const companyId = boundedFilter(query, 'companyId', 80, errors);
  const department = boundedFilter(query, 'department', 160, errors);
  const municipality = boundedFilter(query, 'municipality', 160, errors);
  const pointType = boundedFilter(query, 'pointType', 80, errors);
  const q = boundedFilter(query, 'q', 80, errors);
  if (q !== null && q.length < 2) errors.add('q');

  const matchMode = query.matchMode === undefined ? 'CONTAINS' : singleString(query.matchMode);
  if (matchMode !== 'CONTAINS') errors.add('matchMode');

  const limit = parseLimit(query.limit, errors);
  const cursor = boundedFilter(query, 'cursor', 2048, errors);

  if (errors.size > 0) {
    throw new CatalogError(
      400,
      'VALIDATION_ERROR',
      'Los filtros de búsqueda no son válidos.',
      [...errors].sort()
    );
  }

  return {
    companyId,
    department,
    municipality,
    pointType,
    q,
    matchMode,
    limit,
    cursor
  };
}

function parsePointId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 || value.trim() !== value) {
    throw new CatalogError(
      400,
      'VALIDATION_ERROR',
      'El identificador del punto no es válido.',
      ['pointId']
    );
  }
  return value;
}

function parseFacetQuery(query = {}) {
  const parsed = parseListQuery(query);
  const facet = singleString(query.facet);
  if (!['company', 'department', 'municipality', 'pointType'].includes(facet)) {
    throw new CatalogError(
      400,
      'VALIDATION_ERROR',
      'La faceta solicitada no es válida.',
      ['facet']
    );
  }
  return { facet, ...parsed };
}

module.exports = { CatalogError, parseFacetQuery, parseListQuery, parsePointId };
