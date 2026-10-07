'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createRouteLocationsRepository
} = require('../src/infrastructure/postgres/route-locations.repository');

test('loads route points, schedules and rules in three constant queries by identifiers', async () => {
  const calls = [];
  const db = fakeDatabase(calls);
  const repository = createRouteLocationsRepository({ getDB: async () => db });

  const points = await repository.getLocationsByIdentifiers(['AG_ORIGIN', 'AG_DESTINATION']);

  assert.equal(calls.length, 3);
  assert.match(calls[0].text, /id_destino = ANY\(\$1::text\[\]\)/);
  assert.deepEqual(calls[0].values, [['AG_ORIGIN', 'AG_DESTINATION']]);
  assert.deepEqual(calls[1].values, [[1, 2]]);
  assert.deepEqual(calls[2].values, [[1, 2]]);
  assert.deepEqual(points[0], {
    id: 1,
    id_destino: 'AG_ORIGIN',
    nombre_destino: 'Origen',
    tipo: 'AGENCIA',
    empresa_id: 7,
    empresa: 'Pedidos Express',
    maps_url: null,
    ubicacion: {
      departamento: 'San Salvador',
      municipio: 'Soyapango',
      direccion_referencia: 'Centro',
      lat: 13.7,
      lng: -89.1
    },
    imagen_referencia: null,
    horarios_operativos: [{ dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }],
    reglas_entrega: [{ dia_entrega: 'Martes', dia_corte_maximo: 'Día anterior' }]
  });
});

test('keeps a bounded transitional fallback for legacy names', async () => {
  const calls = [];
  const db = {
    query: async (text, values) => {
      calls.push({ text, values });
      if (/id_destino = ANY/.test(text)) return { rows: [] };
      if (/lower\(a\.nombre_destino\)/.test(text)) {
        return { rows: [agency(1, 'AG_ORIGIN', 'Origen', 'Soyapango', 'San Salvador')] };
      }
      if (/FROM horarios_operativos/.test(text)) return { rows: [] };
      if (/FROM reglas_entrega/.test(text)) return { rows: [] };
      throw new Error('Unexpected query');
    }
  };
  const repository = createRouteLocationsRepository({ getDB: async () => db });

  const points = await repository.getLocationsByIdentifiers(['Origen']);

  assert.equal(points[0].id_destino, 'AG_ORIGIN');
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[1].values, [['Origen'], ['origen']]);
});

test('loads both municipality sides without reading the global catalog', async () => {
  const calls = [];
  const db = fakeDatabase(calls);
  const repository = createRouteLocationsRepository({ getDB: async () => db });

  const points = await repository.getLocationsByMunicipalities({
    origin: { municipality: 'Soyapango', department: 'San Salvador' },
    destination: { municipality: 'Santa Ana', department: 'Santa Ana' }
  });

  assert.equal(points.length, 2);
  assert.equal(calls.length, 3);
  assert.match(calls[0].text, /lower\(a\.municipio\) = lower\(\$1\)/);
  assert.deepEqual(calls[0].values, ['Soyapango', 'San Salvador', 'Santa Ana', 'Santa Ana']);
});

function fakeDatabase(calls) {
  return {
    query: async (text, values) => {
      calls.push({ text, values });
      if (/FROM agencias a/.test(text)) {
        return { rows: [
          agency(1, 'AG_ORIGIN', 'Origen', 'Soyapango', 'San Salvador'),
          agency(2, 'AG_DESTINATION', 'Destino', 'Santa Ana', 'Santa Ana')
        ] };
      }
      if (/FROM horarios_operativos/.test(text)) {
        return { rows: [
          { agencia_id: 1, dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }
        ] };
      }
      if (/FROM reglas_entrega/.test(text)) {
        return { rows: [
          { agencia_id: 1, dia_entrega: 'Martes', dia_corte_maximo: 'Día anterior' }
        ] };
      }
      throw new Error('Unexpected query');
    }
  };
}

function agency(id, publicId, name, municipality, department) {
  return {
    id,
    id_destino: publicId,
    nombre_destino: name,
    tipo: 'AGENCIA',
    empresa_id: 7,
    empresa: 'Pedidos Express',
    maps_url: null,
    departamento: department,
    municipio: municipality,
    direccion_referencia: 'Centro',
    lat: 13.7,
    lng: -89.1,
    imagen_referencia: null
  };
}
