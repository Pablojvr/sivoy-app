'use strict';

const {
  resolveDropoffDateTime,
  candidateDropoffs,
  filterByArrivalDate
} = require('./route-use-case-support');

function createRouteUseCases({ locations, eta, clock } = {}) {
  if (typeof locations?.getLocationByName !== 'function' ||
      typeof locations?.getAllLocations !== 'function' ||
      typeof eta?.calcularIngresoOficial !== 'function' ||
      typeof eta?.proyectarProximasRutas !== 'function' ||
      typeof clock?.now !== 'function') {
    throw new TypeError('Invalid route use case dependencies');
  }

  function dropoffFor(payload) {
    const needsClock = !payload.dropoff_date || !payload.dropoff_time;
    return resolveDropoffDateTime(payload, needsClock ? clock.now() : undefined);
  }

  function projectedDelivery(origin, destination, date, time, count) {
    const entry = eta.calcularIngresoOficial(origin, date, time);
    if (!entry.date || entry.date.toISOString().split('T')[0] !== date) {
      return { entry, options: [] };
    }
    return {
      entry,
      options: eta.proyectarProximasRutas(destination, entry.date, count)
    };
  }

  function upcomingOptions(origin, destination, dropoffDate, dropoffTime) {
    const options = [];
    let firstOption;
    let firstMessage = '';
    for (const candidate of candidateDropoffs(dropoffDate, dropoffTime)) {
      const { entry, options: projected } = projectedDelivery(
        origin, destination, candidate.dropoff_date, candidate.dropoff_time, 1
      );
      if (projected.length === 0) continue;
      options.push({
        dropoff_date: candidate.dropoff_date,
        dropoff_msg: entry.msg,
        fecha_llegada: projected[0].fecha_llegada,
        horario_recoleccion: projected[0].horario_recoleccion
      });
      if (!firstOption) {
        firstOption = projected[0];
        firstMessage = entry.msg;
      }
    }
    return { options, firstOption, firstMessage };
  }

  async function resolveIdentifiers(identifiers) {
    const unique = [...new Set(identifiers.map(value => String(value)))];
    if (typeof locations.getLocationsByIdentifiers === 'function') {
      const regular = unique.filter(value => !value.startsWith('📍 Pin'));
      const resolved = regular.length
        ? await locations.getLocationsByIdentifiers(regular)
        : [];
      return [
        ...resolved,
        ...unique.filter(value => value.startsWith('📍 Pin')).map(() => ({
          is_pin: true,
          nombre_destino: 'Ubicación Personalizada'
        }))
      ];
    }
    return (await Promise.all(unique.map(value => locations.getLocationByName(value))))
      .filter(Boolean);
  }

  function locationFor(points, identifier) {
    const target = String(identifier);
    const normalized = target.toLocaleLowerCase('es-SV');
    return points.find(point =>
      String(point.id_destino ?? '') === target ||
      String(point.id ?? '') === target ||
      String(point.nombre_destino ?? '').toLocaleLowerCase('es-SV') === normalized
    ) || (target.startsWith('📍 Pin') ? points.find(point => point.is_pin) : null);
  }

  function sameCompany(origin, destination) {
    if (origin.empresa_id != null && destination.empresa_id != null) {
      return String(origin.empresa_id) === String(destination.empresa_id);
    }
    return origin.empresa === destination.empresa;
  }

  async function getUpcomingRoutes(payload) {
    const { origen, destino } = payload;
    if (!origen || !destino) throw new Error('Missing origin or destination');
    const { dropoff_date, dropoff_time } = dropoffFor(payload);
    const origins = Array.isArray(origen) ? origen : [origen];
    const destinations = Array.isArray(destino) ? destino : [destino];
    const points = await resolveIdentifiers([...origins, ...destinations]);
    const results = [];

    for (const originName of origins) {
      const origin = locationFor(points, originName);
      if (!origin) continue;
      for (const destinationName of destinations) {
        const destination = locationFor(points, destinationName);
        if (!destination || !sameCompany(origin, destination)) continue;
        const { options, firstOption, firstMessage } = upcomingOptions(
          origin, destination, dropoff_date, dropoff_time
        );
        if (!firstOption) continue;
        results.push({
          empresa: origin.empresa,
          origen_nombre: origin.nombre_destino,
          origen_msg: firstMessage,
          destino_nombre: destination.nombre_destino,
          opciones: [firstOption],
          opciones_entrega: options
        });
      }
    }

    if (Array.isArray(origen) || Array.isArray(destino)) {
      return { success: true, results };
    }
    return results.length
      ? { success: true, ...results[0] }
      : { success: false, origen_msg: 'No hay rutas disponibles o no operan en esa zona/empresa.' };
  }

  async function searchRoutesByMunicipality(payload) {
    const { origen, destinos, arrival_date } = payload;
    if (!origen || !Array.isArray(destinos)) {
      throw new Error('Missing parameters or destinos is not an array');
    }
    const { dropoff_date, dropoff_time } = dropoffFor(payload);
    const originIdentifiers = Array.isArray(origen) ? origen : [origen];
    const points = await resolveIdentifiers([...originIdentifiers, ...destinos]);

    if (Array.isArray(origen)) {
      const results = [];
      for (const originName of origen) {
        const origin = locationFor(points, originName);
        if (!origin) continue;
        const entry = eta.calcularIngresoOficial(origin, dropoff_date, dropoff_time);
        if (!entry.date || entry.date.toISOString().split('T')[0] !== dropoff_date) continue;
        for (const destinationName of destinos) {
          const destination = locationFor(points, destinationName);
          if (!destination || !sameCompany(origin, destination)) continue;
          const options = filterByArrivalDate(
            eta.proyectarProximasRutas(destination, entry.date, 3), arrival_date
          );
          if (!options.length) continue;
          results.push({
            origen_nombre: origin.nombre_destino,
            empresa: origin.empresa,
            destino_nombre: destination.nombre_destino,
            fecha_llegada: options[0].fecha_llegada,
            horario_recoleccion: options[0].horario_recoleccion,
            origen_msg: entry.msg,
            opciones: options
          });
        }
      }
      return { success: true, results };
    }

    const origin = locationFor(points, origen);
    if (!origin) throw new Error('Origen no encontrado');
    const entry = eta.calcularIngresoOficial(origin, dropoff_date, dropoff_time);
    if (!entry.date) return { success: false, origen_msg: entry.msg, results: [] };
    const results = [];
    for (const destinationName of destinos) {
      const destination = locationFor(points, destinationName);
      if (!destination) continue;
      const options = filterByArrivalDate(
        eta.proyectarProximasRutas(destination, entry.date, 3), arrival_date
      );
      if (!options.length) continue;
      results.push({
        destino_nombre: destination.nombre_destino,
        fecha_llegada: options[0].fecha_llegada,
        horario_recoleccion: options[0].horario_recoleccion,
        origen_msg: entry.msg,
        opciones: options
      });
    }
    return {
      success: true,
      origen_msg: entry.msg,
      origen_nombre: origin.nombre_destino,
      results
    };
  }

  async function searchFlights(payload) {
    const {
      origen_municipio, origen_departamento,
      destino_municipio, destino_departamento
    } = payload;
    if (!origen_municipio || !destino_municipio) {
      throw new Error('Missing origin or destination');
    }
    const { dropoff_date, dropoff_time } = dropoffFor(payload);
    const allLocations = typeof locations.getLocationsByMunicipalities === 'function'
      ? await locations.getLocationsByMunicipalities({
          origin: { municipality: origen_municipio, department: origen_departamento },
          destination: { municipality: destino_municipio, department: destino_departamento }
        })
      : await locations.getAllLocations();
    const origins = allLocations.filter(location =>
      location.ubicacion?.municipio === origen_municipio &&
      (!origen_departamento || location.ubicacion.departamento === origen_departamento)
    );
    const destinations = allLocations.filter(location =>
      location.ubicacion?.municipio === destino_municipio &&
      (!destino_departamento || location.ubicacion.departamento === destino_departamento)
    );
    const results = [];
    for (const origin of origins) {
      if (!origin.empresa) continue;
      for (const destination of destinations) {
        if (!sameCompany(origin, destination)) continue;
        const { options, firstOption, firstMessage } = upcomingOptions(
          origin, destination, dropoff_date, dropoff_time
        );
        if (!firstOption) continue;
        results.push({
          empresa: origin.empresa,
          origen_nombre: origin.nombre_destino,
          origen_tipo: origin.tipo,
          origen_lat: origin.ubicacion.lat,
          origen_lng: origin.ubicacion.lng,
          destino_nombre_destino: destination.nombre_destino,
          destino_tipo: destination.tipo,
          destino_lat: destination.ubicacion.lat,
          destino_lng: destination.ubicacion.lng,
          origen_msg: firstMessage,
          fecha_llegada: firstOption.fecha_llegada,
          horario_recoleccion: firstOption.horario_recoleccion,
          opciones_entrega: options,
          distance: 0
        });
      }
    }
    results.sort((a, b) => a.empresa.localeCompare(b.empresa));
    return { success: true, results };
  }

  return { getUpcomingRoutes, searchRoutesByMunicipality, searchFlights };
}

module.exports = { createRouteUseCases };
