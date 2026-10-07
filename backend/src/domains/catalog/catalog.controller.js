const crypto = require('node:crypto');
const { CatalogError, parseListQuery } = require('./catalog.validation');

function createCatalogController({ service }) {
  if (!service || typeof service.listPoints !== 'function') {
    throw new TypeError('Catalog service is invalid');
  }

  async function listPoints(req, res) {
    try {
      const query = parseListQuery(req.query);
      const result = await service.listPoints(query);
      return res.status(200).json(result);
    } catch (error) {
      return sendCatalogError(req, res, error, 'catalog_list_failed');
    }
  }

  return { listPoints };
}

function sendCatalogError(req, res, error, event) {
  const requestId = requestIdFor(res);
  if (error instanceof CatalogError) {
    const safeError = {
      code: error.code,
      message: error.message,
      requestId
    };
    if (Array.isArray(error.fields) && error.fields.length > 0) {
      safeError.fields = error.fields;
    }
    return res.status(error.status).json({ error: safeError });
  }

  try {
    req.log?.error(event, 'catalog_query_error');
  } catch {}
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'No pudimos consultar el catálogo.',
      requestId
    }
  });
}

function requestIdFor(res) {
  const existing = res.getHeader('x-request-id');
  if (typeof existing === 'string' && existing.length > 0) return existing;
  const generated = crypto.randomUUID();
  res.setHeader('x-request-id', generated);
  return generated;
}

module.exports = { createCatalogController, sendCatalogError };
