import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MobileAppComponent } from './mobile-app.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ToastService } from './core/services/toast.service';
import { MapCapabilityService } from './core/maps/map-capability.service';
import { HomeComponent } from './features/home/home.component';
import { AdminComponent } from './features/admin/admin.component';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { PerfilComponent } from './features/perfil/perfil.component';
import { MapPort } from './core/maps/map.port';
import { MapLifecycleManager } from './core/maps/map-lifecycle.manager';

class MockToastService {
  showInfo() {}
  showError() {}
  showSuccess() {}
}

class MockMapCapabilityService {
  supportsInteractiveMap() { return true; }
}

describe('MobileAppComponent (T30a Characterization)', () => {
  let component: MobileAppComponent;
  let fixture: ComponentFixture<MobileAppComponent>;
  let httpMock: HttpTestingController;

  let geolocationCallback: PositionCallback | null = null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        MobileAppComponent,
        HttpClientTestingModule,
        RouterTestingModule
      ],
      providers: [
        { provide: ToastService, useClass: MockToastService },
        { provide: MapCapabilityService, useClass: MockMapCapabilityService },
      ]
    })
    .overrideComponent(HomeComponent, { set: { template: '' } })
    .overrideComponent(AdminComponent, { set: { template: '' } })
    .overrideComponent(BottomNavComponent, { set: { template: '' } })
    .overrideComponent(PerfilComponent, { set: { template: '' } })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MobileAppComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    const mockGeolocation = {
      getCurrentPosition: (cb: PositionCallback) => {
        geolocationCallback = cb;
      },
      watchPosition: () => 0
    } as unknown as Geolocation;

    Object.defineProperty(window.navigator, 'geolocation', {
      value: mockGeolocation,
      configurable: true
    });
  });

  afterEach(() => {
    if (fixture) {
      fixture.destroy();
    }
    if (httpMock) {
      httpMock.verify();
    }
    vi.useRealTimers();
  });

  // Helper to flush implicit requests triggered by ngOnInit
  const flushInitRequests = () => {
    const reqLoc = httpMock.expectOne(req => req.url.includes('/api/locations'));
    reqLoc.flush([
      { id: 10, nombre_destino: 'Agencia San Miguel', empresa: 'SiVoyExpress', ubicacion: { municipio: 'San Miguel', departamento: 'San Miguel' } }
    ]);

    const reqEmp = httpMock.expectOne(req => req.url.includes('/api/empresas'));
    reqEmp.flush({ success: true, empresas: [{ nombre: 'SiVoyExpress' }] });

    // Explicitly handle the default Nominatim call made in ngOnInit for map center
    const nomReq = httpMock.expectOne(req => req.url.includes('nominatim.openstreetmap.org') && req.urlWithParams.includes('lat=13.69'));
    nomReq.flush({ address: { municipality: 'San Salvador' } });
  };

  it('should initialize and fetch /api/locations and /api/empresas properly', () => {
    fixture.detectChanges(); // Act: Trigger ngOnInit

    // Assert explicit requests via helper
    flushInitRequests();

    // Ensure the shell updated its state meant for handoff to HomeComponent
    expect(component.locations.length).toBe(1);
    expect(component.locations[0].empresa).toBe('SiVoyExpress');
    expect(component.filteredLocations.length).toBe(1);
  });

  it('should trigger Nominatim reverse geocoding when geolocation yields coordinates', () => {
    fixture.detectChanges();
    flushInitRequests();

    // Act: Invoke the captured geolocation callback
    expect(geolocationCallback).toBeTruthy();
    if (geolocationCallback) {
      const mockPosition = {
        coords: { latitude: 13.48, longitude: -88.17, accuracy: 10 } as GeolocationCoordinates,
        timestamp: Date.now()
      } as GeolocationPosition;

      geolocationCallback(mockPosition);

      // Assert: The shell should map the coordinates and trigger Nominatim
      expect(component.userLocation).toEqual({ lat: 13.48, lng: -88.17 });

      const reqNom = httpMock.expectOne(req => req.url.includes('nominatim.openstreetmap.org') && req.urlWithParams.includes('lat=13.48'));
      reqNom.flush({ address: { municipality: 'Usulutan' } });

      // Verify shell updated the user context
      expect(component.userMunicipalityName).toBe('Usulutan');
    }
  });

  it('should clear updateAgencyStatuses interval on destroy', () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges(); // inicializa componente
      const updateSpy = vi.spyOn(component, 'updateAgencyStatuses');

      flushInitRequests(); // flushea requests existentes

      // confirma la primera actualización de estados (al resolverse los requests)
      expect(updateSpy).toHaveBeenCalledTimes(1);
      updateSpy.mockClear();

      // destruye el fixture/componente
      fixture.destroy();

      // avanza 60s
      vi.advanceTimersByTime(60000);

      // prueba que updateAgencyStatuses no vuelve a ejecutarse
      expect(updateSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});

