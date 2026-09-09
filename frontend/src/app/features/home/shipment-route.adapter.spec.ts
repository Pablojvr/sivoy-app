import { parseSearchFlightsResponse, parseUpcomingRoutesResponse } from './shipment-route.adapter';
import { PointRef } from './shipment-search.models';

describe('Shipment Route Adapter Validations', () => {
  const originPoints: PointRef[] = [
    { id: '1', name: 'O', company: 'E', type: 'Ag', coordinates: { lat: 10, lng: 10 }, municipality: { municipio: '', departamento: '' } }
  ];
  const destPoints: PointRef[] = [
    { id: '2', name: 'D', company: 'E', type: 'Ca', coordinates: { lat: 20, lng: 20 }, municipality: { municipio: '', departamento: '' } }
  ];

  describe('parseSearchFlightsResponse', () => {
    it('returns INVALID_RESPONSE for non-objects', () => {
      expect(parseSearchFlightsResponse(null)).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
      expect(parseSearchFlightsResponse("")).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
    });

    it('returns NO_ROUTES if success is false', () => {
      expect(parseSearchFlightsResponse({ success: false })).toEqual({ ok: false, error: 'NO_ROUTES' });
    });

    it('returns INVALID_RESPONSE if success is missing or not boolean', () => {
      expect(parseSearchFlightsResponse({})).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
      expect(parseSearchFlightsResponse({ success: 'true' })).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
    });

    it('returns INVALID_RESPONSE if results is missing or not an array', () => {
      expect(parseSearchFlightsResponse({ success: true, results: {} })).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
      expect(parseSearchFlightsResponse({ success: true })).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
    });

    it('returns INVALID_RESPONSE if results array has bad structure', () => {
      expect(parseSearchFlightsResponse({ success: true, results: [{ missing: 'empresa' }] })).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
    });

    it('validates options arrays', () => {
      const payload = {
        success: true,
        results: [{ empresa: 'E', origen_nombre: 'O', destino_nombre_destino: 'D', opciones_entrega: [{ missing: 'fields' }] }]
      };
      expect(parseSearchFlightsResponse(payload)).toEqual({ ok: false, error: 'INVALID_RESPONSE' });

      const payloadEmpty = {
        success: true,
        results: [{ empresa: 'E', origen_nombre: 'O', destino_nombre_destino: 'D', opciones_entrega: [] }]
      };
      expect(parseSearchFlightsResponse(payloadEmpty)).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
    });

    it('parses valid payload successfully with options', () => {
      const payload = {
        success: true,
        results: [{
          empresa: 'E', origen_nombre: 'O', destino_nombre_destino: 'D',
          opciones_entrega: [{ fecha_llegada: 'A', horario_recoleccion: 'B', dropoff_date: 'C', dropoff_msg: 'D' }]
        }]
      };
      const res = parseSearchFlightsResponse(payload);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.items.length).toBe(1);
        expect(res.items[0].route.options.length).toBe(1);
        expect(res.items[0].route.company).toBe('E');
      }
    });
  });

  describe('parseUpcomingRoutesResponse', () => {
    it('returns INVALID_RESPONSE for non-objects', () => {
      expect(parseUpcomingRoutesResponse(null, [], [])).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
    });

    it('returns NO_ROUTES if success is false', () => {
      expect(parseUpcomingRoutesResponse({ success: false }, [], [])).toEqual({ ok: false, error: 'NO_ROUTES' });
    });

    it('returns INVALID_RESPONSE if format is unknown (no results array and no valid root object)', () => {
      expect(parseUpcomingRoutesResponse({ success: true }, [], [])).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
    });

    it('parses singular root object successfully with point matching and fallback null', () => {
      const payload = {
        success: true,
        empresa: 'E',
        origen_nombre: 'O',
        destino_nombre: 'D',
        opciones: [{ fecha_llegada: 'Hoy', horario_recoleccion: 'Tarde' }]
      };
      const res = parseUpcomingRoutesResponse(payload, originPoints, destPoints);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.items.length).toBe(1);
        expect(res.items[0].route.origin.type).toBe('Ag');
        expect(res.items[0].route.origin.coordinates).toEqual({ lat: 10, lng: 10 });
        expect(res.items[0].route.destination.type).toBe('Ca');
        expect(res.items[0].route.destination.coordinates).toEqual({ lat: 20, lng: 20 });
      }
    });

    it('parses results array successfully and falls back to null coordinates on mismatch', () => {
      const payload = {
        success: true,
        results: [{
          empresa: 'Unknown',
          origen_nombre: 'O',
          destino_nombre: 'D',
          opciones_entrega: [{ fecha_llegada: 'A', horario_recoleccion: 'B', dropoff_date: 'C', dropoff_msg: 'D' }]
        }]
      };
      const res = parseUpcomingRoutesResponse(payload, originPoints, destPoints);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.items[0].route.origin.coordinates).toBeNull();
        expect(res.items[0].route.origin.type).toBeNull();
      }
    });

    it('returns INVALID_RESPONSE if option is malformed', () => {
      const payload = {
        success: true,
        results: [{
          empresa: 'Unknown',
          origen_nombre: 'O',
          destino_nombre: 'D',
          opciones: [{ fecha_llegada: 'A' }] // missing horario_recoleccion
        }]
      };
      expect(parseUpcomingRoutesResponse(payload, originPoints, destPoints)).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
    });

    it('returns INVALID_RESPONSE if route has no options', () => {
      const payload = {
        success: true,
        results: [{
          empresa: 'Unknown',
          origen_nombre: 'O',
          destino_nombre: 'D',
          opciones: []
        }]
      };
      expect(parseUpcomingRoutesResponse(payload, originPoints, destPoints)).toEqual({ ok: false, error: 'INVALID_RESPONSE' });
    });
  });
});