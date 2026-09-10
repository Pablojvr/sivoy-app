import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UbicacionesService, LocationData } from './ubicaciones.service';
import { environment } from '../../../environments/environment';

describe('UbicacionesService', () => {
  let service: UbicacionesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UbicacionesService]
    });
    service = TestBed.inject(UbicacionesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch locations via GET and preserve string IDs and mixed coordinates', () => {
    const mockResponse: LocationData[] = [
      {
        id: 'AG_123',
        nombre_destino: 'Agencia String ID',
        ubicacion: {
          lat: '13.123',
          lng: -89.456
        }
      }
    ];

    service.getLocations().subscribe(locations => {
      expect(locations).toBeTruthy();
      expect(locations.length).toBe(1);
      // Ensure preservation without coercion
      expect(locations[0].id).toBe('AG_123');
      expect(locations[0].ubicacion?.lat).toBe('13.123');
      expect(locations[0].ubicacion?.lng).toBe(-89.456);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/locations`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('should preserve an alphanumeric location ID in the update URL', () => {
    const payload = { nombre_destino: 'Agencia actualizada' };

    service.updateLocation('AG_123', payload).subscribe(response => {
      expect(response).toEqual({ success: true });
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/locations/AG_123`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true });
  });
});
