const express = require('express');
const { createCatalogQueryService } = require('../../application/catalog/catalog-query.service');
const { createCompanyQueryService } = require('../../application/catalog/company-query.service');
const {
  createCompanyPublicDataPolicy,
  parsePublicMediaOrigins
} = require('../../application/catalog/company-public-data.policy');
const { createNoopCatalogCache } = require('../../application/catalog/noop-catalog-cache');
const { createCatalogRepository } = require('../../infrastructure/postgres/catalog.repository');
const {
  createCompanyCatalogRepository
} = require('../../infrastructure/postgres/company-catalog.repository');
const { createCatalogController } = require('./catalog.controller');
const { createCompanyCatalogController } = require('./company-catalog.controller');

function createCatalogRouter({ service, companyService } = {}) {
  const catalogService = service || createCatalogQueryService({
    repository: createCatalogRepository(),
    cache: createNoopCatalogCache()
  });
  const publicCompanyService = companyService || createCompanyQueryService({
    repository: createCompanyCatalogRepository(),
    cache: createNoopCatalogCache(),
    policy: createCompanyPublicDataPolicy({
      publicMediaOrigins: parsePublicMediaOrigins(process.env.PUBLIC_MEDIA_ORIGINS)
    })
  });
  const controller = createCatalogController({ service: catalogService });
  const companyController = createCompanyCatalogController({ service: publicCompanyService });
  const router = express.Router();

  router.get('/companies', companyController.listCompanies);
  router.get('/companies/:companyId', companyController.getCompanyProfile);
  router.get('/facets', controller.listFacets);
  router.get('/points', controller.listPoints);
  router.get('/points/:pointId', controller.getPointDetails);
  return router;
}

const router = createCatalogRouter();

module.exports = router;
module.exports.createCatalogRouter = createCatalogRouter;
