import { describe, expect, it } from 'vitest';

import { CatalogPoint, CatalogPointDetail } from './catalog.models';
import { catalogPointToLocation } from './catalog-location.adapter';

const point: CatalogPoint = {
  pointId: 'AG_01',
  company: { companyId: '2', name: 'Pedidos Express', logoUrl: null },
  name: 'AGENCIA CENTRO',
  pointType: 'AGENCIA',
  location: {
    department: 'San Salvador',
    municipality: 'Soyapango',
    address: 'Centro Comercial',
    coordinates: { lat: 13.7, lng: -89.1 }
  },
  media: { imageUrl: '/images/centro.webp', mapsUrl: 'https://maps.example/centro' },
  availability: {
    status: 'OPEN',
    closesAt: '16:00',
    nextOpeningAt: null,
    evaluatedAt: '2026-10-07T10:00:00-06:00',
    timeZone: 'America/El_Salvador'
  },
  schedulePreview: [
    { daysLabel: 'Lunes a viernes', opensAt: '09:00', closesAt: '16:00' }
  ]
};

describe('catalogPointToLocation', () => {
  it('maps canonical identity, company, location, media and live availability', () => {
    expect(catalogPointToLocation(point)).toEqual({
      id: 'AG_01',
      id_destino: 'AG_01',
      catalogPointId: 'AG_01',
      companyId: '2',
      nombre_destino: 'AGENCIA CENTRO',
      empresa: 'Pedidos Express',
      tipo: 'AGENCIA',
      maps_url: 'https://maps.example/centro',
      imagen_referencia: '/images/centro.webp',
      direccion_referencia: 'Centro Comercial',
      ubicacion: {
        departamento: 'San Salvador',
        municipio: 'Soyapango',
        direccion_referencia: 'Centro Comercial',
        lat: 13.7,
        lng: -89.1
      },
      horarios_operativos: [],
      reglas_entrega: [],
      _status: {
        color: 'green',
        mainText: 'Disponible ahora',
        timeText: 'Hasta las 04:00 PM'
      }
    });
  });

  it('maps full detail schedules only when detail has been requested', () => {
    const detail: CatalogPointDetail = {
      ...point,
      schedules: [
        { day: 'Lunes', opensAt: '09:00', closesAt: '16:00' },
        { day: 'Sábado', opensAt: '09:00', closesAt: '13:00' }
      ]
    };

    expect(catalogPointToLocation(detail).horarios_operativos).toEqual([
      { dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' },
      { dia_semana: 'Sábado', hora_apertura: '09:00', hora_cierre: '13:00' }
    ]);
  });

  it('keeps a closed point useful when no next opening is known', () => {
    expect(catalogPointToLocation({
      ...point,
      availability: { ...point.availability, status: 'CLOSED', closesAt: null }
    })._status).toEqual({
      color: 'gray',
      mainText: 'Consulta sus horarios',
      timeText: ''
    });
  });
});
