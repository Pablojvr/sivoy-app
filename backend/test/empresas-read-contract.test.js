const assert = require('node:assert/strict');
const test = require('node:test');

const databaseModulePath = require.resolve('../src/config/database');
const repositoryModulePath = require.resolve('../src/domains/empresas/empresas.repository');

function normalizeSelectProjection(sql) {
  const selectClause = /\bSELECT\b([\s\S]*?)\bFROM\b/i.exec(sql);
  assert.ok(selectClause, 'getAllEmpresas must issue a SELECT query');

  return selectClause[1]
    .split(',')
    .map((field) => field.trim().replace(/\s+/g, ' ').toLowerCase());
}

test('getAllEmpresas keeps the legacy DTO isolated from future company columns', async (t) => {
  const previousDatabaseModule = require.cache[databaseModulePath];
  const previousRepositoryModule = require.cache[repositoryModulePath];
  let capturedSql = '';

  const storedCompany = {
    id: 7,
    nombre: 'Empresa de prueba',
    logo_url: '/uploads/empresa.png',
    descripcion: 'Must remain private in the legacy response',
    website_url: 'https://example.test',
    puntos_count: '3'
  };

  const fakeDb = {
    query: async (sql) => {
      capturedSql = sql;
      return {
        rows: [/\be\.\*/i.test(sql)
          ? storedCompany
          : {
              id: storedCompany.id,
              nombre: storedCompany.nombre,
              logo_url: storedCompany.logo_url,
              puntos_count: storedCompany.puntos_count
            }]
      };
    }
  };

  require.cache[databaseModulePath] = {
    id: databaseModulePath,
    filename: databaseModulePath,
    loaded: true,
    exports: { getDB: async () => fakeDb },
    children: [],
    paths: []
  };
  delete require.cache[repositoryModulePath];

  t.after(() => {
    if (previousDatabaseModule) {
      require.cache[databaseModulePath] = previousDatabaseModule;
    } else {
      delete require.cache[databaseModulePath];
    }

    if (previousRepositoryModule) {
      require.cache[repositoryModulePath] = previousRepositoryModule;
    } else {
      delete require.cache[repositoryModulePath];
    }
  });

  const { getAllEmpresas } = require(repositoryModulePath);
  const result = await getAllEmpresas();

  assert.deepEqual(
    normalizeSelectProjection(capturedSql),
    [
      'e.id',
      'e.nombre',
      'e.logo_url',
      'count(a.id_destino) as puntos_count'
    ],
    'getAllEmpresas must select only id, nombre, logo_url and puntos_count; SELECT e.* leaks future columns'
  );
  assert.deepEqual(result, [{
    id: 7,
    nombre: 'Empresa de prueba',
    logo_url: '/uploads/empresa.png',
    puntos_count: '3'
  }]);
  assert.equal(Object.hasOwn(result[0], 'descripcion'), false);
  assert.equal(Object.hasOwn(result[0], 'website_url'), false);
});
