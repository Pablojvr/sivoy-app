export const SAVED_POINT_SCHEMA_VERSION = 1 as const;

export interface SavedPointSnapshot {
  pointId: string;
  name: string;
  company: {
    companyId: string | null;
    name: string;
    logoUrl: string | null;
  };
  pointType: string;
  location: {
    department: string;
    municipality: string;
    address: string | null;
    coordinates: { lat: number | null; lng: number | null };
  };
  media: {
    imageUrl: string | null;
    mapsUrl: string | null;
  };
}

export interface SavedPointRecordV1 {
  version: typeof SAVED_POINT_SCHEMA_VERSION;
  pointId: string;
  savedAt: string;
  snapshot: SavedPointSnapshot;
}

type UnknownRecord = Record<string, unknown>;

const TEXT_LIMITS = {
  id: 128,
  label: 180,
  address: 600,
  url: 2048
} as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximumLength ? normalized : null;
}

function optionalText(value: unknown, maximumLength: number): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requiredText(value, maximumLength);
}

function safeUrl(value: unknown): string | null {
  const normalized = optionalText(value, TEXT_LIMITS.url);
  if (!normalized) return null;
  return /^(https?:\/\/|\/(?!\/))/i.test(normalized) ? normalized : null;
}

function coordinate(value: unknown, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined) return null;
  const normalized = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(normalized) && normalized >= minimum && normalized <= maximum
    ? normalized
    : null;
}

export function normalizeSavedPointSnapshot(value: unknown): SavedPointSnapshot | null {
  if (!isRecord(value) || !isRecord(value['company']) || !isRecord(value['location']) || !isRecord(value['media'])) {
    return null;
  }

  const company = value['company'];
  const location = value['location'];
  const coordinates = location['coordinates'];
  const media = value['media'];
  if (!isRecord(coordinates)) return null;

  const pointId = requiredText(value['pointId'], TEXT_LIMITS.id);
  const name = requiredText(value['name'], TEXT_LIMITS.label);
  const companyName = requiredText(company['name'], TEXT_LIMITS.label);
  const department = requiredText(location['department'], TEXT_LIMITS.label);
  const municipality = requiredText(location['municipality'], TEXT_LIMITS.label);
  if (!pointId || !name || !companyName || !department || !municipality) return null;

  return {
    pointId,
    name,
    company: {
      companyId: optionalText(company['companyId'], TEXT_LIMITS.id),
      name: companyName,
      logoUrl: safeUrl(company['logoUrl'])
    },
    pointType: optionalText(value['pointType'], TEXT_LIMITS.label) ?? 'POINT',
    location: {
      department,
      municipality,
      address: optionalText(location['address'], TEXT_LIMITS.address),
      coordinates: {
        lat: coordinate(coordinates['lat'], -90, 90),
        lng: coordinate(coordinates['lng'], -180, 180)
      }
    },
    media: {
      imageUrl: safeUrl(media['imageUrl']),
      mapsUrl: safeUrl(media['mapsUrl'])
    }
  };
}

export function normalizeSavedPointRecord(value: unknown): SavedPointRecordV1 | null {
  if (!isRecord(value) || value['version'] !== SAVED_POINT_SCHEMA_VERSION) return null;
  const pointId = requiredText(value['pointId'], TEXT_LIMITS.id);
  const snapshot = normalizeSavedPointSnapshot(value['snapshot']);
  if (!pointId || !snapshot || snapshot.pointId !== pointId) return null;

  const savedAtValue = typeof value['savedAt'] === 'string' ? value['savedAt'] : '';
  const savedAtTime = Date.parse(savedAtValue);
  if (!Number.isFinite(savedAtTime)) return null;

  return {
    version: SAVED_POINT_SCHEMA_VERSION,
    pointId,
    savedAt: new Date(savedAtTime).toISOString(),
    snapshot
  };
}
