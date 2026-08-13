const express = require('express');
const router = express.Router();
const empresasController = require('./empresas.controller');
const empresasExcelController = require('./empresas.excel.controller');
const upload = require('../../config/upload');

// Generate Excel Template for bulk import
router.get('/excel-template', empresasExcelController.downloadTemplate);

// Create a new company
router.post('/', upload.single('logo'), empresasController.createEmpresa);

// List all companies
router.get('/', empresasController.getAllEmpresas);

// Update an existing company
router.put('/:id', upload.single('logo'), empresasController.updateEmpresa);

module.exports = router;
