const express = require('express');
const router = express.Router();
const mapasController = require('./mapas.controller');

router.post('/resolve-maps-link', mapasController.resolveMapsLink);
router.post('/places/autocomplete', mapasController.searchPlaces);
router.post('/places/resolve', mapasController.resolvePlace);

module.exports = router;
