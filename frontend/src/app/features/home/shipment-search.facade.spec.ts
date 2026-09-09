import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ShipmentSearchFacade } from './shipment-search.facade';
import { RutasService } from '../../core/services/rutas.service';
import { PointRef, MunicipalityRouteSearchCommand, PointRouteSearchCommand } from './shipment-search.models';
import { vi, Mock } from 'vitest';

describe('ShipmentSearchFacade (T26b)', () => {
  let facade: ShipmentSearchFacade;
  let mockService: {
    searchFlights: Mock;
    getUpcomingRoutes: Mock;
  };

  const dummyCommandMunicipality: MunicipalityRouteSearchCommand = {
    origin: { municipio: 'A', departamento: 'B' },
    destination: { municipio: 'C', departamento: 'D' },
    filters: { dropoffDate: '', dropoffTime: '' }
  };

  const dummyPoint: PointRef = { id: '1', name: 'O', company: 'E', type: 'Ag', coordinates: null, municipality: { municipio: '', departamento: '' } };
  const dummyCommandPoint: PointRouteSearchCommand = {
    originPoints: [dummyPoint],
    destinationPoints: [dummyPoint],
    filters: { dropoffDate: '', dropoffTime: '' }
  };

  beforeEach(() => {
    mockService = {
      searchFlights: vi.fn(),
      getUpcomingRoutes: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        ShipmentSearchFacade,
        { provide: RutasService, useValue: mockService }
      ]
    });

    facade = TestBed.inject(ShipmentSearchFacade);
  });

  describe('Initial State and Modifiers', () => {
    it('initializes with correct default state', () => {
      expect(facade.state().status).toBe('initial');
      expect(facade.state().mode).toBe('idle');
      expect(facade.state().results).toEqual([]);
      expect(facade.state().error).toBeNull();
    });

    it('updates origin and recalculates mode', () => {
      facade.setOrigin({ municipality: 'A', department: 'B' });
      expect(facade.state().origin.municipality).toBe('A');
      expect(facade.state().origin.department).toBe('B');
      expect(facade.state().mode).toBe('idle');
    });

    it('updates destination and changes mode to discovery', () => {
      facade.setDestination({ inputValue: 'Dest' });
      expect(facade.state().destination.inputValue).toBe('Dest');
      expect(facade.state().mode).toBe('discovery');
    });

    it('updates filters', () => {
      facade.setFilters('2023-01-01', '10:00');
      expect(facade.state().filters.dropoffDate).toBe('2023-01-01');
      expect(facade.state().filters.dropoffTime).toBe('10:00');
    });

    it('resets completely and cancels requests', () => {
      const subject = new Subject<unknown>();
      mockService.searchFlights.mockReturnValue(subject.asObservable());
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);

      expect(facade.state().status).toBe('loading');
      expect(subject.observed).toBe(true);

      facade.reset();
      expect(facade.state().status).toBe('initial');
      expect(facade.state().mode).toBe('idle');
      expect(subject.observed).toBe(false);
    });
  });

  describe('Search Execution and Adapters', () => {
    it('transitions to loading and parses valid municipality response', () => {
      const validPayload = {
        success: true,
        results: [{
          empresa: 'E', origen_nombre: 'O', destino_nombre_destino: 'D',
          opciones_entrega: [{ fecha_llegada: 'A', horario_recoleccion: 'B', dropoff_date: 'C', dropoff_msg: 'D' }]
        }]
      };
      mockService.searchFlights.mockReturnValue(of(validPayload));

      facade.searchMunicipalityRoutes(dummyCommandMunicipality);
      expect(facade.state().status).toBe('success');
      expect(facade.state().results.length).toBe(1);
      expect(facade.hasResults()).toBe(true);
    });

    it('returns empty with NO_ROUTES when no results found for municipality', () => {
      const validPayload = { success: true, results: [] };
      mockService.searchFlights.mockReturnValue(of(validPayload));
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);

      expect(facade.state().status).toBe('empty');
      expect(facade.state().error?.code).toBe('NO_ROUTES');
    });

    it('transitions to error INVALID_RESPONSE when payload is malformed', () => {
      mockService.searchFlights.mockReturnValue(of({ random: 'data' }));
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);

      expect(facade.state().status).toBe('error');
      expect(facade.state().error?.code).toBe('INVALID_RESPONSE');
    });

    it('does not call HTTP if point command has empty origin or destination', () => {
      facade.searchPointRoutes({ ...dummyCommandPoint, originPoints: [] });
      expect(mockService.getUpcomingRoutes).not.toHaveBeenCalled();
      expect(facade.state().status).toBe('empty');
      expect(facade.state().error?.code).toBe('NO_ROUTES');
    });
  });

  describe('HTTP Errors', () => {
    it('normalizes to SERVER error state', () => {
      mockService.searchFlights.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);
      expect(facade.state().status).toBe('error');
      expect(facade.state().error?.code).toBe('SERVER');
    });

    it('normalizes to NETWORK error state on status 0', () => {
      mockService.searchFlights.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);
      expect(facade.state().status).toBe('error');
      expect(facade.state().error?.code).toBe('NETWORK');
    });

    it('normalizes arbitrary unknown errors to SERVER error state', () => {
      mockService.searchFlights.mockReturnValue(throwError(() => 'some arbitrary error'));
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);
      expect(facade.state().status).toBe('error');
      expect(facade.state().error?.code).toBe('SERVER');
    });
  });

  describe('SwitchMap Cancellations', () => {
    it('cancels previous same-kind request', () => {
      const subject1 = new Subject<unknown>();
      const subject2 = new Subject<unknown>();

      mockService.searchFlights.mockReturnValueOnce(subject1.asObservable());
      mockService.searchFlights.mockReturnValueOnce(subject2.asObservable());

      facade.searchMunicipalityRoutes(dummyCommandMunicipality);
      expect(subject1.observed).toBe(true);

      facade.searchMunicipalityRoutes(dummyCommandMunicipality);
      expect(subject1.observed).toBe(false);
      expect(subject2.observed).toBe(true);
    });

    it('cancels previous cross-kind request', () => {
      const munSubject = new Subject<unknown>();
      const pointSubject = new Subject<unknown>();

      mockService.searchFlights.mockReturnValue(munSubject.asObservable());
      mockService.getUpcomingRoutes.mockReturnValue(pointSubject.asObservable());

      facade.searchMunicipalityRoutes(dummyCommandMunicipality);
      expect(munSubject.observed).toBe(true);

      facade.searchPointRoutes(dummyCommandPoint);
      expect(munSubject.observed).toBe(false);
      expect(pointSubject.observed).toBe(true);
    });
  });

  describe('UI State Modifiers', () => {
    it('toggles route expansion immutably', () => {
      const validPayload = {
        success: true,
        results: [{
          empresa: 'E', origen_nombre: 'O', destino_nombre_destino: 'D',
          opciones_entrega: [{ fecha_llegada: 'A', horario_recoleccion: 'B', dropoff_date: 'C', dropoff_msg: 'D' }]
        }]
      };
      mockService.searchFlights.mockReturnValue(of(validPayload));
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);

      expect(facade.state().results[0].presentation.isExpanded).toBe(false);
      facade.toggleRouteExpansion(0);
      expect(facade.state().results[0].presentation.isExpanded).toBe(true);
      facade.toggleRouteExpansion(0);
      expect(facade.state().results[0].presentation.isExpanded).toBe(false);
    });

    it('ignores toggle expansion if index is out of bounds', () => {
      const validPayload = {
        success: true,
        results: [{
          empresa: 'E', origen_nombre: 'O', destino_nombre_destino: 'D',
          opciones_entrega: [{ fecha_llegada: 'A', horario_recoleccion: 'B', dropoff_date: 'C', dropoff_msg: 'D' }]
        }]
      };
      mockService.searchFlights.mockReturnValue(of(validPayload));
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);

      const prevState = facade.state();
      facade.toggleRouteExpansion(1);
      facade.toggleRouteExpansion(-1);
      expect(facade.state()).toBe(prevState);
    });

    it('selects route option immutably and syncs selectedOption', () => {
      const validPayload = {
        success: true,
        results: [{
          empresa: 'E', origen_nombre: 'O', destino_nombre_destino: 'D',
          opciones_entrega: [
             { fecha_llegada: 'A', horario_recoleccion: 'B', dropoff_date: 'C', dropoff_msg: 'D' },
             { fecha_llegada: 'E', horario_recoleccion: 'F', dropoff_date: 'G', dropoff_msg: 'H' }
          ]
        }]
      };
      mockService.searchFlights.mockReturnValue(of(validPayload));
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);

      expect(facade.state().results[0].presentation.selectedOptionIndex).toBe(0);
      expect(facade.state().results[0].presentation.selectedOption?.arrivalDate).toBe('A');

      facade.selectRouteOption(0, 1);

      expect(facade.state().results[0].presentation.selectedOptionIndex).toBe(1);
      expect(facade.state().results[0].presentation.selectedOption?.arrivalDate).toBe('E');
    });

    it('ignores select option if route or option index is out of bounds or unchanged', () => {
      const validPayload = {
        success: true,
        results: [{
          empresa: 'E', origen_nombre: 'O', destino_nombre_destino: 'D',
          opciones_entrega: [{ fecha_llegada: 'A', horario_recoleccion: 'B', dropoff_date: 'C', dropoff_msg: 'D' }]
        }]
      };
      mockService.searchFlights.mockReturnValue(of(validPayload));
      facade.searchMunicipalityRoutes(dummyCommandMunicipality);

      const prevState = facade.state();

      facade.selectRouteOption(1, 0);
      expect(facade.state()).toBe(prevState);

      facade.selectRouteOption(0, 1);
      expect(facade.state()).toBe(prevState);

      facade.selectRouteOption(0, 0);
      expect(facade.state()).toBe(prevState);
    });
  });
});