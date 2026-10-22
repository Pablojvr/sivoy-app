import { presentSearchRoute, pointRefFromLocation } from './route-result.presenter';
import { SearchRouteItem } from '../shipment-search.models';

describe('presentSearchRoute', () => {
  const originalItem: SearchRouteItem = {
    route: {
      company: 'TestCompany',
      origin: { name: 'Origin', type: 'Agencia', coordinates: { lat: 10, lng: 20 } },
      destination: { name: 'Dest', type: 'Punto', coordinates: { lat: 30, lng: 40 } },
      originMessage: 'Open late',
      options: [
        { arrivalDate: 'Lunes', arrivalDateIso: '2023-01-01', collectionSchedule: 'Mañana', dropoffDate: '2023-01-01', dropoffMessage: 'msg1' },
        { arrivalDate: 'Martes', arrivalDateIso: '2023-01-02', collectionSchedule: 'Tarde', dropoffDate: '2023-01-02', dropoffMessage: 'msg2' }
      ]
    },
    presentation: {
      selectedOptionIndex: 0,
      selectedOption: null,
      hasClosedAlert: false,
      isExpanded: false
    }
  };

  it('maps fields correctly including coords and source indices', () => {
    const filteredItem: SearchRouteItem = {
      ...originalItem,
      route: {
        ...originalItem.route,
        options: [ originalItem.route.options[1] ]
      },
      presentation: {
        ...originalItem.presentation,
        selectedOptionIndex: 0,
        selectedOption: originalItem.route.options[1],
        hasClosedAlert: true,
        isExpanded: true
      }
    };

    const result = presentSearchRoute(filteredItem, 5, originalItem);

    expect(result.empresa).toBe('TestCompany');
    expect(result.origen_nombre).toBe('Origin');
    expect(result.origen_tipo).toBe('Agencia');
    expect(result.origen_lat).toBe(10);
    expect(result.origen_lng).toBe(20);
    expect(result.destino_nombre).toBe('Dest');
    expect(result.destino_tipo).toBe('Punto');
    expect(result.destino_lat).toBe(30);
    expect(result.destino_lng).toBe(40);
    expect(result.origen_msg).toBe('Open late');
    expect(result.hasClosedAlert).toBe(true);
    expect(result.isExpanded).toBe(true);
    expect(result.sourceRouteIndex).toBe(5);
    expect(result.distance).toBe(0);

    expect(result.opciones_entrega?.length).toBe(1);
    expect(result.opciones_entrega?.[0].fecha_llegada).toBe('Martes');
    expect(result.opciones_entrega?.[0].fecha_llegada_iso).toBe('2023-01-02');
    expect(result.opciones_entrega?.[0].sourceOptionIndex).toBe(1);

    expect(result.selected_opcion_idx).toBe(0);
    expect(result.fecha_llegada).toBe('Martes');
    expect(result.selectedOption?.sourceOptionIndex).toBe(1);
  });

  it('omits sourceOptionIndex if indexOf is -1', () => {
    const fakeItem = { ...originalItem, route: { ...originalItem.route, options: [{
      arrivalDate: 'X', arrivalDateIso: null, collectionSchedule: '', dropoffDate: null, dropoffMessage: null
    }] } };
    const result = presentSearchRoute(fakeItem, 2, originalItem);
    expect(result.opciones_entrega?.[0].sourceOptionIndex).toBeUndefined();
  });
});

describe('pointRefFromLocation', () => {
  it('returns null for non-objects or null', () => {
    expect(pointRefFromLocation(null)).toBeNull();
    expect(pointRefFromLocation(undefined)).toBeNull();
    expect(pointRefFromLocation(123)).toBeNull();
    expect(pointRefFromLocation([])).toBeNull();
  });

  it('returns null if company or name is missing', () => {
    expect(pointRefFromLocation({ nombre_destino: 'A' })).toBeNull();
    expect(pointRefFromLocation({ empresa: 'B' })).toBeNull();
  });

  it('maps all names correctly and uses id fallback', () => {
    expect(pointRefFromLocation({ nombre_destino: 'A', empresa: 'C' })?.name).toBe('A');
    expect(pointRefFromLocation({ destino_nombre: 'B', empresa: 'C' })?.name).toBe('B');
    expect(pointRefFromLocation({ destino_nombre_destino: 'D', empresa: 'C' })?.name).toBe('D');

    // Check ID fallback to name
    expect(pointRefFromLocation({ nombre_destino: 'A', empresa: 'C' })?.id).toBe('A');
    expect(pointRefFromLocation({ nombre_destino: 'A', empresa: 'C', id_destino: '1' })?.id).toBe('1');
  });

  it('handles full valid object with coordinates and municipality', () => {
    const loc = {
      nombre_destino: 'Agency',
      empresa: 'CA',
      tipo: 'Agencia',
      ubicacion: {
        lat: 1.2,
        lng: '3.4',
        municipio: 'Mun',
        departamento: 'Dep'
      }
    };
    const res = pointRefFromLocation(loc);
    expect(res).toEqual({
      id: 'Agency',
      name: 'Agency',
      company: 'CA',
      type: 'Agencia',
      coordinates: { lat: 1.2, lng: '3.4' },
      municipality: { municipio: 'Mun', departamento: 'Dep' }
    });
  });

  it('handles missing coordinates or missing municipality properties smoothly', () => {
    const loc = {
      nombre_destino: 'Agency',
      empresa: 'CA',
      ubicacion: {
        lat: 1.2
      }
    };
    const res = pointRefFromLocation(loc);
    expect(res?.coordinates).toBeNull();
    expect(res?.municipality).toEqual({ municipio: '', departamento: '' });
  });
});