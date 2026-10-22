import { CatalogPoint } from '../models/catalog.models';
import { normalizeSavedPointSnapshot, SavedPointSnapshot } from './saved-points.models';

type UnknownRecord = Record<string, unknown>;

export function catalogPointToSavedSnapshot(point: CatalogPoint): SavedPointSnapshot {
  return {
    pointId: point.pointId,
    name: point.name,
    company: {
      companyId: point.company.companyId,
      name: point.company.name,
      logoUrl: point.company.logoUrl
    },
    pointType: point.pointType,
    location: {
      department: point.location.department,
      municipality: point.location.municipality,
      address: point.location.address,
      coordinates: { ...point.location.coordinates }
    },
    media: { ...point.media }
  };
}

export function legacyLocationToSavedSnapshot(value: unknown): SavedPointSnapshot | null {
  if (!isRecord(value) || !isRecord(value['ubicacion'])) return null;
  const location = value['ubicacion'];
  const pointId = firstText(value['catalogPointId'], value['id_destino'], value['id_origen'], value['id']);
  const name = firstText(value['nombre_destino'], value['destino_nombre'], value['destino_nombre_destino']);
  const companyName = firstText(value['empresa']);
  const department = firstText(location['departamento']);
  const municipality = firstText(location['municipio']);
  if (!pointId || !name || !companyName || !department || !municipality) return null;

  return normalizeSavedPointSnapshot({
    pointId,
    name,
    company: {
      companyId: firstText(value['companyId']),
      name: companyName,
      logoUrl: firstText(value['logoUrl'])
    },
    pointType: firstText(value['tipo']) ?? 'POINT',
    location: {
      department,
      municipality,
      address: firstText(value['direccion_referencia'], location['direccion_referencia']),
      coordinates: {
        lat: finiteNumber(location['lat']),
        lng: finiteNumber(location['lng'])
      }
    },
    media: {
      imageUrl: firstText(value['imagen_referencia']),
      mapsUrl: firstText(value['maps_url'])
    }
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}
