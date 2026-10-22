function createNoopCatalogCache() {
  return Object.freeze({
    get: async () => null,
    set: async () => {}
  });
}

module.exports = { createNoopCatalogCache };
