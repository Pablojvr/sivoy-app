import {
  classifyPlaceCatalogMatch,
  haversineDistanceKm,
  isValidGeoCoordinate,
  normalizePlaceSearchText,
  projectByDistance
} from './place-destination-fallback';

describe('place destination fallback contract', () => {
  describe('normalizePlaceSearchText', () => {
    it('normalizes accents, casing and repeated whitespace', () => {
      expect(normalizePlaceSearchText('  PARQUE   San\u00a0Martín  ')).toBe('parque san martin');
    });

    it('returns an empty string for non-text values', () => {
      expect(normalizePlaceSearchText(null)).toBe('');
      expect(normalizePlaceSearchText(42)).toBe('');
    });
  });

  describe('classifyPlaceCatalogMatch', () => {
    it('classifies exact, prefix and complete-word matches deterministically', () => {
      expect(classifyPlaceCatalogMatch('Parque San Martín', 'parque san martin')).toBe('exact');
      expect(classifyPlaceCatalogMatch('Parque San Martín', 'Parque San')).toBe('prefix');
      expect(classifyPlaceCatalogMatch('Parque San Martín', 'San Martín')).toBe('words');
    });

    it('does not promote partial or empty words to a strong match', () => {
      expect(classifyPlaceCatalogMatch('Parque San Martín', 'san mar')).toBe('none');
      expect(classifyPlaceCatalogMatch('Parque San Martín', '')).toBe('none');
    });
  });

  describe('isValidGeoCoordinate', () => {
    it('accepts finite latitude and longitude values at their limits', () => {
      expect(isValidGeoCoordinate({ lat: -90, lng: -180 })).toBe(true);
      expect(isValidGeoCoordinate({ lat: 90, lng: 180 })).toBe(true);
    });

    it('rejects non-finite, out-of-range and coerced coordinates', () => {
      expect(isValidGeoCoordinate({ lat: Number.NaN, lng: 0 })).toBe(false);
      expect(isValidGeoCoordinate({ lat: 0, lng: Number.POSITIVE_INFINITY })).toBe(false);
      expect(isValidGeoCoordinate({ lat: 90.01, lng: 0 })).toBe(false);
      expect(isValidGeoCoordinate({ lat: 0, lng: -180.01 })).toBe(false);
      expect(isValidGeoCoordinate({ lat: '13.7', lng: -89.2 })).toBe(false);
      expect(isValidGeoCoordinate(null)).toBe(false);
    });
  });

  describe('haversineDistanceKm', () => {
    it('calculates the geodesic distance in kilometres', () => {
      const distance = haversineDistanceKm(
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 }
      );

      expect(distance).not.toBeNull();
      expect(distance as number).toBeCloseTo(111.195, 3);
    });

    it('returns null when either endpoint is invalid', () => {
      expect(haversineDistanceKm(
        { lat: 91, lng: 0 },
        { lat: 0, lng: 0 }
      )).toBeNull();
    });
  });

  describe('projectByDistance', () => {
    it('sorts measurable points by distance, keeps ties stable and puts unmeasurable points last', () => {
      const points = [
        { id: 'far', coordinate: { lat: 0, lng: 2 } },
        { id: 'unknown', coordinate: null },
        { id: 'near-first', coordinate: { lat: 0, lng: 1 } },
        { id: 'near-second', coordinate: { lat: 0, lng: -1 } }
      ] as const;
      const originalOrder = [...points];

      const result = projectByDistance(points, { lat: 0, lng: 0 }, point => point.coordinate);

      expect(result.map(entry => entry.item.id)).toEqual([
        'near-first',
        'near-second',
        'far',
        'unknown'
      ]);
      expect(result.map(entry => entry.distanceKm === null)).toEqual([false, false, false, true]);
      expect(points).toEqual(originalOrder);
      expect(result[0].item).toBe(points[2]);
    });

    it('preserves input order when the reference coordinate is invalid', () => {
      const points = [{ id: 'a' }, { id: 'b' }];

      const result = projectByDistance(points, { lat: 100, lng: 0 }, () => ({ lat: 0, lng: 0 }));

      expect(result.map(entry => entry.item.id)).toEqual(['a', 'b']);
      expect(result.every(entry => entry.distanceKm === null)).toBe(true);
    });
  });
});
