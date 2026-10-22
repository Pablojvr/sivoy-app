import { CatalogPoint } from '../models/catalog.models';
import {
  catalogPointToSavedSnapshot,
  legacyLocationToSavedSnapshot
} from './saved-point-snapshot.adapter';

describe('saved point snapshot adapters', () => {
  it('maps a catalog point without carrying availability or schedules', () => {
    const point: CatalogPoint = {
      pointId: 'AG_01',
      company: { companyId: 'PE', name: 'Pedidos Express', logoUrl: null },
      name: 'Agencia Centro',
      pointType: 'AGENCY',
      location: {
        department: 'San Salvador',
        municipality: 'San Salvador',
        address: 'Centro Histórico',
        coordinates: { lat: 13.69, lng: -89.21 }
      },
      media: { imageUrl: 'https://example.com/point.webp', mapsUrl: null },
      availability: {
        status: 'OPEN',
        closesAt: '17:00',
        nextOpeningAt: null,
        evaluatedAt: '2026-10-18T12:00:00-06:00',
        timeZone: 'America/El_Salvador'
      },
      schedulePreview: []
    };

    expect(catalogPointToSavedSnapshot(point)).toEqual({
      pointId: 'AG_01',
      name: 'Agencia Centro',
      company: { companyId: 'PE', name: 'Pedidos Express', logoUrl: null },
      pointType: 'AGENCY',
      location: {
        department: 'San Salvador',
        municipality: 'San Salvador',
        address: 'Centro Histórico',
        coordinates: { lat: 13.69, lng: -89.21 }
      },
      media: { imageUrl: 'https://example.com/point.webp', mapsUrl: null }
    });
  });

  it('maps the legacy public card shape and normalizes numeric coordinates', () => {
    expect(legacyLocationToSavedSnapshot({
      id_destino: 42,
      companyId: 'PE',
      nombre_destino: 'Agencia Norte',
      empresa: 'Pedidos Express',
      tipo: 'AGENCIA',
      imagen_referencia: 'https://example.com/norte.webp',
      maps_url: 'https://maps.google.com/example',
      direccion_referencia: 'Frente al parque',
      ubicacion: {
        departamento: 'San Salvador',
        municipio: 'Aguilares',
        lat: '13.95',
        lng: '-89.19'
      },
      _status: { mainText: 'Disponible' },
      horarios_operativos: [{ dia_semana: 'Lunes' }]
    })).toEqual(expect.objectContaining({
      pointId: '42',
      name: 'Agencia Norte',
      company: expect.objectContaining({ name: 'Pedidos Express' }),
      location: expect.objectContaining({
        municipality: 'Aguilares',
        coordinates: { lat: 13.95, lng: -89.19 }
      })
    }));
  });

  it('rejects an incomplete legacy shape instead of persisting unsafe data', () => {
    expect(legacyLocationToSavedSnapshot({ empresa: 'Pedidos Express' })).toBeNull();
    expect(legacyLocationToSavedSnapshot(null)).toBeNull();
  });
});