describe('MobileAppComponent.calculateAgencyStatus (T31c)', () => {
  let component: MobileAppComponent;
  let fixture: ComponentFixture<MobileAppComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MobileAppComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: ToastService, useClass: MockToastService },
        { provide: MapCapabilityService, useClass: MockMapCapabilityService }
      ]
    })
    .overrideComponent(HomeComponent, { set: { template: '' } })
    .overrideComponent(AdminComponent, { set: { template: '' } })
    .overrideComponent(BottomNavComponent, { set: { template: '' } })
    .overrideComponent(PerfilComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(MobileAppComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    if (fixture) {
      fixture.destroy();
    }
    vi.useRealTimers();
  });

  it('should return green / Disponible ahora when open with >60 mins left', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2023, 10, 15, 10, 0, 0)); // A Wednesday, 10:00 AM
    const loc = {
      horarios_operativos: [
        { dia_semana: 'Miércoles', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    };
    const status = component.calculateAgencyStatus(loc);
    expect(status.color).toBe('green');
    expect(status.mainText).toBe('Disponible ahora');
  });

  it('should return orange / Cerrará pronto when open with exactly 60 mins left', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2023, 10, 15, 16, 0, 0)); // Wednesday 16:00
    const loc = {
      horarios_operativos: [
        { dia_semana: 'Miércoles', hora_apertura: '08:00', hora_cierre: '17:00' }
      ]
    };
    const status = component.calculateAgencyStatus(loc);
    expect(status.color).toBe('orange');
    expect(status.mainText).toBe('Cerrará pronto');
  });

  it('should return orange / Disponible mañana when currently closed but tomorrow opens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2023, 10, 15, 20, 0, 0)); // Wednesday 20:00 (closed)
    const loc = {
      horarios_operativos: [
        { dia_semana: 'Miércoles', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Jueves', hora_apertura: '09:00', hora_cierre: '16:00' }
      ]
    };
    const status = component.calculateAgencyStatus(loc);
    expect(status.color).toBe('orange');
    expect(status.mainText).toBe('Disponible mañana'); // Matches current contract precisely
  });

  it('should return gray / Horario no disp. when no schedule', () => {
    const loc = { horarios_operativos: [] };
    const status = component.calculateAgencyStatus(loc);
    expect(status.color).toBe('gray');
    expect(status.mainText).toBe('Horario no disp.');
  });
});

describe('MobileAppComponent.onMapHighlightRoute (T31c Characterization)', () => {
  let component: MobileAppComponent;
  let fixture: ComponentFixture<MobileAppComponent>;
  let mockMapPort: Pick<MapPort, 'removeRouteLine' | 'drawRouteLine' | 'fitCoordinates'>;
  let mockMapLifecycle: Pick<MapLifecycleManager<unknown>, 'clearPrimaryMarkers' | 'addPrimaryMarker' | 'getPrimaryEntries' | 'destroy'>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MobileAppComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: ToastService, useClass: MockToastService },
        { provide: MapCapabilityService, useClass: MockMapCapabilityService }
      ]
    })
    .overrideComponent(HomeComponent, { set: { template: '' } })
    .overrideComponent(AdminComponent, { set: { template: '' } })
    .overrideComponent(BottomNavComponent, { set: { template: '' } })
    .overrideComponent(PerfilComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(MobileAppComponent);
    component = fixture.componentInstance;

    mockMapPort = {
      removeRouteLine: vi.fn(),
      drawRouteLine: vi.fn(),
      fitCoordinates: vi.fn()
    };

    mockMapLifecycle = {
      clearPrimaryMarkers: vi.fn(),
      addPrimaryMarker: vi.fn(),
      getPrimaryEntries: vi.fn().mockReturnValue([]),
      destroy: vi.fn()
    };

    Object.defineProperty(component, 'map', { value: mockMapPort, writable: true });
    Object.defineProperty(component, 'mapLifecycle', { value: mockMapLifecycle, writable: true });
  });

  afterEach(() => {
    if (fixture) {
      fixture.destroy();
    }
    vi.useRealTimers();
  });

  it('projects valid origin+destination as exactly two coordinates/primary markers and draws route', () => {
    vi.useFakeTimers();
    const flight = {
      origen_lat: '13.0',
      origen_lng: '-89.0',
      origen_nombre: 'Origen',
      destino_lat: '14.0',
      destino_lng: '-90.0',
      destino_nombre: 'Destino',
      empresa: 'TestEmpresa'
    };

    component.onMapHighlightRoute(flight);

    expect(mockMapLifecycle.clearPrimaryMarkers).toHaveBeenCalled();
    expect(mockMapPort.removeRouteLine).toHaveBeenCalled();

    expect(mockMapLifecycle.addPrimaryMarker).toHaveBeenCalledTimes(2);
    expect(mockMapLifecycle.addPrimaryMarker).toHaveBeenNthCalledWith(1, expect.objectContaining({
      coordinate: { lat: 13.0, lng: -89.0 }
    }));
    expect(mockMapLifecycle.addPrimaryMarker).toHaveBeenNthCalledWith(2, expect.objectContaining({
      coordinate: { lat: 14.0, lng: -90.0 }
    }));

    const expectedCoords = [
      { lat: 13.0, lng: -89.0 },
      { lat: 14.0, lng: -90.0 }
    ];

    expect(mockMapPort.drawRouteLine).toHaveBeenCalledWith(expectedCoords, {
      color: '#F45B78',
      width: 4,
      opacity: 0.9,
      dashArray: [1.2, 1.4]
    });

    vi.advanceTimersByTime(150);
    expect(mockMapPort.fitCoordinates).toHaveBeenCalledWith(expectedCoords, { padding: 50, maxZoom: 15, duration: 850 });
  });

  it('does not draw a two-point route if missing one endpoint', () => {
    const flight = {
      origen_lat: '13.0',
      origen_lng: '-89.0',
      origen_nombre: 'Origen',
      empresa: 'TestEmpresa'
    };

    component.onMapHighlightRoute(flight);

    expect(mockMapLifecycle.addPrimaryMarker).toHaveBeenCalledTimes(1);
    expect(mockMapPort.drawRouteLine).not.toHaveBeenCalled();
  });
});
