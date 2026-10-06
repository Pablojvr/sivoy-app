import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UserGeolocationService, WINDOW } from './user-geolocation.service';

describe('UserGeolocationService', () => {
  let service: UserGeolocationService;
  let httpMock: HttpTestingController;
  let mockWindow: Partial<Window>;

  beforeEach(() => {
    mockWindow = {
      navigator: {
        geolocation: {
          getCurrentPosition: (successFn: PositionCallback, errorFn?: PositionErrorCallback, options?: PositionOptions) => {}
        }
      } as unknown as Navigator
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        UserGeolocationService,
        { provide: WINDOW, useValue: mockWindow }
      ]
    });
    service = TestBed.inject(UserGeolocationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getCurrentPosition', () => {
    it('should pass default options if none provided', () => {
      let capturedOptions: PositionOptions | undefined;
      mockWindow.navigator!.geolocation.getCurrentPosition = (successFn: PositionCallback, errorFn?: PositionErrorCallback, options?: PositionOptions) => {
        capturedOptions = options;
      };
      service.getCurrentPosition().subscribe();
      expect(capturedOptions).toEqual({ timeout: 15000, maximumAge: 60000, enableHighAccuracy: false });
    });

    it('should pass override options if provided', () => {
      let capturedOptions: PositionOptions | undefined;
      mockWindow.navigator!.geolocation.getCurrentPosition = (successFn: PositionCallback, errorFn?: PositionErrorCallback, options?: PositionOptions) => {
        capturedOptions = options;
      };
      service.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0 }).subscribe();
      expect(capturedOptions).toEqual({ timeout: 15000, enableHighAccuracy: true, maximumAge: 0 });
    });

    it('should complete with coords when geolocation is successful', () => {
      let resultCoords: {lat: number, lng: number} | undefined;
      let isCompleted = false;

      mockWindow.navigator!.geolocation.getCurrentPosition = (successFn: PositionCallback) => {
        successFn({ coords: { latitude: 10, longitude: -20 } } as GeolocationPosition);
      };

      service.getCurrentPosition().subscribe({
        next: coords => resultCoords = coords,
        complete: () => isCompleted = true
      });

      expect(resultCoords).toEqual({ lat: 10, lng: -20 });
      expect(isCompleted).toBe(true);
    });

    it('should error when geolocation fails', () => {
      let resultError: unknown;

      mockWindow.navigator!.geolocation.getCurrentPosition = (successFn: PositionCallback, errorFn?: PositionErrorCallback) => {
        if (errorFn) errorFn({ code: 1, message: 'Denied' } as GeolocationPositionError);
      };

      service.getCurrentPosition().subscribe({
        error: err => resultError = err
      });

      expect(resultError).toEqual({ code: 1, message: 'Denied' });
    });

    it('should error safely when geolocation is missing', () => {
      let resultError: unknown;

      Object.defineProperty(mockWindow, 'navigator', { value: {}, writable: true }); // missing geolocation

      service.getCurrentPosition().subscribe({
        error: err => resultError = err
      });

      expect(resultError).toBeInstanceOf(Error);
      expect((resultError as Error).message).toBe('Geolocation is not supported by this browser.');
    });

    it('should not emit if unsubscribed early', () => {
      let emitCount = 0;
      let successCallback: PositionCallback | undefined;

      mockWindow.navigator!.geolocation.getCurrentPosition = (successFn: PositionCallback) => {
        successCallback = successFn;
      };

      const sub = service.getCurrentPosition().subscribe(() => emitCount++);

      sub.unsubscribe();

      if (successCallback) {
        successCallback({ coords: { latitude: 10, longitude: -20 } } as GeolocationPosition);
      }

      expect(emitCount).toBe(0);
    });
  });

  describe('reverseGeocode', () => {
    it('should make an HTTP GET to Nominatim', () => {
      service.reverseGeocode(13.69, -89.21).subscribe(res => {
        expect(res.address?.city).toBe('San Salvador');
      });

      const req = httpMock.expectOne('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=13.69&lon=-89.21');
      expect(req.request.method).toBe('GET');
      req.flush({ address: { city: 'San Salvador' } });
    });
  });
});
