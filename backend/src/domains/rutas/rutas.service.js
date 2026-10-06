'use strict';

const logistics = require('../../../services/logistics');
const ubicacionesRepo = require('../ubicaciones/ubicaciones.repository');
const { createRouteUseCases } = require('../../application/rutas/route-use-cases');
const {
  validateUpcomingRoutes,
  validateMunicipalityRoutes,
  validateSearchFlights
} = require('./rutas.validation');

function createRutasService({ locations, eta, clock }) {
  const routes = createRouteUseCases({ locations, eta, clock });
  return {
    async getUpcomingRoutes(payload) {
      return routes.getUpcomingRoutes(validateUpcomingRoutes(payload));
    },
    async searchRoutesByMunicipality(payload) {
      return routes.searchRoutesByMunicipality(validateMunicipalityRoutes(payload));
    },
    async searchFlights(payload) {
      return routes.searchFlights(validateSearchFlights(payload));
    }
  };
}

const service = createRutasService({
  locations: ubicacionesRepo,
  eta: logistics,
  clock: { now: () => new Date() }
});

module.exports = { ...service, createRutasService };
