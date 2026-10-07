const { getDB: defaultGetDB } = require('../../config/database');

const NORMALIZED_NAME_SQL = "translate(lower(a.nombre_destino), 'áéíóúüñ', 'aeiouun')";

function createCatalogRepository({ getDB = defaultGetDB } = {}) {
  if (typeof getDB !== 'function') throw new TypeError('getDB must be a function');

  async function getRevision() {
    const db = await getDB();
    const result = await db.query('SELECT revision::text AS revision FROM catalog_revision_state WHERE singleton = true');
    if (result.rows.length !== 1) throw new Error('Catalog revision state is unavailable');
    return `catalog:${result.rows[0].revision}`;
  }

  async function listPoints(query) {
    const db = await getDB();
    const values = [];
    const where = ["a.id_destino IS NOT NULL", "btrim(a.id_destino) <> ''"];
    const add = (value) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.companyId) where.push(`e.id::text = ${add(query.companyId)}`);
    if (query.department) where.push(`lower(a.departamento) = lower(${add(query.department)})`);
    if (query.municipality) where.push(`lower(a.municipio) = lower(${add(query.municipality)})`);
    if (query.pointType) where.push(`lower(a.tipo) = lower(${add(query.pointType)})`);
    if (query.q) where.push(`${NORMALIZED_NAME_SQL} LIKE ${add(`%${normalizeText(query.q)}%`)}`);
    if (query.position) {
      const nameParameter = add(query.position.normalizedName);
      const idParameter = add(query.position.pointId);
      where.push(`(${NORMALIZED_NAME_SQL}, a.id_destino) > (${nameParameter}, ${idParameter})`);
    }

    const limitParameter = add(query.limit + 1);
    const result = await db.query(`
      SELECT
        a.id AS agency_id,
        a.id_destino AS point_id,
        ${NORMALIZED_NAME_SQL} AS normalized_name,
        e.id AS company_id,
        e.nombre AS company_name,
        e.logo_url AS company_logo_url,
        a.nombre_destino AS point_name,
        a.tipo AS point_type,
        a.departamento AS department,
        a.municipio AS municipality,
        a.direccion_referencia AS address,
        a.lat AS latitude,
        a.lng AS longitude,
        a.imagen_referencia AS image_url,
        a.maps_url
      FROM agencias a
      JOIN empresas e ON e.id = a.empresa_id
      WHERE ${where.join('\n        AND ')}
      ORDER BY ${NORMALIZED_NAME_SQL}, a.id_destino
      LIMIT ${limitParameter}
    `, values);

    const visibleRows = result.rows.slice(0, query.limit);
    const scheduleMap = await loadSchedules(db, visibleRows.map((row) => row.agency_id));
    return {
      points: visibleRows.map((row) => mapPoint(row, scheduleMap.get(row.agency_id) || [])),
      hasMore: result.rows.length > query.limit
    };
  }

  async function getPointDetails(pointId) {
    const db = await getDB();
    const result = await db.query(`
      SELECT
        a.id AS agency_id,
        a.id_destino AS point_id,
        ${NORMALIZED_NAME_SQL} AS normalized_name,
        e.id AS company_id,
        e.nombre AS company_name,
        e.logo_url AS company_logo_url,
        a.nombre_destino AS point_name,
        a.tipo AS point_type,
        a.departamento AS department,
        a.municipio AS municipality,
        a.direccion_referencia AS address,
        a.lat AS latitude,
        a.lng AS longitude,
        a.imagen_referencia AS image_url,
        a.maps_url
      FROM agencias a
      JOIN empresas e ON e.id = a.empresa_id
      WHERE a.id_destino = $1
      LIMIT 1
    `, [pointId]);
    const row = result.rows[0];
    if (!row) return null;
    const scheduleMap = await loadSchedules(db, [row.agency_id]);
    return mapPoint(row, scheduleMap.get(row.agency_id) || []);
  }

  return { getPointDetails, getRevision, listPoints };
}

async function loadSchedules(db, agencyIds) {
  if (agencyIds.length === 0) return new Map();
  const result = await db.query(`
    SELECT agencia_id, dia_semana, hora_apertura, hora_cierre
    FROM horarios_operativos
    WHERE agencia_id = ANY($1::int[])
    ORDER BY agencia_id, dia_semana, hora_apertura, hora_cierre
  `, [agencyIds]);
  const schedules = new Map();
  for (const row of result.rows) {
    if (!schedules.has(row.agencia_id)) schedules.set(row.agencia_id, []);
    schedules.get(row.agencia_id).push({
      day: row.dia_semana,
      opensAt: timeOnly(row.hora_apertura),
      closesAt: timeOnly(row.hora_cierre)
    });
  }
  return schedules;
}

function mapPoint(row, schedules) {
  return {
    pointId: row.point_id,
    normalizedName: row.normalized_name,
    company: {
      companyId: String(row.company_id),
      name: row.company_name,
      logoUrl: row.company_logo_url || null
    },
    name: row.point_name,
    pointType: row.point_type.toLocaleUpperCase('es-SV'),
    location: {
      department: row.department,
      municipality: row.municipality,
      address: row.address || null,
      coordinates: {
        lat: numericOrNull(row.latitude),
        lng: numericOrNull(row.longitude)
      }
    },
    media: {
      imageUrl: row.image_url || null,
      mapsUrl: row.maps_url || null
    },
    schedules
  };
}

function normalizeText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-SV');
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timeOnly(value) {
  return typeof value === 'string' ? value.slice(0, 5) : String(value).slice(0, 5);
}

const defaultRepository = createCatalogRepository();

module.exports = {
  createCatalogRepository,
  getPointDetails: defaultRepository.getPointDetails,
  getRevision: defaultRepository.getRevision,
  listPoints: defaultRepository.listPoints,
  normalizeText
};
