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

  async function getUpcomingRoutes(payload) {
    const { origen, destino } = payload;
    if (!origen || !destino) throw new Error('Missing origin or destination');
    const { dropoff_date, dropoff_time } = dropoffFor(payload);
    const origins = Array.isArray(origen) ? origen : [origen];
    const destinations = Array.isArray(destino) ? destino : [destino];
    const results = [];

    for (const originName of origins) {
      const origin = await locations.getLocationByName(originName);
      if (!origin) continue;
      for (const destinationName of destinations) {
        const destination = await locations.getLocationByName(destinationName);
        if (!destination || origin.empresa !== destination.empresa) continue;
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

    if (Array.isArray(origen)) {
      const results = [];
      for (const originName of origen) {
        const origin = await locations.getLocationByName(originName);
        if (!origin) continue;
        const entry = eta.calcularIngresoOficial(origin, dropoff_date, dropoff_time);
        if (!entry.date || entry.date.toISOString().split('T')[0] !== dropoff_date) continue;
        for (const destinationName of destinos) {
          const destination = await locations.getLocationByName(destinationName);
          if (!destination || origin.empresa !== destination.empresa) continue;
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

    const origin = await locations.getLocationByName(origen);
    if (!origin) throw new Error('Origen no encontrado');
    const entry = eta.calcularIngresoOficial(origin, dropoff_date, dropoff_time);
    if (!entry.date) return { success: false, origen_msg: entry.msg, results: [] };
    const results = [];
    for (const destinationName of destinos) {
      const destination = await locations.getLocationByName(destinationName);
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
    const allLocations = await locations.getAllLocations();
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
        if (destination.empresa !== origin.empresa) continue;
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
