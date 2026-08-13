const express = require('express');
const router = express.Router();
const mapasController = require('./mapas.controller');

router.post('/resolve-maps-link', mapasController.resolveMapsLink);

module.exports = router;
