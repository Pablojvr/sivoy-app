const express = require('express');
const router = express.Router();
const rutasController = require('./rutas.controller');

router.post('/get-upcoming-routes', rutasController.getUpcomingRoutes);
router.post('/search-routes-by-municipality', rutasController.searchRoutesByMunicipality);
router.post('/search-flights', rutasController.searchFlights);

module.exports = router;
