const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

const { validatePublicCatalogSnapshot } = require('./public-catalog-snapshot');

const DEFAULT_DATABASE_URL = 'postgresql://sivoy:sivoy_local_only@127.0.0.1:5433/sivoy';
const DEFAULT_SNAPSHOT = path.join(__dirname, '..', 'data', 'pedidos-express.public.json');

function assertLocalDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('A valid PostgreSQL URL is required');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new TypeError('A valid PostgreSQL URL is required');
  }
  const hostname = url.hostname.toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) {
    throw new TypeError('The catalog importer accepts loopback databases only');
  }
  return value;
}

async function upsertCompanies(client, snapshot) {
  const ids = new Map();
  for (const company of snapshot.companies) {
    const result = await client.query(
      `INSERT INTO empresas (nombre, logo_url)
       VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET logo_url = EXCLUDED.logo_url
       RETURNING id`,
      [company.name, company.logoUrl]
    );
    ids.set(company.name, result.rows[0].id);
  }
  return ids;
}

async function removeStaleLocations(client, snapshot, companyIds) {
  for (const company of snapshot.companies) {
    const stableIds = snapshot.locations
      .filter((point) => point.companyName === company.name)
      .map((point) => point.stableId);
    await client.query(
      `DELETE FROM agencias
       WHERE empresa_id = $1
         AND NOT (id_destino = ANY($2::text[]))`,
      [companyIds.get(company.name), stableIds]
    );
  }
}

async function upsertLocation(client, point, companyId) {
  const result = await client.query(
    `INSERT INTO agencias (
       id_destino, nombre_destino, tipo, empresa_id, empresa, maps_url,
       departamento, municipio, direccion_referencia, lat, lng, imagen_referencia
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id_destino) DO UPDATE SET
       nombre_destino = EXCLUDED.nombre_destino,
       tipo = EXCLUDED.tipo,
       empresa_id = EXCLUDED.empresa_id,
       empresa = EXCLUDED.empresa,
       maps_url = EXCLUDED.maps_url,
       departamento = EXCLUDED.departamento,
       municipio = EXCLUDED.municipio,
       direccion_referencia = EXCLUDED.direccion_referencia,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       imagen_referencia = EXCLUDED.imagen_referencia
     RETURNING id`,
    [
      point.stableId,
      point.name,
      point.type,
      companyId,
      point.companyName,
      point.mapsUrl,
      point.place.department,
      point.place.municipality,
      point.place.address,
      point.place.latitude,
      point.place.longitude,
      point.imageUrl
    ]
  );
  return result.rows[0].id;
}

async function replaceSchedules(client, agencyId, schedules) {
  await client.query('DELETE FROM horarios_operativos WHERE agencia_id = $1', [agencyId]);
  for (const schedule of schedules) {
    await client.query(
      `INSERT INTO horarios_operativos (
         agencia_id, dia_semana, hora_apertura, hora_cierre, tipo_accion
       ) VALUES ($1, $2, $3, $4, $5)`,
      [agencyId, schedule.weekday, schedule.opensAt, schedule.closesAt, 'ambos']
    );
  }
}

async function replaceDeliveryRules(client, agencyId, deliveryRules) {
  await client.query('DELETE FROM reglas_entrega WHERE agencia_id = $1', [agencyId]);
  for (const rule of deliveryRules) {
    await client.query(
      `INSERT INTO reglas_entrega (agencia_id, dia_entrega, dia_corte_maximo)
       VALUES ($1, $2, $3)`,
      [agencyId, rule.deliveryDay, rule.cutoff]
    );
  }
}

async function importPublicCatalog({ pool, snapshot }) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('pool.connect is required');
  const manifest = validatePublicCatalogSnapshot(snapshot);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const companyIds = await upsertCompanies(client, snapshot);
    await removeStaleLocations(client, snapshot, companyIds);
    for (const point of snapshot.locations) {
      const agencyId = await upsertLocation(client, point, companyIds.get(point.companyName));
      await replaceSchedules(client, agencyId, point.schedules);
      await replaceDeliveryRules(client, agencyId, point.deliveryRules);
    }
    await client.query('COMMIT');
    return Object.freeze({
      companies: manifest.counts.companies,
      locations: manifest.counts.locations,
      schedules: manifest.counts.schedules,
      deliveryRules: manifest.counts.deliveryRules
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original import failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function runCli() {
  const databaseUrl = assertLocalDatabaseUrl(process.env.DATABASE_URL || DEFAULT_DATABASE_URL);
  const snapshotPath = path.resolve(process.env.SIVOY_CATALOG_SNAPSHOT || DEFAULT_SNAPSHOT);
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const imported = await importPublicCatalog({ pool, snapshot });
    process.stdout.write(`${JSON.stringify({ imported })}\n`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    process.stderr.write(`Catalog import failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertLocalDatabaseUrl,
  importPublicCatalog
};
