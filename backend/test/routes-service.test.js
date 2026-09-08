const test = require('node:test');
const assert = require('node:assert/strict');

const repositoryPath = require.resolve('../src/domains/ubicaciones/ubicaciones.repository');

function location(name, schedules, rules = []) {
  return {
    id: name,
    nombre_destino: name,
    empresa: 'Empresa de prueba',
    tipo: 'agencia',
    ubicacion: { municipio: 'San Salvador', departamento: 'San Salvador', lat: 13.7, lng: -89.2 },
    horarios_operativos: schedules,
    reglas_entrega: rules
  };
}

const origin = location('Origen', [
  { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '16:00' }
]);
const destination = location('Destino', [
  { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '16:00' }
], [
  { dia_entrega: 'Martes', dia_corte_maximo: 'Día anterior' }
]);
destination.ubicacion = { ...destination.ubicacion, municipio: 'Santa Ana', departamento: 'Santa Ana' };

require.cache[repositoryPath] = {
  id: repositoryPath,
  filename: repositoryPath,
  loaded: true,
  exports: {
    getLocationByName: async name => ({ Origen: origin, Destino: destination }[name] || null),
    getAllLocations: async () => [origin, destination]
  }
};

const routesService = require('../src/domains/rutas/rutas.service');

test('preserves the legacy scalar route response', async () => {
  const response = await routesService.getUpcomingRoutes({
    origen: 'Origen',
    destino: 'Destino',
    dropoff_date: '2026-09-07',
    dropoff_time: '10:00'
  });

  assert.equal(response.success, true);
  assert.equal(response.origen_nombre, 'Origen');
  assert.equal(response.destino_nombre, 'Destino');
  assert.equal(response.opciones[0].fecha_llegada_iso, '2026-09-08');
});

test('preserves the legacy collection response for array input', async () => {
  const response = await routesService.getUpcomingRoutes({
    origen: ['Origen'],
    destino: ['Destino'],
    dropoff_date: '2026-09-07',
    dropoff_time: '10:00'
  });

  assert.equal(response.success, true);
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].destino_nombre, 'Destino');
});

test('returns an empty municipal search result when companies do not match', async () => {
  const otherDestination = { ...destination, empresa: 'Otra empresa' };
  require.cache[repositoryPath].exports.getAllLocations = async () => [origin, otherDestination];

  const response = await routesService.searchFlights({
    origen_municipio: 'San Salvador',
    destino_municipio: 'Santa Ana',
    dropoff_date: '2026-09-07',
    dropoff_time: '10:00'
  });

  assert.deepEqual(response, { success: true, results: [] });
});
