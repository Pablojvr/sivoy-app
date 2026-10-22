export type PlaceCatalogMatchStrength = 'exact' | 'prefix' | 'words' | 'none';

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

export interface DistanceProjection<T> {
  item: T;
  distanceKm: number | null;
  sourceIndex: number;
}

const EARTH_RADIUS_KM = 6371.0088;

export function normalizePlaceSearchText(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyPlaceCatalogMatch(
  candidate: unknown,
  query: unknown
): PlaceCatalogMatchStrength {
  const normalizedCandidate = normalizePlaceSearchText(candidate);
  const normalizedQuery = normalizePlaceSearchText(query);
  if (!normalizedCandidate || !normalizedQuery) return 'none';

  if (normalizedCandidate === normalizedQuery) return 'exact';
  if (normalizedCandidate.startsWith(normalizedQuery)) return 'prefix';

  const candidateWords = new Set(extractWords(normalizedCandidate));
  const queryWords = extractWords(normalizedQuery);
  if (queryWords.length > 0 && queryWords.every(word => candidateWords.has(word))) {
    return 'words';
  }

  return 'none';
}

export function isValidGeoCoordinate(value: unknown): value is GeoCoordinate {
  if (typeof value !== 'object' || value === null) return false;

  const coordinate = value as Partial<GeoCoordinate>;
  return typeof coordinate.lat === 'number'
    && Number.isFinite(coordinate.lat)
    && coordinate.lat >= -90
    && coordinate.lat <= 90
    && typeof coordinate.lng === 'number'
    && Number.isFinite(coordinate.lng)
    && coordinate.lng >= -180
    && coordinate.lng <= 180;
}

export function haversineDistanceKm(
  from: unknown,
  to: unknown
): number | null {
  if (!isValidGeoCoordinate(from) || !isValidGeoCoordinate(to)) return null;

  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);

  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude)
      * Math.cos(toLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return EARTH_RADIUS_KM * centralAngle;
}

export function projectByDistance<T>(
  items: readonly T[],
  reference: unknown,
  getCoordinate: (item: T) => unknown
): DistanceProjection<T>[] {
  return items
    .map((item, sourceIndex): DistanceProjection<T> => ({
      item,
      distanceKm: haversineDistanceKm(reference, getCoordinate(item)),
      sourceIndex
    }))
    .sort((left, right) => {
      if (left.distanceKm === null && right.distanceKm === null) {
        return left.sourceIndex - right.sourceIndex;
      }
      if (left.distanceKm === null) return 1;
      if (right.distanceKm === null) return -1;

      return left.distanceKm - right.distanceKm
        || left.sourceIndex - right.sourceIndex;
    });
}

function extractWords(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu) || [];
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}
