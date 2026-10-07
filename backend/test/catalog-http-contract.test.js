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
