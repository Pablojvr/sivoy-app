const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  buildPublicCatalogSnapshot,
  validatePublicCatalogSnapshot
} = require('../tools/public-catalog-snapshot');

function location(overrides = {}) {
  return {
    id: 7,
    id_destino: 'AG_TEST_01',
    nombre_destino: 'AGENCIA TEST',
    tipo: 'Agencia',
    empresa: 'Pedidos Express',
    maps_url: null,
    ubicacion: {
      departamento: 'San Salvador',
      municipio: 'San Salvador',
      direccion_referencia: 'Dirección pública de prueba',
      lat: 13.7,
      lng: -89.2
    },
    imagen_referencia: null,
    horarios_operativos: [
      { dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }
    ],
    reglas_entrega: [
      { dia_entrega: 'Martes', dia_corte_maximo: 'Día anterior' }
    ],
    ...overrides
  };
}

test('normalizes and sorts the public catalog deterministically', () => {
  const companiesResponse = {
    success: true,
    empresas: [
      { id: 2, nombre: 'Zeta', logo_url: null, puntos_count: '1' },
      { id: 1, nombre: 'Pedidos Express', logo_url: '/logo.png', puntos_count: '1' }
    ]
  };
  const locationsResponse = [
    location({ id: 8, id_destino: 'ZZ_LAST_01', empresa: 'Zeta' }),
    location()
  ];

  const snapshot = buildPublicCatalogSnapshot(companiesResponse, locationsResponse, {
    sourceBaseUrl: 'https://example.test/'
  });

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.sourceBaseUrl, 'https://example.test');
  assert.deepEqual(snapshot.companies.map((company) => company.name), ['Pedidos Express', 'Zeta']);
  assert.deepEqual(snapshot.locations.map((point) => point.stableId), ['AG_TEST_01', 'ZZ_LAST_01']);
  assert.equal(snapshot.companies[0].pointCount, 1);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.locations[0].schedules[0]), true);
});

test('produces manifest counts and a stable checksum', () => {
  const input = {
    success: true,
    empresas: [{ id: 1, nombre: 'Pedidos Express', logo_url: null, puntos_count: '1' }]
  };
  const options = { sourceBaseUrl: 'https://example.test' };

  const first = buildPublicCatalogSnapshot(input, [location()], options);
  const second = buildPublicCatalogSnapshot(input, [location()], options);

  assert.deepEqual(first.manifest.counts, {
    companies: 1,
    locations: 1,
    schedules: 1,
    deliveryRules: 1,
    missingMapsUrl: 1,
    missingImage: 1
  });
  assert.match(first.manifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.manifest.sha256, second.manifest.sha256);
});

test('rejects duplicate stable ids and invalid nested data', () => {
  assert.throws(
    () => buildPublicCatalogSnapshot(
      { success: true, empresas: [{ id: 1, nombre: 'Pedidos Express' }] },
      [location(), location({ id: 8 })],
      { sourceBaseUrl: 'https://example.test' }
    ),
    /duplicate stable id/i
  );

  assert.throws(
    () => buildPublicCatalogSnapshot(
      { success: true, empresas: [{ id: 1, nombre: 'Pedidos Express' }] },
      [location({ ubicacion: { departamento: 'X', municipio: 'Y', lat: 91, lng: -89 } })],
      { sourceBaseUrl: 'https://example.test' }
    ),
    /latitude/i
  );
});

test('validates a disconnected snapshot and rejects checksum tampering', () => {
  const snapshot = buildPublicCatalogSnapshot(
    { success: true, empresas: [{ id: 1, nombre: 'Pedidos Express', puntos_count: '1' }] },
    [location()],
    { sourceBaseUrl: 'https://example.test' }
  );
  const serialized = JSON.parse(JSON.stringify(snapshot));

  assert.deepEqual(validatePublicCatalogSnapshot(serialized), snapshot.manifest);

  serialized.locations[0].name = 'Alterado';
  assert.throws(() => validatePublicCatalogSnapshot(serialized), /checksum/i);
});

test('rejects semantically invalid snapshots even with a recomputed checksum', () => {
  const snapshot = buildPublicCatalogSnapshot(
    { success: true, empresas: [{ id: 1, nombre: 'Pedidos Express', puntos_count: '1' }] },
    [location()],
    { sourceBaseUrl: 'https://example.test' }
  );
  const serialized = JSON.parse(JSON.stringify(snapshot));
  serialized.locations[0].place.latitude = 91;
  const payload = {
    schemaVersion: serialized.schemaVersion,
    sourceBaseUrl: serialized.sourceBaseUrl,
    companies: serialized.companies,
    locations: serialized.locations
  };
  serialized.manifest.sha256 = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  assert.throws(() => validatePublicCatalogSnapshot(serialized), /latitude/i);
});
