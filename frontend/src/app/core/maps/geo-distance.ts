import { MapCoordinate } from './map.port';

function isValidCoordinate(coord: MapCoordinate): boolean {
  if (coord === null || typeof coord !== 'object') return false;
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lng)) return false;
  if (coord.lat < -90 || coord.lat > 90) return false;
  if (coord.lng < -180 || coord.lng > 180) return false;
  return true;
}

export function calculateDistanceKm(a: MapCoordinate, b: MapCoordinate): number {
  if (!isValidCoordinate(a)) {
    throw new Error('Invalid coordinate: a');
  }
  if (!isValidCoordinate(b)) {
    throw new Error('Invalid coordinate: b');
  }

  const earthRadiusKm = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const haversine = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  const boundedHaversine = Math.min(1, Math.max(0, haversine));
  const centralAngle = 2 * Math.atan2(
    Math.sqrt(boundedHaversine),
    Math.sqrt(1 - boundedHaversine)
  );

  return earthRadiusKm * centralAngle;
}
