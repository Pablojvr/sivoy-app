'use strict';

const net = require('node:net');

const CONTROL_CHARACTERS = /\p{Cc}/u;
const MAX_URL_LENGTH = 2048;
const SOCIAL_HOSTS = Object.freeze({
  FACEBOOK: new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com']),
  INSTAGRAM: new Set(['instagram.com', 'www.instagram.com']),
  WHATSAPP: new Set(['wa.me', 'api.whatsapp.com']),
  TIKTOK: new Set(['tiktok.com', 'www.tiktok.com']),
  YOUTUBE: new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']),
  LINKEDIN: new Set(['linkedin.com', 'www.linkedin.com'])
});

function parsePublicMediaOrigins(value) {
  if (value === undefined || value === null || value.trim?.() === '') return [];
  if (typeof value !== 'string') throw invalidOrigins();

  const origins = value.split(',').map((entry) => entry.trim());
  if (origins.some((entry) => !entry)) throw invalidOrigins();
  return [...new Set(origins.map(validateExactHttpsOrigin))];
}

function createCompanyPublicDataPolicy({ publicMediaOrigins = [] } = {}) {
  if (!Array.isArray(publicMediaOrigins)) throw invalidOrigins();
  const mediaOrigins = new Set(publicMediaOrigins.map(validateExactHttpsOrigin));

  function presentListItem(raw) {
    return {
      companyId: raw.companyId,
      name: raw.name,
      logoUrl: sanitizeLogoUrl(raw.logoUrl, mediaOrigins),
      pointCount: raw.pointCount,
      municipalityCount: raw.municipalityCount
    };
  }

  function presentProfile(raw) {
    return {
      companyId: raw.companyId,
      name: raw.name,
      logoUrl: sanitizeLogoUrl(raw.logoUrl, mediaOrigins),
      description: sanitizeDescription(raw.description),
      websiteUrl: sanitizeWebsiteUrl(raw.websiteUrl),
      socialLinks: sanitizeSocialLinks(raw.socialLinks),
      coverage: {
        pointCount: raw.coverage.pointCount,
        municipalityCount: raw.coverage.municipalityCount,
        departmentCount: raw.coverage.departmentCount
      }
    };
  }

  return { presentListItem, presentProfile };
}

function validateExactHttpsOrigin(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_URL_LENGTH ||
      CONTROL_CHARACTERS.test(value) || value.includes('\\')) {
    throw invalidOrigins();
  }

  const parsed = parseUrl(value);
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.origin !== value) {
    throw invalidOrigins();
  }
  return parsed.origin;
}

function sanitizeLogoUrl(value, mediaOrigins) {
  if (!isBoundedUrlText(value)) return null;
  if (value.startsWith('/uploads/')) return isCanonicalUploadPath(value) ? value : null;
  if (value.startsWith('//')) return null;

  const parsed = parseUrl(value);
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      !mediaOrigins.has(parsed.origin) || hasAmbiguousSegments(value)) {
    return null;
  }
  return value;
}

function isCanonicalUploadPath(value) {
  if (value.includes('?') || value.includes('#') || hasAmbiguousSegments(value)) return false;
  const segments = value.split('/').slice(1);
  if (segments.length < 2 || segments[0] !== 'uploads') return false;
  return segments.slice(1).every((segment) => {
    if (!segment) return false;
    const decoded = decodeSegment(segment);
    return decoded !== null && decoded !== '.' && decoded !== '..' &&
      !decoded.includes('/') && !decoded.includes('\\') && !CONTROL_CHARACTERS.test(decoded);
  });
}

function hasAmbiguousSegments(value) {
  const path = value.split(/[?#]/u, 1)[0];
  return path.split('/').some((segment) => {
    const decoded = decodeSegment(segment);
    return decoded === null || decoded === '.' || decoded === '..' ||
      decoded.includes('\\') || CONTROL_CHARACTERS.test(decoded);
  });
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function sanitizeDescription(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 500 || CONTROL_CHARACTERS.test(value)) return null;
  return value;
}

function sanitizeWebsiteUrl(value) {
  if (!isBoundedUrlText(value)) return null;
  const parsed = parseUrl(value);
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      isUnsafeHostname(parsed.hostname)) {
    return null;
  }
  return value;
}

function sanitizeSocialLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isSafeSocialLink)
    .map((link) => ({ platform: link.platform, url: link.url, order: link.order }))
    .sort((left, right) => left.order - right.order || left.platform.localeCompare(right.platform));
}

function isSafeSocialLink(link) {
  if (!link || typeof link !== 'object' || Array.isArray(link) ||
      !Object.hasOwn(SOCIAL_HOSTS, link.platform) ||
      !Number.isSafeInteger(link.order) || link.order < 0 ||
      !isBoundedUrlText(link.url)) {
    return false;
  }
  const parsed = parseUrl(link.url);
  return Boolean(parsed && parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
    !parsed.port && SOCIAL_HOSTS[link.platform].has(parsed.hostname.toLocaleLowerCase('en-US')));
}

function isBoundedUrlText(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_URL_LENGTH &&
    !CONTROL_CHARACTERS.test(value) && !value.includes('\\');
}

function isUnsafeHostname(hostname) {
  const normalized = hostname.toLocaleLowerCase('en-US').replace(/\.$/u, '');
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  const unwrapped = normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;
  const version = net.isIP(unwrapped);
  if (version === 4) return isReservedIpv4(unwrapped);
  if (version === 6) return isReservedIpv6(unwrapped);
  return false;
}

function isReservedIpv4(value) {
  const [a, b, c] = value.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}

function isReservedIpv6(value) {
  const normalized = value.toLocaleLowerCase('en-US');
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('::ffff:')) return true;
  const first = Number.parseInt(normalized.split(':', 1)[0] || '0', 16);
  return !Number.isInteger(first) || first < 0x2000 || first > 0x3fff ||
    normalized.startsWith('2001:db8:');
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function invalidOrigins() {
  return new TypeError('PUBLIC_MEDIA_ORIGINS is invalid');
}

module.exports = { createCompanyPublicDataPolicy, parsePublicMediaOrigins };
