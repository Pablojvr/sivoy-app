const test = require('node:test');
const assert = require('node:assert/strict');

const { createRouteUseCases } = require('../src/application/rutas/route-use-cases');

test('throws invalid dependency error at construction', () => {
  assert.throws(() => createRouteUseCases({}), /dependencies/i);
  assert.throws(() => createRouteUseCases({ locations: {} }), /dependencies/i);
});

test('upcoming: scalar and array, company mismatch, 7 dates starting 08:00 from second day', async () => {
  const calls = [];
  const points = {
    OrigA: { id_destino: 'OrigA', nombre_destino: 'OrigA', empresa_id: 1, empresa: 'C1' },
    OrigB: { id_destino: 'OrigB', nombre_destino: 'OrigB', empresa_id: 1, empresa: 'C1' },
    Dest1: { id_destino: 'Dest1', nombre_destino: 'Dest1', empresa_id: 1, empresa: 'C1' },
    DestMismatch: { id_destino: 'DestMismatch', nombre_destino: 'DestMismatch', empresa_id: 2, empresa: 'C2' }
  };
  const locations = {
    getLocationsByIdentifiers: async ids => ids.map(id => points[id]).filter(Boolean),
    getLocationsByMunicipalities: async () => []
  };
  const eta = {
    calcularIngresoOficial: (obj, date, time) => {
      calls.push(time);
      return { date: new Date(`${date}T00:00:00Z`), msg: 'Ingreso ' + obj.nombre_destino };
    },
    proyectarProximasRutas: (obj, date, max) => {
      return [{ fecha_llegada_iso: '2026-09-20', fecha_llegada: '20-Sep', horario_recoleccion: '10:00' }];
    }
  };
  const clock = { now: () => new Date('2026-09-16T10:00:00Z') };

  const { getUpcomingRoutes } = createRouteUseCases({ locations, eta, clock });

  // 1) Scalar matching
  const scalarPayload = Object.freeze({ origen: 'OrigA', destino: 'Dest1' });
  const scalarResult = await getUpcomingRoutes(scalarPayload);
  
  assert.equal(scalarResult.success, true);
  assert.equal(scalarResult.origen_nombre, 'OrigA');
  assert.equal(scalarResult.destino_nombre, 'Dest1');
  assert.equal(scalarResult.empresa, 'C1');
  assert.equal(scalarResult.opciones.length, 1);
  assert.equal(scalarResult.opciones_entrega.length, 7);
  assert.equal(scalarResult.opciones_entrega[1].fecha_llegada, '20-Sep');
  // dropoff_time is not part of the legacy DTO in opciones_entrega
  assert.equal(scalarResult.opciones_entrega[1].dropoff_time, undefined);
  
  // Verify 08:00 from the second day via the calls to calcularIngresoOficial
  assert.equal(calls.length, 7);
  assert.equal(calls[1], '08:00');
  assert.equal(calls[6], '08:00');

  // 2) Array matching
  const arrayPayload = Object.freeze({ origen: ['OrigA', 'OrigB'], destino: ['Dest1'] });
  const arrayResult = await getUpcomingRoutes(arrayPayload);
  assert.equal(arrayResult.success, true);
  assert.equal(arrayResult.results.length, 2);

  // 3) Company mismatch
  const mismatchPayload = Object.freeze({ origen: 'OrigA', destino: 'DestMismatch' });
  const mismatchResult = await getUpcomingRoutes(mismatchPayload);
  assert.equal(mismatchResult.success, false);
});

