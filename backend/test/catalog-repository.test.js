const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createCatalogRepository
} = require('../src/infrastructure/postgres/catalog.repository');

test('catalog repository returns one bounded page and batches visible schedules', async () => {
  const calls = [];
  const db = {
    query: async (text, values = []) => {
      calls.push({ text, values });
      if (text.includes('FROM agencias a')) {
        return {
          rows: [
            agencyRow(1, 'AG_01', 'AGENCIA A'),
            agencyRow(2, 'AG_02', 'AGENCIA B'),
            agencyRow(3, 'AG_03', 'AGENCIA C')
          ]
        };
      }
      if (text.includes('FROM horarios_operativos')) {
        assert.deepEqual(values, [[1, 2]]);
        return {
          rows: [
            { agencia_id: 1, dia_semana: 'Lunes', hora_apertura: '09:00:00', hora_cierre: '16:00:00' },
            { agencia_id: 2, dia_semana: 'Martes', hora_apertura: '08:00:00', hora_cierre: '12:00:00' }
          ]
        };
      }
      throw new Error('Unexpected query');
    }
  };
  const repository = createCatalogRepository({ getDB: async () => db });

  const result = await repository.listPoints({
    companyId: '2',
    department: 'San Salvador',
    municipality: 'Soyapango',
    pointType: 'Agencia',
    q: 'centro',
    matchMode: 'CONTAINS',
    limit: 2,
    cursor: null,
    position: null
  });

  assert.equal(calls.length, 2);
  assert.equal(result.hasMore, true);
  assert.equal(result.points.length, 2);
  assert.deepEqual(result.points[0], {
    pointId: 'AG_01',
    normalizedName: 'agencia a',
    company: { companyId: '2', name: 'Pedidos Express', logoUrl: null },
    name: 'AGENCIA A',
    pointType: 'AGENCIA',
    location: {
      department: 'San Salvador',
      municipality: 'Soyapango',
      address: 'Dirección',
      coordinates: { lat: 13.7, lng: -89.2 }
    },
    media: { imageUrl: null, mapsUrl: null },
    schedules: [{ day: 'Lunes', opensAt: '09:00', closesAt: '16:00' }]
  });
  assert.equal(calls[0].values.at(-1), 3);
  assert.doesNotMatch(calls[0].text, /SELECT\s+\*/i);
});

test('catalog repository reads the opaque global revision', async () => {
  const db = {
    query: async (text, values) => {
      assert.match(text, /catalog_revision_state/);
      assert.equal(values, undefined);
      return { rows: [{ revision: '18' }] };
    }
  };
  const repository = createCatalogRepository({ getDB: async () => db });

  assert.equal(await repository.getRevision(), 'catalog:18');
});

test('catalog repository gets one point by public identity with its full schedule', async () => {
  const calls = [];
  const db = {
    query: async (text, values) => {
      calls.push({ text, values });
      if (text.includes('FROM agencias a')) {
        assert.deepEqual(values, ['AG_01']);
        assert.match(text, /a\.id_destino = \$1/);
        assert.match(text, /LIMIT 1/);
        return { rows: [agencyRow(1, 'AG_01', 'AGENCIA A')] };
      }
      if (text.includes('FROM horarios_operativos')) {
        assert.deepEqual(values, [[1]]);
        return {
          rows: [
            { agencia_id: 1, dia_semana: 'Lunes', hora_apertura: '09:00:00', hora_cierre: '16:00:00' }
          ]
        };
      }
      throw new Error('Unexpected query');
    }
  };
  const repository = createCatalogRepository({ getDB: async () => db });

  const result = await repository.getPointDetails('AG_01');

  assert.equal(calls.length, 2);
  assert.equal(result.pointId, 'AG_01');
  assert.deepEqual(result.schedules, [
    { day: 'Lunes', opensAt: '09:00', closesAt: '16:00' }
  ]);
});

test('catalog repository returns one bounded facet page using a whitelisted dimension', async () => {
  const calls = [];
  const db = {
    query: async (text, values) => {
      calls.push({ text, values });
      assert.match(text, /a\.municipio AS value/);
      assert.match(text, /GROUP BY a\.municipio/);
      assert.doesNotMatch(text, /SELECT\s+\*/i);
      assert.equal(values.at(-1), 3);
      assert.ok(values.includes('%soy%'));
      return {
        rows: [
          { value: 'Soyapango', label: 'Soyapango', normalized_label: 'soyapango', facet_count: '3' },
          { value: 'Soyapango Norte', label: 'Soyapango Norte', normalized_label: 'soyapango norte', facet_count: '2' },
          { value: 'Soyapango Sur', label: 'Soyapango Sur', normalized_label: 'soyapango sur', facet_count: '1' }
        ]
      };
    }
  };
  const repository = createCatalogRepository({ getDB: async () => db });

  const result = await repository.listFacets({
    facet: 'municipality',
    companyId: null,
    department: 'San Salvador',
    municipality: null,
    pointType: null,
    q: 'soy',
    matchMode: 'CONTAINS',
    limit: 2,
    cursor: null,
    position: null
  });

  assert.equal(calls.length, 1);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.items, [
    { value: 'Soyapango', label: 'Soyapango', normalizedLabel: 'soyapango', count: 3 },
    { value: 'Soyapango Norte', label: 'Soyapango Norte', normalizedLabel: 'soyapango norte', count: 2 }
  ]);
});

function agencyRow(id, pointId, name) {
  return {
    agency_id: id,
    point_id: pointId,
    normalized_name: name.toLocaleLowerCase('es-SV'),
    company_id: 2,
    company_name: 'Pedidos Express',
    company_logo_url: null,
    point_name: name,
    point_type: 'Agencia',
    department: 'San Salvador',
    municipality: 'Soyapango',
    address: 'Dirección',
    latitude: '13.700000',
    longitude: '-89.200000',
    image_url: null,
    maps_url: null
  };
}
