const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_SOURCE_BASE_URL = 'https://sivoy-backend.onrender.com';
const DEFAULT_OUTPUT = path.join(__dirname, '..', 'data', 'pedidos-express.public.json');
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_ORDER = new Map([
  ['Lunes', 1],
  ['Martes', 2],
  ['Miércoles', 3],
  ['Jueves', 4],
  ['Viernes', 5],
  ['Sábado', 6],
  ['Domingo', 7]
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredText(value, field, maximum = 500) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new TypeError(`${field} must contain 1-${maximum} characters`);
  }
  return normalized;
}

function optionalText(value, field, maximum = 2000) {
  if (value === null || value === undefined || value === '') return null;
  return requiredText(value, field, maximum);
}

function integer(value, field, minimum = 0) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new TypeError(`${field} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

function coordinate(value, field, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function time(value, field) {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    throw new TypeError(`${field} must use HH:mm`);
  }
  return value;
}

function normalizeSourceBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('sourceBaseUrl must be an HTTP URL without credentials');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function normalizeCompany(company) {
  if (!company || typeof company !== 'object' || Array.isArray(company)) {
    throw new TypeError('company must be an object');
  }
  return {
    legacyId: integer(company.id, 'company.id', 1),
    name: requiredText(company.nombre, 'company.nombre', 160),
    logoUrl: optionalText(company.logo_url, 'company.logo_url'),
    pointCount: integer(company.puntos_count ?? 0, 'company.puntos_count')
  };
}

function normalizeSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new TypeError('schedule must be an object');
  }
  const weekday = requiredText(schedule.dia_semana, 'schedule.dia_semana', 20);
  if (!WEEKDAY_ORDER.has(weekday)) throw new TypeError('schedule.dia_semana is invalid');
  const opensAt = time(schedule.hora_apertura, 'schedule.hora_apertura');
  const closesAt = time(schedule.hora_cierre, 'schedule.hora_cierre');
  if (closesAt <= opensAt) throw new TypeError('schedule closing time must be after opening time');
  return { weekday, opensAt, closesAt };
}

function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    throw new TypeError('delivery rule must be an object');
  }
  return {
    deliveryDay: requiredText(rule.dia_entrega, 'rule.dia_entrega', 40),
    cutoff: requiredText(rule.dia_corte_maximo, 'rule.dia_corte_maximo', 80)
  };
}

function normalizeLocation(location) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    throw new TypeError('location must be an object');
  }
  if (!location.ubicacion || typeof location.ubicacion !== 'object' || Array.isArray(location.ubicacion)) {
    throw new TypeError('location.ubicacion must be an object');
  }
  if (!Array.isArray(location.horarios_operativos) || location.horarios_operativos.length === 0) {
    throw new TypeError('location.horarios_operativos must be a non-empty array');
  }
  if (!Array.isArray(location.reglas_entrega) || location.reglas_entrega.length === 0) {
    throw new TypeError('location.reglas_entrega must be a non-empty array');
  }

  const schedules = location.horarios_operativos.map(normalizeSchedule).sort((left, right) =>
    WEEKDAY_ORDER.get(left.weekday) - WEEKDAY_ORDER.get(right.weekday)
      || left.opensAt.localeCompare(right.opensAt)
      || left.closesAt.localeCompare(right.closesAt)
  );
  const deliveryRules = location.reglas_entrega.map(normalizeRule).sort((left, right) =>
    compareText(left.deliveryDay, right.deliveryDay) || compareText(left.cutoff, right.cutoff)
  );

  return {
    legacyId: integer(location.id, 'location.id', 1),
    stableId: requiredText(location.id_destino, 'location.id_destino', 160),
    name: requiredText(location.nombre_destino, 'location.nombre_destino', 160),
    type: requiredText(location.tipo, 'location.tipo', 80),
    companyName: requiredText(location.empresa, 'location.empresa', 160),
    mapsUrl: optionalText(location.maps_url, 'location.maps_url'),
    place: {
      department: requiredText(location.ubicacion.departamento, 'location.ubicacion.departamento', 120),
      municipality: requiredText(location.ubicacion.municipio, 'location.ubicacion.municipio', 120),
      address: optionalText(location.ubicacion.direccion_referencia, 'location.ubicacion.direccion_referencia'),
      latitude: coordinate(location.ubicacion.lat, 'latitude', -90, 90),
      longitude: coordinate(location.ubicacion.lng, 'longitude', -180, 180)
    },
    imageUrl: optionalText(location.imagen_referencia, 'location.imagen_referencia'),
    schedules,
    deliveryRules
  };
}

function snapshotPayload(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    sourceBaseUrl: snapshot.sourceBaseUrl,
    companies: snapshot.companies,
    locations: snapshot.locations
  };
}

function checksum(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildManifest(payload) {
  return {
    counts: {
      companies: payload.companies.length,
      locations: payload.locations.length,
      schedules: payload.locations.reduce((total, point) => total + point.schedules.length, 0),
      deliveryRules: payload.locations.reduce((total, point) => total + point.deliveryRules.length, 0),
      missingMapsUrl: payload.locations.filter((point) => point.mapsUrl === null).length,
      missingImage: payload.locations.filter((point) => point.imageUrl === null).length
    },
    sha256: checksum(payload)
  };
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new TypeError(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function buildPublicCatalogSnapshot(companiesResponse, locationsResponse, options = {}) {
  if (!companiesResponse || companiesResponse.success !== true || !Array.isArray(companiesResponse.empresas)) {
    throw new TypeError('companies response is invalid');
  }
  if (!Array.isArray(locationsResponse)) throw new TypeError('locations response must be an array');

  const companies = companiesResponse.empresas.map(normalizeCompany).sort((left, right) =>
    compareText(left.name, right.name)
  );
  const locations = locationsResponse.map(normalizeLocation).sort((left, right) =>
    compareText(left.stableId, right.stableId)
  );
  assertUnique(companies.map((company) => company.legacyId), 'company legacy id');
  assertUnique(companies.map((company) => company.name.toLocaleLowerCase('es')), 'company name');
  assertUnique(locations.map((point) => point.legacyId), 'location legacy id');
  assertUnique(locations.map((point) => point.stableId), 'stable id');

  const companyNames = new Set(companies.map((company) => company.name));
  for (const point of locations) {
    if (!companyNames.has(point.companyName)) {
      throw new TypeError(`Unknown company for location ${point.stableId}`);
    }
  }

  const payload = {
    schemaVersion: 1,
    sourceBaseUrl: normalizeSourceBaseUrl(options.sourceBaseUrl || DEFAULT_SOURCE_BASE_URL),
    companies,
    locations
  };
  return deepFreeze({ ...payload, manifest: buildManifest(payload) });
}

function validatePublicCatalogSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('snapshot must be an object');
  }
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.companies) || !Array.isArray(snapshot.locations)) {
    throw new TypeError('snapshot shape is invalid');
  }
  const payload = snapshotPayload(snapshot);
  const rebuilt = buildPublicCatalogSnapshot(
    {
      success: true,
      empresas: snapshot.companies.map((company) => ({
        id: company.legacyId,
        nombre: company.name,
        logo_url: company.logoUrl,
        puntos_count: company.pointCount
      }))
    },
    snapshot.locations.map((point) => ({
      id: point.legacyId,
      id_destino: point.stableId,
      nombre_destino: point.name,
      tipo: point.type,
      empresa: point.companyName,
      maps_url: point.mapsUrl,
      ubicacion: {
        departamento: point.place && point.place.department,
        municipio: point.place && point.place.municipality,
        direccion_referencia: point.place && point.place.address,
        lat: point.place && point.place.latitude,
        lng: point.place && point.place.longitude
      },
      imagen_referencia: point.imageUrl,
      horarios_operativos: Array.isArray(point.schedules)
        ? point.schedules.map((schedule) => ({
          dia_semana: schedule.weekday,
          hora_apertura: schedule.opensAt,
          hora_cierre: schedule.closesAt
        }))
        : point.schedules,
      reglas_entrega: Array.isArray(point.deliveryRules)
        ? point.deliveryRules.map((rule) => ({
          dia_entrega: rule.deliveryDay,
          dia_corte_maximo: rule.cutoff
        }))
        : point.deliveryRules
    })),
    { sourceBaseUrl: snapshot.sourceBaseUrl }
  );
  if (JSON.stringify(payload) !== JSON.stringify(snapshotPayload(rebuilt))) {
    throw new TypeError('snapshot contents are not canonical');
  }
  const expected = buildManifest(payload);
  if (!snapshot.manifest || snapshot.manifest.sha256 !== expected.sha256) {
    throw new TypeError('snapshot checksum mismatch');
  }
  if (JSON.stringify(snapshot.manifest.counts) !== JSON.stringify(expected.counts)) {
    throw new TypeError('snapshot manifest counts mismatch');
  }
  return deepFreeze({ ...expected, counts: { ...expected.counts } });
}

async function fetchJson(url, fetchImplementation = globalThis.fetch) {
  if (typeof fetchImplementation !== 'function') throw new TypeError('fetch implementation is required');
  const response = await fetchImplementation(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Catalog request failed with status ${response.status}`);
  return response.json();
}

async function capturePublicCatalog(options = {}) {
  const sourceBaseUrl = normalizeSourceBaseUrl(options.sourceBaseUrl || DEFAULT_SOURCE_BASE_URL);
  const [companies, locations] = await Promise.all([
    fetchJson(`${sourceBaseUrl}/api/empresas`, options.fetchImplementation),
    fetchJson(`${sourceBaseUrl}/api/locations`, options.fetchImplementation)
  ]);
  const snapshot = buildPublicCatalogSnapshot(companies, locations, { sourceBaseUrl });
  const output = path.resolve(options.output || DEFAULT_OUTPUT);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  return { output, manifest: snapshot.manifest };
}

if (require.main === module) {
  capturePublicCatalog({ sourceBaseUrl: process.env.SIVOY_CATALOG_SOURCE_URL })
    .then(({ output, manifest }) => {
      process.stdout.write(`${JSON.stringify({ output, manifest })}\n`);
    })
    .catch((error) => {
      process.stderr.write(`Catalog capture failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  buildPublicCatalogSnapshot,
  capturePublicCatalog,
  validatePublicCatalogSnapshot
};
