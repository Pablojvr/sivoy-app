'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const {
  createCompanyCatalogRepository
} = require('../src/infrastructure/postgres/company-catalog.repository');

describe('public company catalog repository', () => {
  test('reads the opaque global catalog revision', async () => {
    const db = {
      query: async (text, values) => {
        assert.match(text, /catalog_revision_state/);
        assert.equal(values, undefined);
        return { rows: [{ revision: '27' }] };
      }
    };
    const repository = createCompanyCatalogRepository({ getDB: async () => db });

    assert.equal(await repository.getRevision(), 'catalog:27');
  });

  test('lists one bounded page using literal wildcard search and total ranking order', async () => {
    const calls = [];
    const q = 'pedidos %_\\';
    const db = {
      query: async (text, values) => {
        calls.push({ text, values });
        assert.doesNotMatch(text, /SELECT\s+\*/i);
        assert.doesNotMatch(text, new RegExp(escapeRegExp(q), 'i'));
        assert.match(text, /LIKE\s+\$\d+\s+ESCAPE\s+'\\'/i);
        assert.match(text, /CASE[\s\S]+THEN\s+0[\s\S]+THEN\s+1[\s\S]+ELSE\s+2[\s\S]+END/i);
        assert.match(text, /ORDER BY[\s\S]+match_rank[\s\S]+normalized_name[\s\S]+company_id/i);
        assert.match(text, /LEFT\s*\([\s\S]+?,\s*250\s*\)/i);
        assert.ok(values.includes('%pedidos \\%\\_\\\\%'));
        assert.equal(values.at(-1), 3);
        return {
          rows: [
            companyListRow({ id: 7, name: 'Pedidos %_\\', rank: 0, points: 2, municipalities: 1 }),
            companyListRow({ id: 8, name: 'Pedidos Express', rank: 1, points: 185, municipalities: 42 }),
            companyListRow({ id: 9, name: 'Mis Pedidos', rank: 2, points: 0, municipalities: 0 })
          ]
        };
      }
    };
    const repository = createCompanyCatalogRepository({ getDB: async () => db });

    const result = await repository.listCompanies({
      q,
      limit: 2,
      cursor: null,
      position: null
    });

    assert.equal(calls.length, 1);
    assert.equal(result.hasMore, true);
    assert.deepEqual(result.companies, [
      {
        companyId: '7',
        name: 'Pedidos %_\\',
        logoUrl: null,
        pointCount: 2,
        municipalityCount: 1,
        matchRank: 0,
        normalizedName: 'pedidos %_\\'
      },
      {
        companyId: '8',
        name: 'Pedidos Express',
        logoUrl: null,
        pointCount: 185,
        municipalityCount: 42,
        matchRank: 1,
        normalizedName: 'pedidos express'
      }
    ]);
  });

  test('applies the complete cursor tuple and keeps legacy ordering keys bounded', async () => {
    const boundedName = '界'.repeat(250);
    const db = {
      query: async (text, values) => {
        assert.match(text, />\s*\(\s*\$\d+\s*,\s*\$\d+\s*,\s*\$\d+\s*\)/i);
        assert.match(text, /LIKE\s+\$\d+\s+ESCAPE\s+'\\'/i);
        assert.match(text, /ORDER BY[\s\S]+match_rank[\s\S]+normalized_name[\s\S]+company_id/i);
        assert.ok(values.includes('%legacy%'));
        assert.ok(values.includes(2));
        assert.ok(values.includes('empresa legacy'));
        assert.ok(values.includes('2147483647'));
        assert.equal(values.at(-1), 21);
        return {
          rows: [companyListRow({
            id: 2147483647,
            name: `界${'a'.repeat(600)}`,
            normalizedName: boundedName,
            rank: 2,
            points: 0,
            municipalities: 0
          })]
        };
      }
    };
    const repository = createCompanyCatalogRepository({ getDB: async () => db });

    const result = await repository.listCompanies({
      q: 'legacy',
      limit: 20,
      cursor: 'opaque',
      position: {
        matchRank: 2,
        normalizedName: 'empresa legacy',
        companyId: '2147483647'
      }
    });

    assert.equal(result.hasMore, false);
    assert.equal(result.companies[0].normalizedName.length, 250);
    assert.ok(Buffer.byteLength(result.companies[0].normalizedName, 'utf8') <= 1024);
  });

  test('includes companies without public points and counts only non-empty municipality pairs', async () => {
    const db = {
      query: async (text, values) => {
        assert.match(text, /FROM\s+empresas\s+e/i);
        assert.match(text, /LEFT\s+JOIN|LEFT\s+JOIN\s+LATERAL/i);
        assert.match(text, /a\.id_destino\s+IS\s+NOT\s+NULL/i);
        assert.match(text, /btrim\s*\(\s*a\.id_destino\s*\)\s*<>\s*''/i);
        assert.match(text, /a\.departamento\s+IS\s+NOT\s+NULL/i);
        assert.match(text, /btrim\s*\(\s*a\.departamento\s*\)\s*<>\s*''/i);
        assert.match(text, /a\.municipio\s+IS\s+NOT\s+NULL/i);
        assert.match(text, /btrim\s*\(\s*a\.municipio\s*\)\s*<>\s*''/i);
        assert.match(text, /COUNT\s*\(\s*DISTINCT/i);
        assert.equal(values.at(-1), 21);
        return {
          rows: [companyListRow({
            id: 42,
            name: 'Empresa sin cobertura',
            rank: 0,
            points: 0,
            municipalities: 0
          })]
        };
      }
    };
    const repository = createCompanyCatalogRepository({ getDB: async () => db });

    const result = await repository.listCompanies({
      q: null,
      limit: 20,
      cursor: null,
      position: null
    });

    assert.equal(result.companies[0].pointCount, 0);
    assert.equal(result.companies[0].municipalityCount, 0);
  });

  test('gets a company profile and returns ordered visible social URLs as untrusted raw text', async (t) => {
    const calls = [];
    const fetch = t.mock.method(global, 'fetch', async () => {
      throw new Error('company profile repository must not fetch stored URLs');
    });
    const db = {
      query: async (text, values) => {
        calls.push({ text, values });
        assert.deepEqual(values, ['42']);
        if (/FROM\s+empresa_redes_sociales/i.test(text)) {
          assert.match(text, /(?:\w+\.)?visible\s*=\s*true/i);
          assert.match(text, /ORDER BY\s+(?:\w+\.)?orden\s*,\s*(?:\w+\.)?plataforma/i);
          return {
            rows: [
              { platform: 'INSTAGRAM', url: 'https://instagram.com/example', social_order: 1 },
              { platform: 'WHATSAPP', url: 'javascript:legacy-value', social_order: 2 }
            ]
          };
        }

        assert.match(text, /FROM\s+empresas\s+e/i);
        assert.match(text, /e\.id::text\s*=\s*\$1/i);
        assert.match(text, /a\.id_destino\s+IS\s+NOT\s+NULL/i);
        assert.match(text, /LIMIT\s+1/i);
        return {
          rows: [{
            company_id: 42,
            company_name: 'Empresa de prueba',
            company_logo_url: '/uploads/company.webp',
            description: 'Perfil administrado.',
            website_url: 'https://example.com',
            point_count: '0',
            municipality_count: '0',
            department_count: '0'
          }]
        };
      }
    };
    const repository = createCompanyCatalogRepository({ getDB: async () => db });

    const profile = await repository.getCompanyProfile('42');

    assert.equal(calls.length, 2);
    assert.equal(fetch.mock.callCount(), 0);
    assert.deepEqual(profile, {
      companyId: '42',
      name: 'Empresa de prueba',
      logoUrl: '/uploads/company.webp',
      description: 'Perfil administrado.',
      websiteUrl: 'https://example.com',
      socialLinks: [
        { platform: 'INSTAGRAM', url: 'https://instagram.com/example', order: 1 },
        { platform: 'WHATSAPP', url: 'javascript:legacy-value', order: 2 }
      ],
      coverage: {
        pointCount: 0,
        municipalityCount: 0,
        departmentCount: 0
      }
    });
  });

  test('returns null for an unknown canonical company identity without querying social links', async () => {
    const calls = [];
    const db = {
      query: async (text, values) => {
        calls.push({ text, values });
        assert.deepEqual(values, ['99']);
        return { rows: [] };
      }
    };
    const repository = createCompanyCatalogRepository({ getDB: async () => db });

    assert.equal(await repository.getCompanyProfile('99'), null);
    assert.equal(calls.length, 1);
  });
});

function companyListRow({
  id,
  name,
  normalizedName = name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es'),
  rank,
  points,
  municipalities
}) {
  return {
    company_id: id,
    company_name: name,
    company_logo_url: null,
    normalized_name: normalizedName,
    match_rank: rank,
    point_count: String(points),
    municipality_count: String(municipalities)
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
