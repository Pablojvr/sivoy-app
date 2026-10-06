const test = require('node:test');
const assert = require('node:assert/strict');

const { createRutasService } = require('../src/domains/rutas/rutas.service');

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

// Factory double for locations
const createLocationsPort = (overrides = {}) => ({
  getLocationByName: async name => ({ Origen: origin, Destino: destination }[name] || null),
  getAllLocations: async () => [origin, destination],
  ...overrides
});

// Factory double for eta
const createEtaPort = (overrides = {}) => ({
  calcularIngresoOficial: () => ({ date: new Date('2026-09-07T00:00:00Z'), msg: 'Test entry' }),
  proyectarProximasRutas: () => [{ fecha_llegada_iso: '2026-09-08', fecha_llegada: '08-Sep', horario_recoleccion: '10:00' }],
  ...overrides
});

// Default clock
const createClockPort = (nowStr = '2026-09-07T10:00:00Z') => ({
  now: () => new Date(nowStr)
});


test('rejects invalid route payloads before touching repository or ETA (fail-fast)', async () => {
  let dependencyCalls = 0;
  const unexpectedCall = () => { dependencyCalls++; throw new Error('Dependency called for invalid input'); };

  const locations = createLocationsPort({ getLocationByName: unexpectedCall, getAllLocations: unexpectedCall });
  const eta = createEtaPort({ calcularIngresoOficial: unexpectedCall, proyectarProximasRutas: unexpectedCall });
  const clock = createClockPort();

  const routesService = createRutasService({ locations, eta, clock });

  for (const [method, payload] of [
    ['getUpcomingRoutes', { origen: 'A'.repeat(161), destino: 'Destino' }],
    ['searchRoutesByMunicipality', { origen: 'Origen', destinos: [] }],
    ['searchFlights', { origen_municipio: 'San Salvador', destino_municipio: 'Santa Ana', dropoff_date: '2026-02-29', dropoff_time: '10:00' }]
  ]) {
    await assert.rejects(routesService[method](payload), error =>
      error.code === 'VALIDATION_ERROR' && !error.message.includes('Dependency called')
    );
  }
  assert.equal(dependencyCalls, 0);
});


test('municipality: scalar and array, valid inputs', async () => {
  const routesService = createRutasService({
    locations: createLocationsPort(),
    eta: createEtaPort(),
    clock: createClockPort()
  });

  // scalar
  const responseScalar = await routesService.searchRoutesByMunicipality({
    origen: 'Origen',
    destinos: ['Destino'],
    dropoff_date: '2026-09-07',
    dropoff_time: '10:00'
  });
  assert.equal(responseScalar.success, true);
  assert.equal(responseScalar.origen_nombre, 'Origen');
  assert.ok(Array.isArray(responseScalar.results));
  assert.equal(responseScalar.results[0].destino_nombre, 'Destino');
  assert.equal(responseScalar.results[0].opciones[0].fecha_llegada_iso, '2026-09-08');

  // array
  const responseArray = await routesService.searchRoutesByMunicipality({
    origen: ['Origen'],
    destinos: ['Destino'],
    dropoff_date: '2026-09-07',
    dropoff_time: '10:00'
  });
  assert.equal(responseArray.success, true);
  assert.ok(Array.isArray(responseArray.results));
  assert.equal(responseArray.results[0].origen_nombre, 'Origen');
  assert.equal(responseArray.results[0].destino_nombre, 'Destino');
  assert.equal(responseArray.results[0].opciones[0].fecha_llegada_iso, '2026-09-08');
});


test('upcoming: scalar and array, valid inputs', async () => {
  const routesService = createRutasService({
    locations: createLocationsPort(),
    eta: createEtaPort(),
    clock: createClockPort()
  });

  // scalar
  const responseScalar = await routesService.getUpcomingRoutes({
    origen: 'Origen',
    destino: 'Destino',
    dropoff_date: '2026-09-07',
    dropoff_time: '10:00'
  });
  assert.equal(responseScalar.success, true);
  assert.equal(responseScalar.origen_nombre, 'Origen');
  assert.equal(responseScalar.destino_nombre, 'Destino');
  assert.ok(Array.isArray(responseScalar.opciones));
  assert.equal(responseScalar.opciones[0].fecha_llegada_iso, '2026-09-08');

  // array
  const responseArray = await routesService.getUpcomingRoutes({
    origen: ['Origen'],
    destino: ['Destino'],
    dropoff_date: '2026-09-07',
    dropoff_time: '10:00'
  });
  assert.equal(responseArray.success, true);
  assert.ok(Array.isArray(responseArray.results));
  assert.equal(responseArray.results[0].origen_nombre, 'Origen');
  assert.equal(responseArray.results[0].destino_nombre, 'Destino');
  assert.equal(responseArray.results[0].opciones[0].fecha_llegada_iso, '2026-09-08');
});


test('flights: returns an empty municipal search result when companies do not match', async () => {
  const otherDestination = { ...destination, empresa: 'Otra empresa' };

  const routesService = createRutasService({
    locations: createLocationsPort({ getAllLocations: async () => [origin, otherDestination] }),
    eta: createEtaPort(),
    clock: createClockPort()
  });

  const response = await routesService.searchFlights({
    origen_municipio: 'San Salvador',
    destino_municipio: 'Santa Ana',
    dropoff_date: '2026-09-07',
    dropoff_time: '10:00'
  });

  assert.equal(response.success, true);
  assert.deepEqual(response.results, []);
});


test('uses injected clock for default date and time when omitted in payload', async () => {
  let firstCandidate = null;

  const routesService = createRutasService({
    locations: createLocationsPort(),
    eta: createEtaPort({
      calcularIngresoOficial: (loc, d, t) => {
        firstCandidate ??= { date: d, time: t };
        return { date: new Date(`${d}T00:00:00Z`), msg: 'Test msg' };
      }
    }),
    clock: createClockPort('2026-10-15T14:45:00Z')
  });

  await routesService.getUpcomingRoutes({
    origen: 'Origen',
    destino: 'Destino'
  });

  const now = new Date('2026-10-15T14:45:00Z');
  assert.deepEqual(firstCandidate, {
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().split(' ')[0].substring(0, 5)
  });
});


test('dependency error preserves identity to allow outer translation', async () => {
  class CustomError extends Error {}
  const specificError = new CustomError('DB connection lost');

  const routesService = createRutasService({
    locations: createLocationsPort({
      getLocationByName: async () => { throw specificError; }
    }),
    eta: createEtaPort(),
    clock: createClockPort()
  });

  await assert.rejects(
    routesService.getUpcomingRoutes({ origen: 'Origen', destino: 'Destino', dropoff_date: '2026-09-07', dropoff_time: '10:00' }),
    err => err === specificError
  );
});
