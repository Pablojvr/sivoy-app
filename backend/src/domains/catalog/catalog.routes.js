const express = require('express');
const { createCatalogQueryService } = require('../../application/catalog/catalog-query.service');
const { createNoopCatalogCache } = require('../../application/catalog/noop-catalog-cache');
const { createCatalogRepository } = require('../../infrastructure/postgres/catalog.repository');
const { createCatalogController } = require('./catalog.controller');

function createCatalogRouter({ service } = {}) {
  const catalogService = service || createCatalogQueryService({
    repository: createCatalogRepository(),
    cache: createNoopCatalogCache()
  });
  const controller = createCatalogController({ service: catalogService });
  const router = express.Router();

  router.get('/points', controller.listPoints);
  return router;
}

const router = createCatalogRouter();

module.exports = router;
module.exports.createCatalogRouter = createCatalogRouter;
