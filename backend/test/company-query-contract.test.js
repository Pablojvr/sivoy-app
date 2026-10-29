'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { CatalogError } = require('../src/domains/catalog/catalog.validation');
const {
  parseCompanyListQuery
} = require('../src/domains/catalog/company-catalog.validation');
const {
  createCompanyQueryService
} = require('../src/application/catalog/company-query.service');

describe('public company query service', () => {
  test('builds a bounded list envelope and binds cursor work to query and revision', async () => {
    const query = parseCompanyListQuery({ q: 'pedidos', limit: '2', cursor: 'opaque-cursor' });
    const decodedPosition = {
      matchRank: 1,
      normalizedName: 'pedidos central',
      companyId: '7'
    };
    const rawCompanies = [
      companyRow({ id: '8', name: 'Pedidos Express', rank: 1 }),
      companyRow({ id: '9', name: 'Mis Pedidos', rank: 2 })
    ];
    const cursorCalls = [];
    const repository = {
      getRevision: async () => 'catalog:27',
      getCompanyProfile: async () => null,
      listCompanies: async (received) => {
        assert.deepEqual(received, { ...query, position: decodedPosition });
        return { companies: rawCompanies, hasMore: true };
      }
    };
    const policy = {
      presentListItem: (company) => ({
        companyId: company.companyId,
        name: company.name,
        logoUrl: company.logoUrl,
        pointCount: company.pointCount,
        municipalityCount: company.municipalityCount
      }),
      presentProfile: (company) => company
    };
    const cursorCodec = {
      decode: (cursor, context) => {
        cursorCalls.push({ operation: 'decode', cursor, context });
        return decodedPosition;
      },
      encode: (input) => {
        cursorCalls.push({ operation: 'encode', input });
        return 'next-company-cursor';
      }
    };
    const service = createCompanyQueryService({
      repository,
      cache: memoryCache(),
      policy,
      cursorCodec
    });

    const result = await service.listCompanies(query);

    assert.deepEqual(result, {
      data: [
        {
          companyId: '8',
          name: 'Pedidos Express',
          logoUrl: null,
          pointCount: 3,
          municipalityCount: 2
        },
        {
          companyId: '9',
          name: 'Mis Pedidos',
          logoUrl: null,
          pointCount: 3,
          municipalityCount: 2
        }
      ],
      page: { limit: 2, hasMore: true, nextCursor: 'next-company-cursor' },
      meta: { catalogRevision: 'catalog:27' }
    });
    assert.deepEqual(cursorCalls[0], {
      operation: 'decode',
      cursor: 'opaque-cursor',
      context: { revision: 'catalog:27', query }
    });
    assert.deepEqual(cursorCalls[1], {
      operation: 'encode',
      input: {
        revision: 'catalog:27',
        query,
        position: {
          matchRank: 2,
          normalizedName: 'mis pedidos',
          companyId: '9'
        }
      }
    });
  });

  test('does not emit a next cursor for an empty or terminal page', async () => {
    let encodeCalls = 0;
    const service = createCompanyQueryService({
      repository: {
        getRevision: async () => 'catalog:27',
        getCompanyProfile: async () => null,
        listCompanies: async () => ({ companies: [], hasMore: false })
      },
      cache: memoryCache(),
      policy: passthroughPolicy(),
      cursorCodec: {
        decode: () => assert.fail('a first page must not decode a cursor'),
        encode: () => {
          encodeCalls += 1;
          return 'unexpected';
        }
      }
    });

    const result = await service.listCompanies(parseCompanyListQuery({ limit: '20' }));

    assert.deepEqual(result.page, { limit: 20, hasMore: false, nextCursor: null });
    assert.equal(encodeCalls, 0);
  });

  test('uses the real company cursor codec by default', async () => {
    const query = parseCompanyListQuery({ q: 'empresa', limit: '1' });
    const company = companyRow({ id: '11', name: 'Empresa Uno', rank: 0 });
    const service = createCompanyQueryService({
      repository: {
        getRevision: async () => 'catalog:31',
        getCompanyProfile: async () => null,
        listCompanies: async () => ({ companies: [company], hasMore: true })
      },
      cache: memoryCache(),
      policy: passthroughPolicy()
    });

    const first = await service.listCompanies(query);

    assert.match(first.page.nextCursor, /^[A-Za-z0-9_-]+$/u);
    assert.ok(first.page.nextCursor.length <= 2048);
  });

  test('returns a stable public profile DTO and a safe not-found error', async () => {
    const raw = companyProfile();
    const policy = {
      presentListItem: (company) => company,
      presentProfile: (company) => ({ ...company, sanitized: true })
    };
    const repository = {
      getRevision: async () => 'catalog:44',
      listCompanies: async () => ({ companies: [], hasMore: false }),
      getCompanyProfile: async (companyId) => companyId === '42' ? raw : null
    };
    const service = createCompanyQueryService({
      repository,
      cache: memoryCache(),
      policy
    });

    assert.deepEqual(await service.getCompanyProfile('42'), { ...raw, sanitized: true });
    await assert.rejects(
      service.getCompanyProfile('99'),
      (error) => {
        assert.ok(error instanceof CatalogError);
        assert.equal(error.status, 404);
        assert.equal(error.code, 'COMPANY_NOT_FOUND');
        assert.equal(error.fields, undefined);
        assert.doesNotMatch(error.message, /99|postgres|sql/iu);
        return true;
      }
    );
  });

  test('isolates list and detail cache entries by revision, query, cursor and company id', async () => {
    const requestedKeys = [];
    const revisions = ['catalog:1', 'catalog:1', 'catalog:2', 'catalog:2'];
    const cache = {
      get: async (key) => {
        requestedKeys.push(key);
        return null;
      },
      set: async () => {}
    };
    const repository = {
      getRevision: async () => revisions.shift(),
      listCompanies: async () => ({ companies: [], hasMore: false }),
      getCompanyProfile: async () => companyProfile()
    };
    const service = createCompanyQueryService({
      repository,
      cache,
      policy: passthroughPolicy(),
      cursorCodec: { decode: () => null, encode: () => 'next' }
    });

    await service.listCompanies(parseCompanyListQuery({ q: 'uno' }));
    await service.listCompanies(parseCompanyListQuery({ q: 'dos', cursor: 'opaque' }));
    await service.getCompanyProfile('7');
    await service.getCompanyProfile('8');

    assert.equal(requestedKeys.length, 4);
    assert.equal(new Set(requestedKeys).size, 4);
    assert.match(requestedKeys[0], /catalog:1/u);
    assert.match(requestedKeys[1], /catalog:1/u);
    assert.match(requestedKeys[2], /catalog:2/u);
    assert.match(requestedKeys[3], /catalog:2/u);
  });

  test('cache read and write failures never replace PostgreSQL as source of truth or leak values', async (t) => {
    const sensitive = 'https://private.example/secret?token=do-not-log';
    const logCalls = [];
    for (const method of ['error', 'warn', 'info', 'log']) {
      t.mock.method(console, method, (...args) => logCalls.push(args));
    }
    let repositoryCalls = 0;
    const repository = {
      getRevision: async () => 'catalog:55',
      getCompanyProfile: async () => null,
      listCompanies: async () => {
        repositoryCalls += 1;
        return { companies: [companyRow({ id: '5', name: sensitive, rank: 0 })], hasMore: false };
      }
    };

    for (const cache of [
      {
        get: async () => { throw new Error(`cache read failed for ${sensitive}`); },
        set: async () => {}
      },
      {
        get: async () => null,
        set: async () => { throw new Error(`cache write failed for ${sensitive}`); }
      }
    ]) {
      const service = createCompanyQueryService({
        repository,
        cache,
        policy: passthroughPolicy()
      });
      const result = await service.listCompanies(parseCompanyListQuery({}));
      assert.equal(result.data[0].name, sensitive);
    }

    assert.equal(repositoryCalls, 2);
    assert.deepEqual(logCalls, []);
  });

  test('rejects incomplete injected boundaries before any query can run', () => {
    const repository = {
      getRevision: async () => 'catalog:1',
      listCompanies: async () => ({ companies: [], hasMore: false }),
      getCompanyProfile: async () => null
    };
    const cache = memoryCache();
    const policy = passthroughPolicy();

    assert.throws(() => createCompanyQueryService({ cache, policy }), TypeError);
    assert.throws(() => createCompanyQueryService({ repository, policy }), TypeError);
    assert.throws(() => createCompanyQueryService({ repository, cache }), TypeError);
    assert.throws(
      () => createCompanyQueryService({
        repository: { getRevision: repository.getRevision, listCompanies: repository.listCompanies },
        cache,
        policy
      }),
      TypeError
    );
    assert.throws(
      () => createCompanyQueryService({ repository, cache, policy, cursorCodec: {} }),
      TypeError
    );
  });
});

function companyRow({ id, name, rank }) {
  return {
    companyId: id,
    name,
    logoUrl: null,
    pointCount: 3,
    municipalityCount: 2,
    matchRank: rank,
    normalizedName: name.toLocaleLowerCase('es')
  };
}

function companyProfile() {
  return {
    companyId: '42',
    name: 'Empresa de prueba',
    logoUrl: '/uploads/company.webp',
    description: 'Perfil público.',
    websiteUrl: 'https://example.com',
    socialLinks: [],
    coverage: { pointCount: 3, municipalityCount: 2, departmentCount: 1 }
  };
}

function passthroughPolicy() {
  return {
    presentListItem: (company) => ({ ...company }),
    presentProfile: (company) => ({ ...company })
  };
}

function memoryCache() {
  const values = new Map();
  return {
    get: async (key) => values.get(key) || null,
    set: async (key, value) => values.set(key, value)
  };
}