test('municipality: scalar and array, missing origin in repo, inclusive arrival_date filter', async () => {
  const points = {
    OrigM: { id_destino: 'OrigM', nombre_destino: 'OrigM', empresa_id: 1, empresa: 'C1' },
    DestM: { id_destino: 'DestM', nombre_destino: 'DestM', empresa_id: 1, empresa: 'C1' }
  };
  const locations = {
    getLocationsByIdentifiers: async ids => ids.map(id => points[id]).filter(Boolean),
    getLocationsByMunicipalities: async () => []
  };
  const eta = {
    calcularIngresoOficial: () => ({ date: new Date('2026-09-16T00:00:00Z'), msg: 'ok' }),
    proyectarProximasRutas: () => [
      { fecha_llegada_iso: '2026-09-17', fecha_llegada: '17-Sep', horario_recoleccion: '10:00' },
      { fecha_llegada_iso: '2026-09-18', fecha_llegada: '18-Sep', horario_recoleccion: '10:00' }
    ]
  };
  const clock = { now: () => new Date('2026-09-16T10:00:00Z') };

  const { searchRoutesByMunicipality } = createRouteUseCases({ locations, eta, clock });

  // Missing origin in DB (throws "Origen no encontrado")
  const missingOriginDbPayload = Object.freeze({ origen: 'NotFound', destinos: ['DestM'] });
  await assert.rejects(async () => searchRoutesByMunicipality(missingOriginDbPayload), /Origen no encontrado/);

  // Inclusive arrival_date filter
  const filterPayload = Object.freeze({ origen: 'OrigM', destinos: ['DestM'], arrival_date: '2026-09-17' });
  const filterResult = await searchRoutesByMunicipality(filterPayload);
  assert.equal(filterResult.success, true);
  assert.equal(filterResult.results[0].opciones.length, 1);
  assert.equal(filterResult.results[0].opciones[0].fecha_llegada_iso, '2026-09-17');

  // Array origin
  const arrayPayload = Object.freeze({ origen: ['OrigM'], destinos: ['DestM'] });
  const arrayResult = await searchRoutesByMunicipality(arrayPayload);
  assert.equal(arrayResult.success, true);
  assert.equal(arrayResult.results.length, 1);
});

test('flights: ordered by company and legacy DTO', async () => {
  const locations = {
    getLocationsByIdentifiers: async () => [],
    getLocationsByMunicipalities: async () => [
      { ubicacion: { municipio: 'M1', lat: 1.1, lng: 1.2 }, empresa_id: 2, empresa: 'B_Comp', nombre_destino: 'O2', tipo: 'T2' },
      { ubicacion: { municipio: 'M2', lat: 2.1, lng: 2.2 }, empresa_id: 2, empresa: 'B_Comp', nombre_destino: 'D2', tipo: 'T2' },
      { ubicacion: { municipio: 'M1', lat: 3.1, lng: 3.2 }, empresa_id: 1, empresa: 'A_Comp', nombre_destino: 'O1', tipo: 'T1' },
      { ubicacion: { municipio: 'M2', lat: 4.1, lng: 4.2 }, empresa_id: 1, empresa: 'A_Comp', nombre_destino: 'D1', tipo: 'T1' }
    ]
  };
  const eta = {
    calcularIngresoOficial: (obj, d) => ({ date: new Date(`${d}T00:00:00Z`), msg: 'msg1' }),
    proyectarProximasRutas: () => [{ fecha_llegada: 'x', horario_recoleccion: 'y' }]
  };
  const clock = { now: () => new Date('2026-09-16T10:00:00Z') };

  const { searchFlights } = createRouteUseCases({ locations, eta, clock });

  const payload = Object.freeze({ origen_municipio: 'M1', destino_municipio: 'M2' });
  const result = await searchFlights(payload);
  
  assert.equal(result.success, true);
  assert.equal(result.results.length, 2);
  
  // Ordered by company
  assert.equal(result.results[0].empresa, 'A_Comp');
  assert.equal(result.results[1].empresa, 'B_Comp');
  
  // legacy DTO exact check
  const firstRes = result.results[0];
  assert.equal(firstRes.origen_nombre, 'O1');
  assert.equal(firstRes.origen_tipo, 'T1');
  assert.equal(firstRes.origen_lat, 3.1);
  assert.equal(firstRes.origen_lng, 3.2);
  assert.equal(firstRes.destino_nombre_destino, 'D1');
  assert.equal(firstRes.destino_tipo, 'T1');
  assert.equal(firstRes.destino_lat, 4.1);
  assert.equal(firstRes.destino_lng, 4.2);
  assert.equal(firstRes.origen_msg, 'msg1');
  assert.equal(firstRes.fecha_llegada, 'x');
  assert.equal(firstRes.horario_recoleccion, 'y');
  assert.equal(firstRes.distance, 0);
  assert.ok(Array.isArray(firstRes.opciones_entrega));
});


test('dependency error preserves identity', async () => {
  class CustomError extends Error {}
  const err = new CustomError('DB down');
  
  const locations = {
    getLocationsByIdentifiers: async () => { throw err; },
    getLocationsByMunicipalities: async () => []
  };
  const eta = {
    calcularIngresoOficial: () => {},
    proyectarProximasRutas: () => []
  };
  const clock = { now: () => new Date() };

  const { getUpcomingRoutes } = createRouteUseCases({ locations, eta, clock });
  
  await assert.rejects(async () => getUpcomingRoutes({ origen: 'A', destino: 'B' }), (e) => e === err);
});

