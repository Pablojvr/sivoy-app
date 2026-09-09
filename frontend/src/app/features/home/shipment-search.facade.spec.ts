import { TestBed } from '@angular/core/testing';
import { ShipmentSearchFacade } from './shipment-search.facade';
import { RutasService, RouteSearchParams, PointAwareRouteSearchParams } from '../../core/services/rutas.service';
import { of, throwError, Subject, Observable } from 'rxjs';
import { vi } from 'vitest';

class MockRutasService {
  searchFlights = vi.fn((params: RouteSearchParams): Observable<unknown> => of({}));
  getUpcomingRoutes = vi.fn((params: PointAwareRouteSearchParams): Observable<unknown> => of({}));
}

describe('ShipmentSearchFacade', () => {
  let facade: ShipmentSearchFacade;
  let mockService: MockRutasService;

  beforeEach(() => {
    mockService = new MockRutasService();

    TestBed.configureTestingModule({
      providers: [
        ShipmentSearchFacade,
        { provide: RutasService, useValue: mockService }
      ]
    });

    facade = TestBed.inject(ShipmentSearchFacade);
  });

  it('1. Initial: Status is initial, results empty, mode idle', () => {
    expect(facade.status()).toBe('initial');
    expect(facade.mode()).toBe('idle');
    expect(facade.results()).toEqual([]);
  });

  it('2. Loading: Dispatching search commands changes status to loading', () => {
    mockService.searchFlights.mockReturnValue(new Subject<unknown>());
    
    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });
    
    expect(facade.status()).toBe('loading');
  });

  it('3. Municipality Search Success: Command correctly populates results and changes mode using destino_nombre_destino', () => {
    const mockResponse: unknown = {
      success: true,
      flights: [
        {
          origen_nombre: 'Ori',
          destino_nombre_destino: 'Dest',
          opciones_entrega: [{ fecha_llegada: '2023-01-01', horario_recoleccion: '10:00', dropoff_msg: 'Msg' }]
        }
      ]
    };
    mockService.searchFlights.mockReturnValue(of(mockResponse));

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '2023-01-01', dropoffTime: '10:00' }
    });

    expect(facade.status()).toBe('success');
    expect(facade.mode()).toBe('municipality-routes');
    expect(facade.results().length).toBe(1);
    expect(facade.results()[0].originName).toBe('Ori');
    expect(facade.results()[0].destinationName).toBe('Dest');
    expect(facade.results()[0].deliveryOptions[0].arrivalDate).toBe('2023-01-01');
    expect(facade.results()[0].deliveryOptions[0].originSchedule).toBe('10:00');
    expect(facade.results()[0].deliveryOptions[0].destinationMessage).toBe('Msg');

    expect(mockService.searchFlights).toHaveBeenCalledWith({
      origen: 'A, B',
      destino: 'C, D',
      origenIsPin: false,
      dropoffDate: '2023-01-01',
      dropoffTime: '10:00',
      origen_municipio: 'A',
      origen_departamento: 'B',
      destino_municipio: 'C',
      destino_departamento: 'D',
      dropoff_date: '2023-01-01',
      dropoff_time: '10:00'
    });
  });

  it('4. Point Search Success: Command correctly populates results and changes mode using destino_nombre', () => {
    const mockResponse: unknown = {
      success: true,
      results: [
        {
          origen_nombre: 'Ori P',
          destino_nombre: 'Dest P',
          fecha_llegada: '2023-01-02',
          horario_recoleccion: '11:00'
        }
      ]
    };
    mockService.getUpcomingRoutes.mockReturnValue(of(mockResponse));

    facade.searchPointRoutes({
      originNames: ['P1'],
      destinationNames: ['P2'],
      filters: { dropoffDate: '2023-01-01', dropoffTime: '10:00' }
    });

    expect(facade.status()).toBe('success');
    expect(facade.mode()).toBe('point-routes');
    expect(facade.results().length).toBe(1);
    expect(facade.results()[0].originName).toBe('Ori P');
    expect(facade.results()[0].destinationName).toBe('Dest P');
    expect(facade.results()[0].deliveryOptions[0].arrivalDate).toBe('2023-01-02');
    expect(facade.results()[0].deliveryOptions[0].originSchedule).toBe('11:00');

    expect(mockService.getUpcomingRoutes).toHaveBeenCalledWith({
      origen: ['P1'],
      destino: ['P2'],
      dropoff_date: '2023-01-01',
      dropoff_time: '10:00'
    });
  });

  it('5. Empty: Valid empty mock response changes status to empty', () => {
    const mockResponse: unknown = { success: true, flights: [] };
    mockService.searchFlights.mockReturnValue(of(mockResponse));

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    expect(facade.status()).toBe('empty');
    expect(facade.results()).toEqual([]);
  });

  it('6. Error: Failed API call normalizes to user-safe error state', () => {
    mockService.searchFlights.mockReturnValue(throwError(() => new Error('HTTP 500')));

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    expect(facade.status()).toBe('error');
    expect(facade.error()).toBe('Error al comunicarse con el servidor.');
    expect(facade.mode()).toBe('municipality-routes');
  });

  it('7. Selection modes deterministic and invalidate stale state without HTTP', () => {
    facade.setOrigin({ municipality: 'Ori', department: 'Dep' });
    facade.setDestination({ municipality: 'Dest', department: 'Dep' });
    expect(facade.mode()).toBe('discovery');
    expect(facade.status()).toBe('initial');

    facade.setOrigin({ municipality: '', department: '', point: null, inputValue: '' });
    facade.setDestination({ municipality: '', department: '', point: { id: '1', name: 'P', coordinates: null, municipality: { municipio: 'A', departamento: 'B' } }, inputValue: '' });
    expect(facade.mode()).toBe('discovery');

    const mockResponse: unknown = { success: true, flights: [{ origen_nombre: 'Ori', destino_nombre_destino: 'Dest', opciones_entrega: [] }] };
    mockService.searchFlights.mockReturnValue(of(mockResponse));

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });
    expect(facade.status()).toBe('success');
    expect(facade.results().length).toBe(1);

    mockService.searchFlights.mockClear();

    facade.setOrigin({ municipality: 'NewOri' });
    expect(facade.status()).toBe('initial');
    expect(facade.mode()).toBe('discovery');
    expect(facade.results().length).toBe(0);
    expect(facade.error()).toBeNull();
    expect(mockService.searchFlights).not.toHaveBeenCalled();

    facade.setDestination({ municipality: '', department: '', point: null, inputValue: '' });
    expect(facade.mode()).toBe('idle');
  });

  it('8. Invalid Raw Response Normalization: Payload missing expected fields fails gracefully via type guards', () => {
    const mockResponse: unknown = { random: 'data' };
    mockService.searchFlights.mockReturnValue(of(mockResponse));

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    expect(facade.status()).toBe('error');
    expect(facade.error()).toBe('Formato de respuesta inválido.');
  });

  it('9. Invalid route item: Missing origin or destination names fails normalization', () => {
    const mockResponse: unknown = {
      success: true,
      flights: [{ origen_nombre: '', destino_nombre: '', opciones_entrega: [] }]
    };
    mockService.searchFlights.mockReturnValue(of(mockResponse));

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    expect(facade.status()).toBe('error');
    expect(facade.error()).toBe('Formato de respuesta inválido.');
  });

  it('10. Cross-kind Stale Sequence: A municipality request followed by a point request cancels the first', () => {
    const munSubject = new Subject<unknown>();
    const pointSubject = new Subject<unknown>();
    
    mockService.searchFlights.mockReturnValue(munSubject.asObservable());
    mockService.getUpcomingRoutes.mockReturnValue(pointSubject.asObservable());

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    facade.searchPointRoutes({
      originNames: ['P1'],
      destinationNames: ['P2'],
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    munSubject.next({ success: true, flights: [{ origen_nombre: 'Stale', destino_nombre: 'Dest' }] });

    expect(facade.status()).toBe('loading');

    pointSubject.next({ success: true, results: [{ origen_nombre: 'Fresh', destino_nombre: 'Dest' }] });

    expect(facade.status()).toBe('success');
    expect(facade.mode()).toBe('point-routes');
    expect(facade.results()[0].originName).toBe('Fresh');
  });

  it('11. Reset During In-Flight: Dispatching reset() invalidates active requests and restores initial state', () => {
    const munSubject = new Subject<unknown>();
    mockService.searchFlights.mockReturnValue(munSubject.asObservable());

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    expect(facade.status()).toBe('loading');

    facade.reset();

    munSubject.next({ success: true, flights: [{ origen_nombre: 'Stale', destino_nombre: 'Dest' }] });

    expect(facade.status()).toBe('initial');
    expect(facade.mode()).toBe('idle');
  });

  it('12. Repeated Origin Selection: Replaces origin deterministically', () => {
    facade.setOrigin({ municipality: 'A', department: 'B' });
    expect(facade.origin().municipality).toBe('A');

    facade.setOrigin({ municipality: 'X', department: 'Y' });
    expect(facade.origin().municipality).toBe('X');
    expect(facade.origin().department).toBe('Y');
  });

  it('13. Search after reset: Should allow a new search after resetting', () => {
    facade.reset();
    
    const mockResponse: unknown = { success: true, flights: [] };
    mockService.searchFlights.mockReturnValue(of(mockResponse));

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    expect(facade.status()).toBe('empty');
  });

  it('14. Same-kind Stale Sequence: Two municipality requests cancel the first', () => {
    const munSubject1 = new Subject<unknown>();
    const munSubject2 = new Subject<unknown>();
    
    mockService.searchFlights.mockReturnValueOnce(munSubject1.asObservable());
    mockService.searchFlights.mockReturnValueOnce(munSubject2.asObservable());

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    facade.searchMunicipalityRoutes({
      origin: { municipio: 'X', departamento: 'Y' },
      destination: { municipio: 'W', departamento: 'Z' },
      filters: { dropoffDate: '', dropoffTime: '' }
    });

    munSubject1.next({ success: true, flights: [{ origen_nombre: 'Stale', destino_nombre: 'Dest' }] });
    expect(facade.status()).toBe('loading');

    munSubject2.next({ success: true, flights: [{ origen_nombre: 'Fresh', destino_nombre: 'Dest' }] });
    expect(facade.status()).toBe('success');
    expect(facade.results()[0].originName).toBe('Fresh');
  });

  it('15. Search dispatch persists command filters into state', () => {
    facade.searchMunicipalityRoutes({
      origin: { municipio: 'A', departamento: 'B' },
      destination: { municipio: 'C', departamento: 'D' },
      filters: { dropoffDate: '2023-01-01', dropoffTime: '10:00' }
    });
    
    expect(facade.filters().dropoffDate).toBe('2023-01-01');
    expect(facade.filters().dropoffTime).toBe('10:00');
  });
});
