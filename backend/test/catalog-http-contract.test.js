const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { CatalogError } = require('../src/domains/catalog/catalog.validation');
const { createCatalogRouter } = require('../src/domains/catalog/catalog.routes');

const REQUEST_ID = '6da76a21-6c9c-4fae-9af1-ddc358407aea';

describe('catalog HTTP contract', () => {
  test('GET /api/catalog/points validates and forwards a bounded canonical query', async () => {
    let receivedQuery;
    const expected = {
      data: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:1' }
    };
    const service = {
      listPoints: async (query) => {
        receivedQuery = query;
        return expected;
      }
    };

    const response = await fetchCatalog(
      service,
      '/api/catalog/points?municipality=Soyapango&q=centro&matchMode=CONTAINS'
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, expected);
    assert.deepEqual(receivedQuery, {
      companyId: null,
      department: null,
      municipality: 'Soyapango',
      pointType: null,
      q: 'centro',
      matchMode: 'CONTAINS',
      limit: 20,
      cursor: null
    });
  });

  test('returns the uniform validation envelope without invoking the service', async () => {
    let calls = 0;
    const response = await fetchCatalog(
      { listPoints: async () => { calls += 1; } },
      '/api/catalog/points?limit=51'
    );

    assert.equal(calls, 0);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los filtros de búsqueda no son válidos.',
        requestId: REQUEST_ID,
        fields: ['limit']
      }
    });
  });

  test('preserves safe catalog errors such as stale cursors', async () => {
    const response = await fetchCatalog({
      listPoints: async () => {
        throw new CatalogError(409, 'CURSOR_STALE', 'El catálogo cambió; inicia una nueva búsqueda.');
      }
    }, '/api/catalog/points');

    assert.equal(response.status, 409);
    assert.deepEqual(response.body, {
      error: {
        code: 'CURSOR_STALE',
        message: 'El catálogo cambió; inicia una nueva búsqueda.',
        requestId: REQUEST_ID
      }
    });
  });

  test('hides unexpected provider details and emits a bounded error event', async () => {
    const events = [];
    const response = await fetchCatalog({
      listPoints: async () => {
        throw new Error('password authentication failed for postgres://secret');
      }
    }, '/api/catalog/points', events);

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'No pudimos consultar el catálogo.',
        requestId: REQUEST_ID
      }
    });
    assert.deepEqual(events, [['catalog_list_failed', 'catalog_query_error']]);
    assert.doesNotMatch(JSON.stringify(response.body), /password|postgres|secret/i);
  });

  test('GET /api/catalog/points/:pointId returns the canonical point detail', async () => {
    let receivedPointId;
    const expected = { pointId: 'AG_SOYAPANGO_01', schedules: [] };
    const response = await fetchCatalog({
      listPoints: async () => ({ data: [] }),
      getPointDetails: async (pointId) => {
        receivedPointId = pointId;
        return expected;
      }
    }, '/api/catalog/points/AG_SOYAPANGO_01');

    assert.equal(response.status, 200);
    assert.equal(receivedPointId, 'AG_SOYAPANGO_01');
    assert.deepEqual(response.body, expected);
  });

  test('rejects an invalid point identity before invoking the detail service', async () => {
    let calls = 0;
    const response = await fetchCatalog({
      listPoints: async () => ({ data: [] }),
      getPointDetails: async () => { calls += 1; }
    }, `/api/catalog/points/${'A'.repeat(161)}`);

    assert.equal(calls, 0);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'El identificador del punto no es válido.',
        requestId: REQUEST_ID,
        fields: ['pointId']
      }
    });
  });

  test('GET /api/catalog/facets forwards a validated facet query', async () => {
    let receivedQuery;
    const expected = {
      data: [{ value: 'Soyapango', label: 'Soyapango', count: 3 }],
      page: { limit: 20, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:1' }
    };
    const response = await fetchCatalog({
      listPoints: async () => ({ data: [] }),
      listFacets: async (query) => {
        receivedQuery = query;
        return expected;
      }
    }, '/api/catalog/facets?facet=municipality&department=San%20Salvador&q=soy');

    assert.equal(response.status, 200);
    assert.equal(receivedQuery.facet, 'municipality');
    assert.equal(receivedQuery.department, 'San Salvador');
    assert.deepEqual(response.body, expected);
  });

  test('rejects unsupported facet dimensions before invoking the service', async () => {
    let calls = 0;
    const response = await fetchCatalog({
      listPoints: async () => ({ data: [] }),
      listFacets: async () => { calls += 1; }
    }, '/api/catalog/facets?facet=tableName');

    assert.equal(calls, 0);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body.error.fields, ['facet']);
    assert.equal(response.body.error.requestId, REQUEST_ID);
  });
});

function fetchCatalog(service, path, events = []) {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('x-request-id', REQUEST_ID);
    req.log = { error: (...args) => events.push(args), warn: () => {} };
    next();
  });
  app.use('/api/catalog', createCatalogRouter({ service }));

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      fetch(`http://127.0.0.1:${server.address().port}${path}`)
        .then(async (response) => {
          const body = await response.json();
          server.close(() => resolve({ status: response.status, body }));
        })
        .catch((error) => server.close(() => reject(error)));
    });
  });
}
