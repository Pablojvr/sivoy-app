const assert = require('node:assert/strict');
const test = require('node:test');

const { buildPublicCatalogSnapshot } = require('../tools/public-catalog-snapshot');
const {
  assertLocalDatabaseUrl,
  importPublicCatalog
} = require('../tools/import-public-catalog');

function snapshot() {
  return buildPublicCatalogSnapshot(
    {
      success: true,
      empresas: [{ id: 1, nombre: 'Pedidos Express', logo_url: null, puntos_count: '1' }]
    },
    [{
      id: 7,
      id_destino: 'AG_TEST_01',
      nombre_destino: 'AGENCIA TEST',
      tipo: 'Agencia',
      empresa: 'Pedidos Express',
      maps_url: null,
      ubicacion: {
        departamento: 'San Salvador',
        municipio: 'San Salvador',
        direccion_referencia: null,
        lat: 13.7,
        lng: -89.2
      },
      imagen_referencia: null,
      horarios_operativos: [
        { dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }
      ],
      reglas_entrega: [
        { dia_entrega: 'Martes', dia_corte_maximo: 'Día anterior' }
      ]
    }],
    { sourceBaseUrl: 'https://example.test' }
  );
}

function fakePool(options = {}) {
  const calls = [];
  let agencyId = 10;
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (options.failOn && text.includes(options.failOn)) throw new Error('simulated database failure');
      if (text.includes('INSERT INTO empresas')) return { rows: [{ id: 1 }] };
      if (text.includes('INSERT INTO agencias')) return { rows: [{ id: agencyId++ }] };
      return { rows: [] };
    },
    release() {
      calls.push({ text: 'RELEASE' });
    }
  };
  return {
    calls,
    async connect() {
      return client;
    }
  };
}

test('accepts only loopback PostgreSQL URLs for the local importer', () => {
  assert.equal(
    assertLocalDatabaseUrl('postgresql://sivoy:local@127.0.0.1:5433/sivoy'),
    'postgresql://sivoy:local@127.0.0.1:5433/sivoy'
  );
  assert.equal(
    assertLocalDatabaseUrl('postgresql://sivoy:local@localhost:5433/sivoy'),
    'postgresql://sivoy:local@localhost:5433/sivoy'
  );
  assert.throws(
    () => assertLocalDatabaseUrl('postgresql://user:secret@database.example.com/sivoy'),
    /loopback/i
  );
  assert.throws(() => assertLocalDatabaseUrl('not-a-url'), /PostgreSQL URL/i);
});

test('imports companies, locations, schedules and rules in one transaction', async () => {
  const pool = fakePool();

  const result = await importPublicCatalog({ pool, snapshot: snapshot() });

  assert.deepEqual(result, {
    companies: 1,
    locations: 1,
    schedules: 1,
    deliveryRules: 1
  });
  assert.equal(pool.calls[0].text, 'BEGIN');
  assert.equal(pool.calls.at(-2).text, 'COMMIT');
  assert.equal(pool.calls.at(-1).text, 'RELEASE');
  assert.equal(pool.calls.some((call) => call.text.includes('ON CONFLICT (id_destino) DO UPDATE')), true);
  assert.equal(pool.calls.some((call) => call.text.includes('INSERT INTO horarios_operativos')), true);
  assert.equal(pool.calls.some((call) => call.text.includes('INSERT INTO reglas_entrega')), true);
  assert.equal(pool.calls.some((call) => call.text.includes('AGENCIA TEST')), false);
});

test('rolls back and releases the client when an import query fails', async () => {
  const pool = fakePool({ failOn: 'INSERT INTO horarios_operativos' });

  await assert.rejects(
    () => importPublicCatalog({ pool, snapshot: snapshot() }),
    /simulated database failure/
  );

  assert.equal(pool.calls.some((call) => call.text === 'ROLLBACK'), true);
  assert.equal(pool.calls.at(-1).text, 'RELEASE');
  assert.equal(pool.calls.some((call) => call.text === 'COMMIT'), false);
});
