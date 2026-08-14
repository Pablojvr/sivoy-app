const express = require('express');
const router = express.Router();
const ubicacionesController = require('./ubicaciones.controller');

// En api.js estaban mapeados bajo:
// GET /locations
// PUT /locations/:id
// POST /agencias
// GET /test-location
// We will mount this router at /api/ (or specifically at /api/locations and /api/agencias).
// For now, let's keep the exact same paths to not break the frontend.
// Since we mount the router in server.js, we will just export these specific routes.

router.get('/locations', ubicacionesController.getAllLocations);
router.put('/locations/:id', ubicacionesController.updateLocation);
router.post('/agencias', ubicacionesController.createAgencia);
router.get('/test-location', ubicacionesController.testLocation);

module.exports = router;
