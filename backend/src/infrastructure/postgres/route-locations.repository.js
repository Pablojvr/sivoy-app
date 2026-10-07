'use strict';

const { getDB: defaultGetDB } = require('../../config/database');

function createRouteLocationsRepository({ getDB = defaultGetDB } = {}) {
  if (typeof getDB !== 'function') throw new TypeError('getDB must be a function');

  async function getLocationsByIdentifiers(identifiers) {
    const unique = uniqueStrings(identifiers);
    if (unique.length === 0) return [];

    const db = await getDB();
    const result = await db.query(`
      SELECT
        a.id,
        a.id_destino,
        a.nombre_destino,
        a.tipo,
        a.empresa_id,
        e.nombre AS empresa,
        a.maps_url,
        a.departamento,
        a.municipio,
        a.direccion_referencia,
        a.lat,
        a.lng,
        a.imagen_referencia
      FROM agencias a
      JOIN empresas e ON e.id = a.empresa_id
      WHERE a.id_destino = ANY($1::text[])
      ORDER BY a.id
    `, [unique]);

    const foundIdentifiers = new Set(result.rows.map((row) => String(row.id_destino)));
    const unresolved = unique.filter((identifier) => !foundIdentifiers.has(identifier));
    if (unresolved.length > 0) {
      const legacyResult = await db.query(`
        SELECT
          a.id,
          a.id_destino,
          a.nombre_destino,
          a.tipo,
          a.empresa_id,
          e.nombre AS empresa,
          a.maps_url,
          a.departamento,
          a.municipio,
          a.direccion_referencia,
          a.lat,
          a.lng,
          a.imagen_referencia
        FROM agencias a
        JOIN empresas e ON e.id = a.empresa_id
        WHERE a.id::text = ANY($1::text[])
           OR lower(a.nombre_destino) = ANY($2::text[])
        ORDER BY a.id
      `, [unresolved, unresolved.map((value) => value.toLocaleLowerCase('es-SV'))]);
      const knownAgencyIds = new Set(result.rows.map((row) => row.id));
      result.rows.push(...legacyResult.rows.filter((row) => !knownAgencyIds.has(row.id)));
    }

    return hydrateLocations(db, result.rows);
  }

  async function getLocationsByMunicipalities({ origin, destination }) {
    const db = await getDB();
    const result = await db.query(`
      SELECT
        a.id,
        a.id_destino,
        a.nombre_destino,
        a.tipo,
        a.empresa_id,
        e.nombre AS empresa,
        a.maps_url,
        a.departamento,
        a.municipio,
        a.direccion_referencia,
        a.lat,
        a.lng,
        a.imagen_referencia
      FROM agencias a
      JOIN empresas e ON e.id = a.empresa_id
      WHERE (
        lower(a.municipio) = lower($1)
        AND ($2::text IS NULL OR lower(a.departamento) = lower($2))
      ) OR (
        lower(a.municipio) = lower($3)
        AND ($4::text IS NULL OR lower(a.departamento) = lower($4))
      )
      ORDER BY a.id
    `, [
      origin.municipality,
      origin.department || null,
      destination.municipality,
      destination.department || null
    ]);

    return hydrateLocations(db, result.rows);
  }

  return { getLocationsByIdentifiers, getLocationsByMunicipalities };
}

async function hydrateLocations(db, rows) {
  if (rows.length === 0) return [];
  const agencyIds = rows.map((row) => row.id);
  const schedulesResult = await db.query(`
    SELECT agencia_id, dia_semana, hora_apertura, hora_cierre
    FROM horarios_operativos
    WHERE agencia_id = ANY($1::int[])
    ORDER BY agencia_id, dia_semana, hora_apertura, hora_cierre
  `, [agencyIds]);
  const rulesResult = await db.query(`
    SELECT agencia_id, dia_entrega, dia_corte_maximo
    FROM reglas_entrega
    WHERE agencia_id = ANY($1::int[])
    ORDER BY agencia_id, dia_entrega, dia_corte_maximo
  `, [agencyIds]);

  const schedulesByAgency = groupByAgency(schedulesResult.rows, (row) => ({
    dia_semana: row.dia_semana,
    hora_apertura: row.hora_apertura,
    hora_cierre: row.hora_cierre
  }));
  const rulesByAgency = groupByAgency(rulesResult.rows, (row) => ({
    dia_entrega: row.dia_entrega,
    dia_corte_maximo: row.dia_corte_maximo
  }));

  return rows.map((row) => ({
    id: row.id,
    id_destino: row.id_destino,
    nombre_destino: row.nombre_destino,
    tipo: row.tipo,
    empresa_id: row.empresa_id,
    empresa: row.empresa,
    maps_url: row.maps_url || null,
    ubicacion: {
      departamento: row.departamento,
      municipio: row.municipio,
      direccion_referencia: row.direccion_referencia,
      lat: numericOrNull(row.lat),
      lng: numericOrNull(row.lng)
    },
    imagen_referencia: row.imagen_referencia || null,
    horarios_operativos: schedulesByAgency.get(row.id) || [],
    reglas_entrega: rulesByAgency.get(row.id) || []
  }));
}

function groupByAgency(rows, mapRow) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.agencia_id)) grouped.set(row.agencia_id, []);
    grouped.get(row.agencia_id).push(mapRow(row));
  }
  return grouped;
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value)))];
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const defaultRepository = createRouteLocationsRepository();

module.exports = {
  createRouteLocationsRepository,
  getLocationsByIdentifiers: defaultRepository.getLocationsByIdentifiers,
  getLocationsByMunicipalities: defaultRepository.getLocationsByMunicipalities
};