test('payload and DTO of dependency not mutated', async () => {
  const dto = Object.freeze({ id_destino: 'A', nombre_destino: 'A', empresa_id: 1, empresa: 'C1' });
  const locations = {
    getLocationsByIdentifiers: async () => [dto],
    getLocationsByMunicipalities: async () => []
  };
  const eta = {
    calcularIngresoOficial: () => Object.freeze({ date: new Date('2026-09-16T00:00:00Z'), msg: 'ok' }),
    proyectarProximasRutas: () => Object.freeze([Object.freeze({ fecha_llegada_iso: '2026-09-17' })])
  };
  const clock = { now: () => new Date('2026-09-16T10:00:00Z') };

  const { getUpcomingRoutes } = createRouteUseCases({ locations, eta, clock });
  const payload = Object.freeze({ origen: 'A', destino: 'A' });
  
  const res = await getUpcomingRoutes(payload);
  assert.equal(res.success, true);
});

test('does not project a candidate whose official entry moved to another day', async () => {
  let projections = 0;
  const point = Object.freeze({ id_destino: 'Point', nombre_destino: 'Point', empresa_id: 1, empresa: 'C1' });
  const { getUpcomingRoutes } = createRouteUseCases({
    locations: {
      getLocationsByIdentifiers: async () => [point],
      getLocationsByMunicipalities: async () => []
    },
    eta: {
      calcularIngresoOficial: () => ({ date: new Date('2026-09-30T00:00:00Z'), msg: 'next day' }),
      proyectarProximasRutas: () => { projections++; return []; }
    },
    clock: { now: () => { throw new Error('Clock must not be read'); } }
  });

  const result = await getUpcomingRoutes({
    origen: 'Point', destino: 'Point', dropoff_date: '2026-09-16', dropoff_time: '10:00'
  });
  assert.deepEqual(result, {
    success: false,
    origen_msg: 'No hay rutas disponibles o no operan en esa zona/empresa.'
  });
  assert.equal(projections, 0);
});

test('municipality rejects company mismatch for scalar and array inputs by stable id', async () => {
  const origin = Object.freeze({ id_destino: 'Origin', nombre_destino: 'Origin', empresa_id: 1, empresa: 'A' });
  const destination = Object.freeze({ id_destino: 'Destination', nombre_destino: 'Destination', empresa_id: 2, empresa: 'B' });
  const { searchRoutesByMunicipality } = createRouteUseCases({
    locations: {
      getLocationsByIdentifiers: async identifiers => identifiers
        .map(name => ({ Origin: origin, Destination: destination })[name])
        .filter(Boolean),
      getLocationsByMunicipalities: async () => []
    },
    eta: {
      calcularIngresoOficial: () => ({ date: new Date('2026-09-16T00:00:00Z'), msg: 'today' }),
      proyectarProximasRutas: () => [{
        fecha_llegada_iso: '2026-09-17', fecha_llegada: 'Tomorrow', horario_recoleccion: 'Morning'
      }]
    },
    clock: { now: () => { throw new Error('Clock must not be read'); } }
  });
  const timing = { dropoff_date: '2026-09-16', dropoff_time: '10:00' };

  const scalar = await searchRoutesByMunicipality({ origen: 'Origin', destinos: ['Destination'], ...timing });
  assert.deepEqual(scalar.results, []);

  const array = await searchRoutesByMunicipality({ origen: ['Origin'], destinos: ['Destination'], ...timing });
  assert.deepEqual(array, { success: true, results: [] });
});

test('municipality preserves no-income scalar response', async () => {
  const origin = Object.freeze({
    id_destino: 'Origin', nombre_destino: 'Origin', empresa_id: 1, empresa: 'A'
  });
  const { searchRoutesByMunicipality } = createRouteUseCases({
    locations: {
      getLocationsByIdentifiers: async () => [origin],
      getLocationsByMunicipalities: async () => []
    },
    eta: {
      calcularIngresoOficial: () => ({ date: null, msg: 'Closed today' }),
      proyectarProximasRutas: () => { throw new Error('Projection must not run'); }
    },
    clock: { now: () => { throw new Error('Clock must not be read'); } }
  });

  const result = await searchRoutesByMunicipality({
    origen: 'Origin', destinos: ['Destination'], dropoff_date: '2026-09-16', dropoff_time: '10:00'
  });
  assert.deepEqual(result, { success: false, origen_msg: 'Closed today', results: [] });
});

