import { calculateDistanceKm } from './geo-distance';
import { MapCoordinate } from './map.port';

describe('calculateDistanceKm', () => {
  it('should return 0 for identical coordinates', () => {
    const a = { lat: 13.69, lng: -89.21 };
    expect(calculateDistanceKm(a, a)).toBe(0);
  });

  it('should calculate known distance with reasonable tolerance', () => {
    // San Salvador to Santa Ana approx
    const sanSalvador = { lat: 13.6929, lng: -89.2182 };
    const santaAna = { lat: 13.9942, lng: -89.5597 };
    const dist = calculateDistanceKm(sanSalvador, santaAna);
    // Approx 50.1 km
    expect(dist).toBeGreaterThan(48);
    expect(dist).toBeLessThan(52);
  });

  it('should be symmetric', () => {
    const a = { lat: 13.69, lng: -89.21 };
    const b = { lat: 13.99, lng: -89.55 };
    expect(calculateDistanceKm(a, b)).toBeCloseTo(calculateDistanceKm(b, a), 5);
  });

  it('should handle negative coordinates', () => {
    const a = { lat: -34.6037, lng: -58.3816 }; // Buenos Aires
    const b = { lat: -33.4489, lng: -70.6693 }; // Santiago
    const dist = calculateDistanceKm(a, b);
    expect(dist).toBeGreaterThan(1100);
    expect(dist).toBeLessThan(1200);
  });

  it('should remain stable for antipodal coordinates', () => {
    expect(calculateDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }))
      .toBeCloseTo(Math.PI * 6371, 6);
  });

  it('should throw explicit error for non-finite coordinates', () => {
    expect(() => calculateDistanceKm({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 })).toThrow('Invalid coordinate: a');
    expect(() => calculateDistanceKm({ lat: 0, lng: Infinity }, { lat: 0, lng: 0 })).toThrow('Invalid coordinate: a');
    expect(() => calculateDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: NaN })).toThrow('Invalid coordinate: b');
  });

  it('should throw explicit error for coordinates out of range', () => {
    expect(() => calculateDistanceKm({ lat: 91, lng: 0 }, { lat: 0, lng: 0 })).toThrow('Invalid coordinate: a');
    expect(() => calculateDistanceKm({ lat: -91, lng: 0 }, { lat: 0, lng: 0 })).toThrow('Invalid coordinate: a');
    expect(() => calculateDistanceKm({ lat: 0, lng: 181 }, { lat: 0, lng: 0 })).toThrow('Invalid coordinate: a');
    expect(() => calculateDistanceKm({ lat: 0, lng: -181 }, { lat: 0, lng: 0 })).toThrow('Invalid coordinate: a');
  });

  it('should throw explicit error for null or missing properties', () => {
    expect(() => calculateDistanceKm(null as unknown as MapCoordinate, { lat: 0, lng: 0 })).toThrow('Invalid coordinate: a');
    expect(() => calculateDistanceKm({ lat: 0 } as unknown as MapCoordinate, { lat: 0, lng: 0 })).toThrow('Invalid coordinate: a');
  });
});
