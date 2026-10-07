const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  CatalogError,
  parseFacetQuery,
  parseListQuery
} = require('../src/domains/catalog/catalog.validation');
const {
  decodeCursor,
  encodeCursor
} = require('../src/application/catalog/catalog-cursor');
const {
  decodeFacetCursor,
  encodeFacetCursor
} = require('../src/application/catalog/catalog-facet-cursor');
const {
  createCatalogQueryService
} = require('../src/application/catalog/catalog-query.service');

describe('catalog query contract', () => {
  test('normalizes bounded filters and applies safe pagination defaults', () => {
    assert.deepEqual(parseListQuery({
      companyId: ' 2 ',
      municipality: '  San Salvador  ',
      q: '  unicéntro ',
      limit: '50'
    }), {
      companyId: '2',
      department: null,
      municipality: 'San Salvador',
      pointType: null,
      q: 'unicéntro',
      matchMode: 'CONTAINS',
      limit: 50,
      cursor: null
    });

    assert.equal(parseListQuery({}).limit, 20);
  });

  test('rejects invalid filters with public field names only', () => {
    assert.throws(
      () => parseListQuery({ q: 'a', limit: '51', matchMode: 'FUZZY' }),
      (error) => {
        assert.ok(error instanceof CatalogError);
        assert.equal(error.status, 400);
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.deepEqual(error.fields, ['limit', 'matchMode', 'q']);
        return true;
      }
    );
  });

  test('validates one bounded facet dimension and binds its cursor to the query', () => {
    const query = parseFacetQuery({
      facet: 'municipality',
      department: 'San Salvador',
      q: 'soy',
      limit: '10'
    });
    assert.equal(query.facet, 'municipality');
    assert.equal(query.limit, 10);

    const cursor = encodeFacetCursor({
      revision: 'catalog:7',
      query,
      position: { normalizedLabel: 'soyapango', value: 'Soyapango' }
    });
    assert.deepEqual(decodeFacetCursor(cursor, { revision: 'catalog:7', query }), {
      normalizedLabel: 'soyapango',
      value: 'Soyapango'
    });
    assert.throws(
      () => parseFacetQuery({ facet: 'unknown' }),
      (error) => error instanceof CatalogError && error.fields.includes('facet')
    );
  });

  test('cursor is bound to the catalog revision, filters and last position', () => {
    const query = parseListQuery({ municipality: 'Soyapango', limit: '2' });
    const cursor = encodeCursor({
      revision: 'catalog:9',
      query,
      position: { normalizedName: 'agencia unicentro', pointId: 'AG_02' }
    });

    assert.deepEqual(decodeCursor(cursor, { revision: 'catalog:9', query }), {
      normalizedName: 'agencia unicentro',
      pointId: 'AG_02'
    });

    assert.throws(
      () => decodeCursor(cursor, {
        revision: 'catalog:10',
        query
      }),
      (error) => error instanceof CatalogError &&
        error.status === 409 &&
        error.code === 'CURSOR_STALE'
    );

    assert.throws(
      () => decodeCursor(cursor, {
        revision: 'catalog:9',
        query: parseListQuery({ municipality: 'Apopa', limit: '2' })
      }),
      (error) => error instanceof CatalogError &&
        error.status === 409 &&
        error.code === 'CURSOR_STALE'
    );
  });

  test('builds a compact page with grouped schedule preview and live availability', async () => {
    const repository = {
      getRevision: async () => 'catalog:7',
      listPoints: async (query) => {
        assert.equal(query.limit, 2);
        assert.equal(query.position, null);
        return {
          points: [pointWithWeekSchedule()],
          hasMore: false
        };
      }
    };
    const service = createCatalogQueryService({
      repository,
      cache: { get: async () => null, set: async () => {} },
      now: () => new Date('2026-10-05T21:00:00.000Z')
    });

    const result = await service.listPoints(parseListQuery({ limit: '2' }));

    assert.equal(result.data.length, 1);
    assert.deepEqual(result.data[0].availability, {
      status: 'OPEN',
      closesAt: '16:00',
      nextOpeningAt: null,
      evaluatedAt: '2026-10-05T15:00:00-06:00',
      timeZone: 'America/El_Salvador'
    });
    assert.deepEqual(result.data[0].schedulePreview, [
      { daysLabel: 'Lunes a viernes', opensAt: '09:00', closesAt: '16:00' },
      { daysLabel: 'Sábado', opensAt: '09:00', closesAt: '13:00' }
    ]);
    assert.deepEqual(result.page, { limit: 2, hasMore: false, nextCursor: null });
    assert.deepEqual(result.meta, { catalogRevision: 'catalog:7' });
    assert.equal('schedules' in result.data[0], false);
  });

  test('reports the next opening when the point is currently closed', async () => {
    const repository = {
      getRevision: async () => 'catalog:7',
      listPoints: async () => ({ points: [pointWithWeekSchedule()], hasMore: false })
    };
    const service = createCatalogQueryService({
      repository,
      cache: { get: async () => null, set: async () => {} },
      now: () => new Date('2026-10-05T23:00:00.000Z')
    });

    const result = await service.listPoints(parseListQuery({}));

    assert.deepEqual(result.data[0].availability, {
      status: 'CLOSED',
      closesAt: null,
      nextOpeningAt: '2026-10-06T09:00:00-06:00',
      evaluatedAt: '2026-10-05T17:00:00-06:00',
      timeZone: 'America/El_Salvador'
    });
  });

  test('returns full schedules only from the point detail use case', async () => {
    const point = pointWithWeekSchedule();
    const repository = {
      getRevision: async () => 'catalog:7',
      listPoints: async () => ({ points: [], hasMore: false }),
      getPointDetails: async (pointId) => {
        assert.equal(pointId, 'AG_01');
        return point;
      }
    };
    const service = createCatalogQueryService({
      repository,
      cache: { get: async () => null, set: async () => {} },
      now: () => new Date('2026-10-05T16:00:00.000Z')
    });

    const result = await service.getPointDetails('AG_01');

    assert.equal(result.pointId, 'AG_01');
    assert.equal(result.schedules.length, 6);
    assert.equal('normalizedName' in result, false);
    assert.equal(result.schedulePreview.length, 2);
  });

  test('returns a safe not-found error for an unknown point', async () => {
    const service = createCatalogQueryService({
      repository: {
        getRevision: async () => 'catalog:7',
        listPoints: async () => ({ points: [], hasMore: false }),
        getPointDetails: async () => null
      },
      cache: { get: async () => null, set: async () => {} }
    });

    await assert.rejects(
      service.getPointDetails('MISSING'),
      (error) => error.status === 404 && error.code === 'POINT_NOT_FOUND'
    );
  });

  test('returns a compact facet page without leaking pagination fields', async () => {
    const repository = {
      getRevision: async () => 'catalog:7',
      listPoints: async () => ({ points: [], hasMore: false }),
      listFacets: async (query) => {
        assert.equal(query.facet, 'municipality');
        assert.equal(query.position, null);
        return {
          items: [{ value: 'Soyapango', label: 'Soyapango', count: 3, normalizedLabel: 'soyapango' }],
          hasMore: false
        };
      }
    };
    const service = createCatalogQueryService({
      repository,
      cache: { get: async () => null, set: async () => {} }
    });

    const result = await service.listFacets(parseFacetQuery({ facet: 'municipality' }));

    assert.deepEqual(result, {
      data: [{ value: 'Soyapango', label: 'Soyapango', count: 3 }],
      page: { limit: 20, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:7' }
    });
  });
});

function pointWithWeekSchedule() {
  const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  return {
    pointId: 'AG_01',
    normalizedName: 'agencia centro',
    company: { companyId: '2', name: 'Pedidos Express', logoUrl: null },
    name: 'AGENCIA CENTRO',
    pointType: 'AGENCIA',
    location: {
      department: 'San Salvador',
      municipality: 'San Salvador',
      address: 'Centro',
      coordinates: { lat: 13.7, lng: -89.2 }
    },
    media: { imageUrl: null, mapsUrl: null },
    schedules: [
      ...weekdays.map((day) => ({ day, opensAt: '09:00', closesAt: '16:00' })),
      { day: 'Sábado', opensAt: '09:00', closesAt: '13:00' }
    ]
  };
}
