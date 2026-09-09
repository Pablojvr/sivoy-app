import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { RutasService } from './rutas.service';
import { environment } from '../../../environments/environment';
import { SearchFlightsResponseDto, GetUpcomingRoutesResponseDto, SearchRoutesByMunicipalityResponseDto, RouteErrorBodyDto } from './route-api.contracts';

describe('RutasService', () => {
  let service: RutasService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RutasService
      ]
    });
    service = TestBed.inject(RutasService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('searchFlights', () => {
    it('should transport successful response correctly preserving PostgreSQL strings and specific properties', () => {
      const mockResponse: SearchFlightsResponseDto = {
        success: true,
        results: [{
          empresa: 'Empresa A',
          origen_nombre: 'Origen Test',
          origen_tipo: 'Tipo',
          origen_lat: '13.69',
          origen_lng: '-89.21',
          destino_nombre_destino: 'Destino Test',
          destino_tipo: 'Tipo',
          destino_lat: '14.00',
          destino_lng: '-89.00',
          origen_msg: 'msg',
          fecha_llegada: 'Lunes',
          horario_recoleccion: '10am',
          distance: 10,
          opciones_entrega: [
            {
              fecha_llegada: 'Lunes 10',
              horario_recoleccion: '10:00 AM',
              dropoff_date: '2023-10-10',
              dropoff_msg: 'Msg'
            }
          ]
        }]
      };

      const params = {
        origen_municipio: 'A',
        destino_municipio: 'B',
        dropoff_date: '2023-10-10',
        dropoff_time: '10:00',
        origen: 'A',
        destino: 'B',
        origenIsPin: false,
        dropoffDate: '2023-10-10',
        dropoffTime: '10:00'
      };

      service.searchFlights(params).subscribe(res => {
        expect(res.success).toBe(true);
        expect(res.results[0].empresa).toBe('Empresa A');
        expect(res.results[0].origen_lat).toBe('13.69');
        expect(res.results[0].opciones_entrega[0].dropoff_date).toBe('2023-10-10');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/api/search-flights`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(params);
      req.flush(mockResponse);
    });

    it('should catch HTTP error responses via HttpErrorResponse', () => {
      const mockError: RouteErrorBodyDto = { error: 'Database error in search-flights' };
      const params = {
        origen_municipio: 'A',
        destino_municipio: 'B',
        dropoff_date: '2023-10-10',
        dropoff_time: '10:00',
        origen: 'A',
        destino: 'B',
        origenIsPin: false,
        dropoffDate: '2023-10-10',
        dropoffTime: '10:00'
      };

      service.searchFlights(params).subscribe({
        next: () => expect.fail('should have failed with the 500 error'),
        error: (errRes: HttpErrorResponse) => {
          expect(errRes.error.error).toBe('Database error in search-flights');
          expect(errRes.status).toBe(500);
        }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/api/search-flights`);
      req.flush(mockError, { status: 500, statusText: 'Internal Server Error' });
    });
  });

  describe('searchRoutesByMunicipality', () => {
    it('should handle successful response with results', () => {
      const mockResponse: SearchRoutesByMunicipalityResponseDto = {
        success: true,
        origen_msg: 'Msg',
        results: [{
          origen_nombre: 'Origen Test',
          empresa: 'Empresa A',
          destino_nombre: 'Destino Test',
          fecha_llegada: 'Lunes',
          horario_recoleccion: '10am',
          origen_msg: 'Msg',
          opciones: [
            {
              fecha_llegada: 'Lunes 10',
              fecha_llegada_iso: '2023-10-10',
              horario_recoleccion: '10:00 AM'
            }
          ]
        }]
      };

      const params = { origen: 'A', destinos: ['B'], dropoff_date: '2023-10-10', dropoff_time: '10:00' };

      service.searchRoutesByMunicipality(params).subscribe(res => {
        if (res.success) {
          expect(res.results.length).toBe(1);
          expect(res.results[0].empresa).toBe('Empresa A');
        } else {
          expect.fail('Expected success response');
        }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/api/search-routes-by-municipality`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(params);
      req.flush(mockResponse);
    });

    it('should handle false success with empty results', () => {
      const mockResponse: SearchRoutesByMunicipalityResponseDto = {
        success: false,
        origen_msg: 'Not found',
        results: []
      };

      const params = { origen: 'A', destinos: ['B'], dropoff_date: '2023-10-10', dropoff_time: '10:00' };

      service.searchRoutesByMunicipality(params).subscribe(res => {
        if (!res.success) {
          expect(res.origen_msg).toBe('Not found');
          expect(res.results.length).toBe(0);
        } else {
          expect.fail('Expected failure response');
        }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/api/search-routes-by-municipality`);
      expect(req.request.method).toBe('POST');
      req.flush(mockResponse);
    });
  });

  describe('getUpcomingRoutes', () => {
    it('should handle polymorphic responses (scalar)', () => {
      const params = { origen: 'O', destino: 'D', dropoff_date: '2023-10-10', dropoff_time: '10:00' };

      const mockScalarResponse: GetUpcomingRoutesResponseDto = {
        success: true,
        empresa: 'E',
        origen_nombre: 'O',
        origen_msg: 'Msg',
        destino_nombre: 'D',
        opciones: [],
        opciones_entrega: []
      };

      service.getUpcomingRoutes(params).subscribe(res => {
        if (res.success && !('results' in res)) {
           expect(res.destino_nombre).toBe('D');
        } else {
           expect.fail('Expected scalar success response');
        }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/api/get-upcoming-routes`);
      req.flush(mockScalarResponse);
    });

    it('should handle array results', () => {
      const params = { origen: ['O'], destino: ['D'], dropoff_date: '2023-10-10', dropoff_time: '10:00' };
      const mockArrayResponse: GetUpcomingRoutesResponseDto = {
        success: true,
        origen_msg: 'Msg',
        results: [{
          empresa: 'E',
          origen_nombre: 'O',
          origen_msg: 'Msg',
          destino_nombre: 'D',
          opciones: [],
          opciones_entrega: []
        }]
      };

      service.getUpcomingRoutes(params).subscribe(res => {
        if (res.success && 'results' in res) {
           expect(res.results.length).toBe(1);
           expect(res.results[0].destino_nombre).toBe('D');
        } else {
           expect.fail('Expected array success response');
        }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/api/get-upcoming-routes`);
      req.flush(mockArrayResponse);
    });

    it('should transport false success scalar response', () => {
      const params = { origen: 'O', destino: 'D', dropoff_date: '2023-10-10', dropoff_time: '10:00' };
      const mockFailResponse: GetUpcomingRoutesResponseDto = {
        success: false,
        origen_msg: 'No hay rutas'
      };

      service.getUpcomingRoutes(params).subscribe(res => {
        if (!res.success) {
           expect(res.origen_msg).toBe('No hay rutas');
        } else {
           expect.fail('Expected false success response');
        }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/api/get-upcoming-routes`);
      req.flush(mockFailResponse);
    });
  });
});
