'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { CatalogError } = require('../src/domains/catalog/catalog.validation');
const { createCatalogRouter } = require('../src/domains/catalog/catalog.routes');

const REQUEST_ID = 'f8ac349f-879d-4596-87ce-21de7f0684a3';

describe('public company catalog HTTP contract', () => {
  test('exposes a dedicated injectable company catalog controller factory', () => {
    const { createCompanyCatalogController } = require(
      '../src/domains/catalog/company-catalog.controller'
    );

    assert.equal(typeof createCompanyCatalogController, 'function');
  });

  test('GET /api/catalog/companies accepts one search character and forwards a canonical query', async () => {
    let receivedQuery;
    const expected = {
      data: [],
      page: { limit: 7, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:12' }
    };
    const companyService = {
      listCompanies: async (query) => {
        receivedQuery = query;
        return expected;
      },
      getCompanyProfile: async () => ({})
    };

    const response = await fetchCompanyCatalog(
      companyService,
      '/api/catalog/companies?q=%C3%81&limit=7&cursor=opaque-cursor'
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, expected);
    assert.deepEqual(receivedQuery, {
      q: 'a',
      limit: 7,
      cursor: 'opaque-cursor'
    });
  });

  test('rejects an invalid company list query before invoking the service', async () => {
    let calls = 0;
    const response = await fetchCompanyCatalog({
      listCompanies: async () => { calls += 1; },
      getCompanyProfile: async () => ({})
    }, '/api/catalog/companies?limit=51');

    assert.equal(calls, 0);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los filtros de empresas no son válidos.',
        requestId: REQUEST_ID,
        fields: ['limit']
      }
    });
  });

  test('GET /api/catalog/companies/:companyId validates and forwards the canonical identity', async () => {
    let receivedCompanyId;
    const expected = {
      companyId: '42',
      name: 'Pedidos Express',
      socialLinks: [],
      coverage: { pointCount: 0, municipalityCount: 0, departmentCount: 0 }
    };
    const response = await fetchCompanyCatalog({
      listCompanies: async () => ({ data: [] }),
      getCompanyProfile: async (companyId) => {
        receivedCompanyId = companyId;
        return expected;
      }
    }, '/api/catalog/companies/42');

    assert.equal(response.status, 200);
    assert.equal(receivedCompanyId, '42');
    assert.deepEqual(response.body, expected);
  });

  test('rejects a non-canonical company identity before invoking the service', async () => {
    let calls = 0;
    const response = await fetchCompanyCatalog({
      listCompanies: async () => ({ data: [] }),
      getCompanyProfile: async () => { calls += 1; }
    }, '/api/catalog/companies/01');

    assert.equal(calls, 0);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los filtros de empresas no son válidos.',
        requestId: REQUEST_ID,
        fields: ['companyId']
      }
    });
  });

  test('preserves safe company catalog errors for missing profiles and stale cursors', async (t) => {
    await t.test('404 COMPANY_NOT_FOUND', async () => {
      const response = await fetchCompanyCatalog({
        listCompanies: async () => ({ data: [] }),
        getCompanyProfile: async () => {
          throw new CatalogError(404, 'COMPANY_NOT_FOUND', 'No encontramos la empresa solicitada.');
        }
      }, '/api/catalog/companies/999');

      assert.equal(response.status, 404);
      assert.deepEqual(response.body, {
        error: {
          code: 'COMPANY_NOT_FOUND',
          message: 'No encontramos la empresa solicitada.',
          requestId: REQUEST_ID
        }
      });
    });

    await t.test('409 CURSOR_STALE', async () => {
      const response = await fetchCompanyCatalog({
        listCompanies: async () => {
          throw new CatalogError(409, 'CURSOR_STALE', 'El catálogo cambió; inicia nuevamente la búsqueda.');
        },
        getCompanyProfile: async () => ({})
      }, '/api/catalog/companies?cursor=stale');

      assert.equal(response.status, 409);
      assert.deepEqual(response.body, {
        error: {
          code: 'CURSOR_STALE',
          message: 'El catálogo cambió; inicia nuevamente la búsqueda.',
          requestId: REQUEST_ID
        }
      });
    });
  });

  test('hides unexpected details and logs only fixed company catalog tokens', async () => {
    const events = [];
    const hostileInput = 'secret-company-search';
    const response = await fetchCompanyCatalog({
      listCompanies: async () => {
        throw new Error(`SELECT password FROM companies WHERE name = ${hostileInput}`);
      },
      getCompanyProfile: async () => ({})
    }, `/api/catalog/companies?q=${hostileInput}`, events);

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'No pudimos consultar el catálogo.',
        requestId: REQUEST_ID
      }
    });
    assert.deepEqual(events, [['company_catalog_list_failed', 'catalog_query_error']]);
    const serialized = JSON.stringify({ body: response.body, events });
    assert.doesNotMatch(serialized, /SELECT|password|secret-company-search|stack/i);
  });

  test('does not register company catalog write methods or invoke the service', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      let calls = 0;
      const response = await fetchCompanyCatalog({
        listCompanies: async () => { calls += 1; },
        getCompanyProfile: async () => { calls += 1; }
      }, '/api/catalog/companies/42', [], method);

      assert.equal(response.status, 404, method);
      assert.equal(calls, 0, method);
    }
  });
});

function fetchCompanyCatalog(companyService, path, events = [], method = 'GET') {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('x-request-id', REQUEST_ID);
    req.log = { error: (...args) => events.push(args), warn: () => {} };
    next();
  });
  app.use('/api/catalog', createCatalogRouter({
    service: createPointCatalogStub(),
    companyService
  }));
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }));

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      fetch(`http://127.0.0.1:${server.address().port}${path}`, { method })
        .then(async (response) => {
          const body = await response.json();
          server.close(() => resolve({ status: response.status, body }));
        })
        .catch((error) => server.close(() => reject(error)));
    });
  });
}

function createPointCatalogStub() {
  return {
    listPoints: async () => ({ data: [] }),
    listFacets: async () => ({ data: [] }),
    getPointDetails: async () => ({})
  };
}
