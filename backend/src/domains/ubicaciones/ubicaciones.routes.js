const express = require('express');
const router = express.Router();
const ubicacionesController = require('./ubicaciones.controller');
const upload = require('../../config/upload');

// En api.js estaban mapeados bajo:
// GET /locations
// PUT /locations/:id
// POST /agencias
// GET /test-location
// We will mount this router at /api/ (or specifically at /api/locations and /api/agencias).
// For now, let's keep the exact same paths to not break the frontend.
// Since we mount the router in server.js, we will just export these specific routes.

router.get('/locations', ubicacionesController.getAllLocations);
router.put('/locations/:id', upload.single('imagen_referencia'), ubicacionesController.updateLocation);
router.post('/agencias', upload.single('imagen_referencia'), ubicacionesController.createAgencia);
router.get('/test-location', ubicacionesController.testLocation);

module.exports = router;
