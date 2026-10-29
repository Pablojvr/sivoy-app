'use strict';

const {
  companyQueryFingerprint,
  decodeCompanyCursor,
  encodeCompanyCursor
} = require('./company-cursor');
const { CatalogError } = require('../../domains/catalog/catalog.validation');

const DEFAULT_CURSOR_CODEC = Object.freeze({
  decode: decodeCompanyCursor,
  encode: encodeCompanyCursor
});

function createCompanyQueryService({
  repository,
  cache,
  policy,
  cursorCodec = DEFAULT_CURSOR_CODEC
} = {}) {
  if (!repository || typeof repository.getRevision !== 'function' ||
      typeof repository.listCompanies !== 'function' ||
      typeof repository.getCompanyProfile !== 'function') {
    throw new TypeError('Company catalog repository is invalid');
  }
  if (!cache || typeof cache.get !== 'function' || typeof cache.set !== 'function') {
    throw new TypeError('Company catalog cache is invalid');
  }
  if (!policy || typeof policy.presentListItem !== 'function' ||
      typeof policy.presentProfile !== 'function') {
    throw new TypeError('Company public data policy is invalid');
  }
  if (!cursorCodec || typeof cursorCodec.decode !== 'function' ||
      typeof cursorCodec.encode !== 'function') {
    throw new TypeError('Company cursor codec is invalid');
  }

  async function listCompanies(query) {
    const revision = await repository.getRevision();
    const position = query.cursor
      ? cursorCodec.decode(query.cursor, { revision, query })
      : null;
    const cacheKey = companyListCacheKey(revision, query);
    let page = await readCache(cache, cacheKey);

    if (!page) {
      page = await repository.listCompanies({ ...query, position });
      await writeCache(cache, cacheKey, page, 300);
    }

    const last = page.companies.at(-1);
    const nextCursor = page.hasMore && last
      ? cursorCodec.encode({
          revision,
          query,
          position: {
            matchRank: last.matchRank,
            normalizedName: last.normalizedName,
            companyId: last.companyId
          }
        })
      : null;

    return {
      data: page.companies.map((company) => policy.presentListItem(company)),
      page: { limit: query.limit, hasMore: page.hasMore, nextCursor },
      meta: { catalogRevision: revision }
    };
  }

  async function getCompanyProfile(companyId) {
    const revision = await repository.getRevision();
    const cacheKey = `company-catalog:v1:profile:${revision}:${companyId}`;
    let profile = await readCache(cache, cacheKey);

    if (!profile) {
      profile = await repository.getCompanyProfile(companyId);
      if (!profile) {
        throw new CatalogError(
          404,
          'COMPANY_NOT_FOUND',
          'No encontramos la empresa solicitada.'
        );
      }
      await writeCache(cache, cacheKey, profile, 300);
    }

    return policy.presentProfile(profile);
  }

  return { getCompanyProfile, listCompanies };
}

function companyListCacheKey(revision, query) {
  const pageKey = query.cursor || 'first';
  return `company-catalog:v1:list:${revision}:${companyQueryFingerprint(query)}:${pageKey}`;
}

async function readCache(cache, key) {
  try {
    return await cache.get(key);
  } catch {
    return null;
  }
}

async function writeCache(cache, key, value, ttlSeconds) {
  try {
    await cache.set(key, value, ttlSeconds);
  } catch {
    // PostgreSQL remains authoritative when the optional cache is unavailable.
  }
}

module.exports = { createCompanyQueryService };