test('resolves point routes in one identifier batch and compares stable company ids', async () => {
  let batchCalls = 0;
  const locations = {
    getLocationByName: async () => { throw new Error('legacy lookup must not run'); },
    getAllLocations: async () => { throw new Error('global catalog must not run'); },
    getLocationsByMunicipalities: async () => [],
    getLocationsByIdentifiers: async identifiers => {
      batchCalls += 1;
      assert.deepEqual(identifiers, ['ORIGIN_ID', 'DESTINATION_ID']);
      return [
        { id_destino: 'ORIGIN_ID', nombre_destino: 'Origen', empresa_id: 7, empresa: 'Nombre anterior' },
        { id_destino: 'DESTINATION_ID', nombre_destino: 'Destino', empresa_id: 7, empresa: 'Nombre actual' }
      ];
    }
  };
  const routes = createRouteUseCases({
    locations,
    eta: {
      calcularIngresoOficial: (_point, date) => ({ date: new Date(`${date}T00:00:00Z`), msg: 'ok' }),
      proyectarProximasRutas: () => [{ fecha_llegada_iso: '2026-09-17', fecha_llegada: '17-Sep', horario_recoleccion: '10:00' }]
    },
    clock: { now: () => new Date('2026-09-16T10:00:00Z') }
  });

  const result = await routes.getUpcomingRoutes({
    origen: 'ORIGIN_ID',
    destino: 'DESTINATION_ID',
    dropoff_date: '2026-09-16',
    dropoff_time: '10:00'
  });

  assert.equal(result.success, true);
  assert.equal(batchCalls, 1);
});

test('same visible company name never joins different stable company ids', async () => {
  const locations = {
    getLocationsByIdentifiers: async () => [
      { id_destino: 'ORIGIN_ID', nombre_destino: 'Origen', empresa_id: 7, empresa: 'Pedidos Express' },
      { id_destino: 'DESTINATION_ID', nombre_destino: 'Destino', empresa_id: 8, empresa: 'Pedidos Express' }
    ],
    getLocationsByMunicipalities: async () => []
  };
  const routes = createRouteUseCases({
    locations,
    eta: {
      calcularIngresoOficial: (_point, date) => ({ date: new Date(`${date}T00:00:00Z`), msg: 'ok' }),
      proyectarProximasRutas: () => [{ fecha_llegada: '17-Sep', horario_recoleccion: '10:00' }]
    },
    clock: { now: () => new Date('2026-09-16T10:00:00Z') }
  });

  const result = await routes.getUpcomingRoutes({
    origen: 'ORIGIN_ID',
    destino: 'DESTINATION_ID',
    dropoff_date: '2026-09-16',
    dropoff_time: '10:00'
  });

  assert.deepEqual(result, {
    success: false,
    origen_msg: 'No hay rutas disponibles o no operan en esa zona/empresa.'
  });
});

test('searches both municipalities through one bounded repository operation', async () => {
  let municipalityCalls = 0;
  const locations = {
    getLocationByName: async () => null,
    getAllLocations: async () => { throw new Error('global catalog must not run'); },
    getLocationsByIdentifiers: async () => [],
    getLocationsByMunicipalities: async filters => {
      municipalityCalls += 1;
      assert.deepEqual(filters, {
        origin: { municipality: 'M1', department: 'D1' },
        destination: { municipality: 'M2', department: 'D2' }
      });
      return [
        { ubicacion: { municipio: 'M1', departamento: 'D1' }, empresa_id: 1, empresa: 'Empresa', nombre_destino: 'O', tipo: 'A' },
        { ubicacion: { municipio: 'M2', departamento: 'D2' }, empresa_id: 1, empresa: 'Empresa', nombre_destino: 'D', tipo: 'A' }
      ];
    }
  };
  const routes = createRouteUseCases({
    locations,
    eta: {
      calcularIngresoOficial: (_point, date) => ({ date: new Date(`${date}T00:00:00Z`), msg: 'ok' }),
      proyectarProximasRutas: () => [{ fecha_llegada: '17-Sep', horario_recoleccion: '10:00' }]
    },
    clock: { now: () => new Date('2026-09-16T10:00:00Z') }
  });

  const result = await routes.searchFlights({
    origen_municipio: 'M1', origen_departamento: 'D1',
    destino_municipio: 'M2', destino_departamento: 'D2',
    dropoff_date: '2026-09-16', dropoff_time: '10:00'
  });

  assert.equal(result.success, true);
  assert.equal(result.results.length, 1);
  assert.equal(municipalityCalls, 1);
});
