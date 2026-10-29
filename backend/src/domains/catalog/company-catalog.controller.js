'use strict';

const { parseCompanyId, parseCompanyListQuery } = require('./company-catalog.validation');
const { sendCatalogError } = require('./catalog.controller');

function createCompanyCatalogController({ service } = {}) {
  if (!service || typeof service.listCompanies !== 'function' ||
      typeof service.getCompanyProfile !== 'function') {
    throw new TypeError('Company catalog service is invalid');
  }

  async function listCompanies(req, res) {
    try {
      const query = parseCompanyListQuery(req.query);
      const result = await service.listCompanies(query);
      return res.status(200).json(result);
    } catch (error) {
      return sendCatalogError(req, res, error, 'company_catalog_list_failed');
    }
  }

  async function getCompanyProfile(req, res) {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      const result = await service.getCompanyProfile(companyId);
      return res.status(200).json(result);
    } catch (error) {
      return sendCatalogError(req, res, error, 'company_catalog_detail_failed');
    }
  }

  return { getCompanyProfile, listCompanies };
}

module.exports = { createCompanyCatalogController };
