'use strict';

const { getDB: defaultGetDB } = require('../../config/database');

const FULL_NORMALIZED_NAME_SQL =
  "translate(lower(e.nombre), 'áéíóúüñ', 'aeiouun')";
const BOUNDED_NORMALIZED_NAME_SQL = `left(${FULL_NORMALIZED_NAME_SQL}, 250)`;
const PUBLIC_POINT_PREDICATE = [
  'a.id_destino IS NOT NULL',
  "btrim(a.id_destino) <> ''"
].join('\n        AND ');

function createCompanyCatalogRepository({ getDB = defaultGetDB } = {}) {
  if (typeof getDB !== 'function') throw new TypeError('getDB must be a function');

  async function getRevision() {
    const db = await getDB();
    const result = await db.query(
      'SELECT revision::text AS revision FROM catalog_revision_state WHERE singleton = true'
    );
    if (result.rows.length !== 1) throw new Error('Catalog revision state is unavailable');
    return `catalog:${result.rows[0].revision}`;
  }

  async function listCompanies(query) {
    const db = await getDB();
    const values = [];
    const add = (value) => {
      values.push(value);
      return `$${values.length}`;
    };
    const searchPredicates = [];
    const cursorPredicates = [];
    let matchRankSql = '0';

    if (query.q) {
      const exactParameter = add(query.q);
      const prefixParameter = add(`${escapeLikePattern(query.q)}%`);
      const containsParameter = add(`%${escapeLikePattern(query.q)}%`);
      searchPredicates.push(`${FULL_NORMALIZED_NAME_SQL} LIKE ${containsParameter} ESCAPE '\\'`);
      matchRankSql = `CASE
          WHEN ${FULL_NORMALIZED_NAME_SQL} = ${exactParameter} THEN 0
          WHEN ${FULL_NORMALIZED_NAME_SQL} LIKE ${prefixParameter} ESCAPE '\\' THEN 1
          ELSE 2
        END`;
    }

    if (query.position) {
      const rankParameter = add(query.position.matchRank);
      const nameParameter = add(query.position.normalizedName);
      const idParameter = add(query.position.companyId);
      cursorPredicates.push(`(match_rank, normalized_name, company_id) >
        (${rankParameter}, ${nameParameter}, ${idParameter})`);
    }

    const limitParameter = add(query.limit + 1);
    const result = await db.query(`
      WITH public_coverage AS (
        SELECT
          a.empresa_id,
          COUNT(*)::text AS point_count,
          (COUNT(DISTINCT (
            lower(btrim(a.departamento)),
            lower(btrim(a.municipio))
          )) FILTER (
            WHERE a.departamento IS NOT NULL
              AND btrim(a.departamento) <> ''
              AND a.municipio IS NOT NULL
              AND btrim(a.municipio) <> ''
          ))::text AS municipality_count
        FROM agencias a
        WHERE ${PUBLIC_POINT_PREDICATE}
        GROUP BY a.empresa_id
      ), ranked_companies AS (
        SELECT
          e.id AS company_id,
          e.nombre AS company_name,
          e.logo_url AS company_logo_url,
          ${BOUNDED_NORMALIZED_NAME_SQL} AS normalized_name,
          ${matchRankSql} AS match_rank,
          COALESCE(c.point_count, '0') AS point_count,
          COALESCE(c.municipality_count, '0') AS municipality_count
        FROM empresas e
        LEFT JOIN public_coverage c ON c.empresa_id = e.id
        ${searchPredicates.length ? `WHERE ${searchPredicates.join('\n          AND ')}` : ''}
      )
      SELECT
        company_id,
        company_name,
        company_logo_url,
        normalized_name,
        match_rank,
        point_count,
        municipality_count
      FROM ranked_companies
      ${cursorPredicates.length ? `WHERE ${cursorPredicates.join('\n        AND ')}` : ''}
      ORDER BY match_rank, normalized_name, company_id
      LIMIT ${limitParameter}
    `, values);

    return {
      companies: result.rows.slice(0, query.limit).map(mapCompanyListItem),
      hasMore: result.rows.length > query.limit
    };
  }

  async function getCompanyProfile(companyId) {
    const db = await getDB();
    const result = await db.query(`
      SELECT
        e.id AS company_id,
        e.nombre AS company_name,
        e.logo_url AS company_logo_url,
        e.descripcion AS description,
        e.website_url,
        (COUNT(a.id) FILTER (
          WHERE a.id_destino IS NOT NULL
            AND btrim(a.id_destino) <> ''
        ))::text AS point_count,
        (COUNT(DISTINCT (
          lower(btrim(a.departamento)),
          lower(btrim(a.municipio))
        )) FILTER (
          WHERE a.id_destino IS NOT NULL
            AND btrim(a.id_destino) <> ''
            AND a.departamento IS NOT NULL
            AND btrim(a.departamento) <> ''
            AND a.municipio IS NOT NULL
            AND btrim(a.municipio) <> ''
        ))::text AS municipality_count,
        (COUNT(DISTINCT lower(btrim(a.departamento))) FILTER (
          WHERE a.id_destino IS NOT NULL
            AND btrim(a.id_destino) <> ''
            AND a.departamento IS NOT NULL
            AND btrim(a.departamento) <> ''
        ))::text AS department_count
      FROM empresas e
      LEFT JOIN agencias a ON a.empresa_id = e.id
      WHERE e.id::text = $1
      GROUP BY e.id, e.nombre, e.logo_url, e.descripcion, e.website_url
      LIMIT 1
    `, [companyId]);

    const row = result.rows[0];
    if (!row) return null;

    const socialResult = await db.query(`
      SELECT
        plataforma AS platform,
        url,
        orden AS social_order
      FROM empresa_redes_sociales
      WHERE empresa_id::text = $1
        AND visible = true
      ORDER BY orden, plataforma
    `, [companyId]);

    return mapCompanyProfile(row, socialResult.rows);
  }

  return { getCompanyProfile, getRevision, listCompanies };
}

function escapeLikePattern(value) {
  return value.replace(/[\\%_]/gu, '\\$&');
}

function mapCompanyListItem(row) {
  const matchRank = toSafeCount(row.match_rank, 'Company match rank');
  if (matchRank > 2) throw new Error('Company match rank is invalid');
  return {
    companyId: String(row.company_id),
    name: String(row.company_name),
    logoUrl: row.company_logo_url || null,
    pointCount: toSafeCount(row.point_count, 'Company point count'),
    municipalityCount: toSafeCount(row.municipality_count, 'Company municipality count'),
    matchRank,
    normalizedName: boundNormalizedName(row.normalized_name)
  };
}

function mapCompanyProfile(row, socialRows) {
  return {
    companyId: String(row.company_id),
    name: String(row.company_name),
    logoUrl: row.company_logo_url || null,
    description: row.description || null,
    websiteUrl: row.website_url || null,
    socialLinks: socialRows.map((social) => ({
      platform: String(social.platform),
      url: String(social.url),
      order: toSafeCount(social.social_order, 'Company social order')
    })),
    coverage: {
      pointCount: toSafeCount(row.point_count, 'Company point count'),
      municipalityCount: toSafeCount(row.municipality_count, 'Company municipality count'),
      departmentCount: toSafeCount(row.department_count, 'Company department count')
    }
  };
}

function boundNormalizedName(value) {
  return Array.from(String(value)).slice(0, 250).join('');
}

function toSafeCount(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} is invalid`);
  return parsed;
}

module.exports = { createCompanyCatalogRepository };
