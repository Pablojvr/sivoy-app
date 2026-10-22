import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MobileAppComponent, resolveMainTab, sanitizeNavigationIntent } from './mobile-app.component';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { ToastService } from './core/services/toast.service';
import { MapCapabilityService } from './core/maps/map-capability.service';
import { HomeComponent } from './features/home/home.component';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { SavedPointsComponent } from './features/saved-points/saved-points.component';
import { MapPort } from './core/maps/map.port';
import { MapLifecycleManager } from './core/maps/map-lifecycle.manager';
import { Subject, BehaviorSubject } from 'rxjs';
import { CatalogService } from './core/services/catalog.service';

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
    .overrideComponent(BottomNavComponent, { set: { template: '' } })
    .overrideComponent(SavedPointsComponent, { set: { template: '' } })
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
    const reqLoc = httpMock.expectOne(req => req.url.includes('/api/catalog/points'));
    reqLoc.flush({
      data: [{
        pointId: 'AG_10',
        company: { companyId: '1', name: 'SiVoyExpress', logoUrl: null },
        name: 'Agencia San Miguel',
        pointType: 'AGENCIA',
        location: { department: 'San Miguel', municipality: 'San Miguel', address: null, coordinates: { lat: null, lng: null } },
        media: { imageUrl: null, mapsUrl: null },
        availability: { status: 'CLOSED', closesAt: null, nextOpeningAt: null, evaluatedAt: '2026-10-07T10:00:00-06:00', timeZone: 'America/El_Salvador' },
        schedulePreview: []
      }],
      page: { limit: 50, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:1' }
    });

    // Explicitly handle the default Nominatim call made in ngOnInit for map center
    const nomReq = httpMock.expectOne(req => req.url.includes('nominatim.openstreetmap.org') && req.urlWithParams.includes('lat=13.69'));
    nomReq.flush({ address: { municipality: 'San Salvador' } });
  };

  it('should initialize from one bounded catalog page without /api/locations', () => {
    fixture.detectChanges(); // Act: Trigger ngOnInit

    // Assert explicit requests via helper
    flushInitRequests();

    httpMock.expectNone(req => req.url.includes('/api/empresas'));
    httpMock.expectNone(req => req.url.includes('/api/locations'));

    // Ensure the shell updated its state meant for handoff to HomeComponent
    expect(component.locations.length).toBe(1);
    expect(component.locations[0].empresa).toBe('SiVoyExpress');
    expect(component.locations[0].catalogAvailability.status).toBe('CLOSED');
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
      expect(component.hasPreciseUserLocation).toBe(true);

      const reqNom = httpMock.expectOne(req => req.url.includes('nominatim.openstreetmap.org') && req.urlWithParams.includes('lat=13.48'));
      reqNom.flush({ address: { municipality: 'Usulutan' } });

      // Verify shell updated the user context
      expect(component.userMunicipalityName).toBe('Usulutan');
    }
  });

  it('keeps the map fallback separate from a precise user location', () => {
    fixture.detectChanges();
    flushInitRequests();

    expect(component.userLocation).toEqual({ lat: 13.69, lng: -89.21 });
    expect(component.hasPreciseUserLocation).toBe(false);
  });

  it('writes one typed filter transition to the current URL', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onPointFiltersChange({ disponibilidad: 'cierra-pronto', horario: 'extendido' });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { orden: null, disponibilidad: 'cierra-pronto', horario: 'extendido' },
      queryParamsHandling: 'merge'
    }));
  });

  it('writes a changed destination municipality to the durable URL and clears stale place intent', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onDestinationMunicipalityChange({ municipio: 'Santa Tecla', departamento: 'La Libertad' });

    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({
        municipio: 'Santa Tecla',
        departamento: 'La Libertad',
        referencia: null,
        refLat: null,
        refLng: null,
        punto: null,
        accion: null
      }),
      queryParamsHandling: 'merge'
    }));
  });

  it('should not start the legacy status interval for server-evaluated catalog availability', () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      const updateSpy = vi.spyOn(component, 'updateAgencyStatuses');

      flushInitRequests();
      fixture.destroy();
      vi.advanceTimersByTime(60000);

      expect(updateSpy).not.toHaveBeenCalled();
      expect((component as any).statusesIntervalId).toBeNull();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('should unsubscribe from a pending catalog request on destroy', () => {
    const locationsSubject = new Subject<any>();
    const catalogService = TestBed.inject(CatalogService);
    vi.spyOn(catalogService, 'listPoints').mockReturnValue(locationsSubject.asObservable());

    fixture.detectChanges();

    const nomReq = httpMock.expectOne(req => req.url.includes('nominatim.openstreetmap.org'));
    nomReq.flush({ address: { municipality: 'San Salvador' } });

    expect(locationsSubject.observed).toBe(true);

    fixture.destroy();

    expect(locationsSubject.observed).toBe(false);
    locationsSubject.next({ data: [], page: { limit: 50, hasMore: false, nextCursor: null }, meta: { catalogRevision: 'catalog:1' } });
    expect(component.locations).toEqual([]);
    expect((component as any).statusesIntervalId).toBeNull();
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
    .overrideComponent(BottomNavComponent, { set: { template: '' } })
    .overrideComponent(SavedPointsComponent, { set: { template: '' } });

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
    .overrideComponent(BottomNavComponent, { set: { template: '' } })
    .overrideComponent(SavedPointsComponent, { set: { template: '' } });

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

describe('resolveMainTab (T29e)', () => {
  it('resolves guardados and keeps perfil as a compatible alias', () => {
    expect(resolveMainTab('guardados')).toBe('guardados');
    expect(resolveMainTab('perfil')).toBe('guardados');
  });

  it('resolves inicio when explicitly requested', () => {
    expect(resolveMainTab('inicio')).toBe('inicio');
  });

  it('resolves foreign values including puntos and registro to inicio', () => {
    expect(resolveMainTab('puntos')).toBe('inicio');
    expect(resolveMainTab('registro')).toBe('inicio');
    expect(resolveMainTab(null)).toBe('inicio');
    expect(resolveMainTab(undefined)).toBe('inicio');
    expect(resolveMainTab('unknown')).toBe('inicio');
  });

});

describe('sanitizeNavigationIntent (UI-REB-10 security boundary)', () => {
  it('keeps only bounded scalar parameters consumed by the public flow', () => {
    expect(sanitizeNavigationIntent({
      municipio: 'Santa Tecla',
      departamento: 'La Libertad',
      referencia: 'Parque San Martín',
      refLat: '13.676912',
      refLng: '-89.279712',
      accion: 'preview',
      desconocido: '<script>alert(1)</script>',
      punto: ['AG_01', 'AG_02'],
      empresa: 'x'.repeat(257)
    })).toEqual({
      municipio: 'Santa Tecla',
      departamento: 'La Libertad',
      referencia: 'Parque San Martín',
      refLat: '13.676912',
      refLng: '-89.279712',
      accion: 'preview'
    });
  });
});

describe('MobileAppComponent public shell isolation (T29e)', () => {
  let component: MobileAppComponent;
  let fixture: ComponentFixture<MobileAppComponent>;
  let httpMock: HttpTestingController;
  let queryParams$: BehaviorSubject<Params>;

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject<Params>({ tab: 'puntos' });

    await TestBed.configureTestingModule({
      imports: [
        MobileAppComponent,
        HttpClientTestingModule,
        RouterTestingModule
      ],
      providers: [
        { provide: ToastService, useClass: MockToastService },
        { provide: MapCapabilityService, useClass: MockMapCapabilityService },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: queryParams$.asObservable(),
            snapshot: { data: {} }
          }
        }
      ]
    })
    .overrideComponent(HomeComponent, { set: { template: '' } })
    .overrideComponent(BottomNavComponent, { set: { template: '' } })
    .overrideComponent(SavedPointsComponent, { set: { template: '' } })
    .compileComponents();

    fixture = TestBed.createComponent(MobileAppComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    if (fixture) {
      fixture.destroy();
    }
    if (httpMock) {
      httpMock.verify();
    }
  });

  it('resolves activeMainTab to inicio and renders no admin elements when query param is puntos', () => {
    fixture.detectChanges();

    const reqLoc = httpMock.expectOne(req => req.url.includes('/api/catalog/points'));
    reqLoc.flush({ data: [], page: { limit: 50, hasMore: false, nextCursor: null }, meta: { catalogRevision: 'catalog:1' } });
    const nomReq = httpMock.expectOne(req => req.url.includes('nominatim.openstreetmap.org'));
    nomReq.flush({ address: { municipality: 'San Salvador' } });

    expect(component.activeMainTab).toBe('inicio');
    expect(fixture.nativeElement.querySelector('app-admin')).toBeNull();
    expect(fixture.nativeElement.querySelector('.admin-tab-content')).toBeNull();
  });
});

describe('MobileAppComponent native shell (UI-REB-02b)', () => {
  let component: MobileAppComponent;
  let fixture: ComponentFixture<MobileAppComponent>;
  let httpMock: HttpTestingController;
  let queryParams$: BehaviorSubject<Params>;

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject<Params>({});

    await TestBed.configureTestingModule({
      imports: [MobileAppComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: ToastService, useClass: MockToastService },
        { provide: MapCapabilityService, useClass: MockMapCapabilityService },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: queryParams$.asObservable(),
            snapshot: { data: {} }
          }
        }
      ]
    })
      .overrideComponent(HomeComponent, { set: { template: '' } })
      .overrideComponent(BottomNavComponent, { set: { template: '' } })
      .overrideComponent(SavedPointsComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(MobileAppComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  function initialize(): void {
    fixture.detectChanges(false);
    httpMock.expectOne((request) => request.url.includes('/api/catalog/points')).flush({
      data: [],
      page: { limit: 50, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:1' }
    });
    httpMock
      .expectOne((request) => request.url.includes('nominatim.openstreetmap.org'))
      .flush({ address: { municipality: 'San Salvador' } });
    fixture.detectChanges(false);
  }

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it('mantiene montado el slot Inicio al alternar a Guardados', () => {
    initialize();
    const host = fixture.nativeElement as HTMLElement;
    const initialSlot = host.querySelector<HTMLElement>('.si-shell-slot--inicio');

    expect(initialSlot).not.toBeNull();
    expect(initialSlot?.hidden).toBe(false);

    queryParams$.next({ tab: 'guardados' });
    fixture.detectChanges(false);

    const hiddenSlot = host.querySelector<HTMLElement>('.si-shell-slot--inicio');
    expect(hiddenSlot).toBe(initialSlot);
    expect(hiddenSlot?.hidden).toBe(true);
    expect(host.querySelector('.si-shell-slot--guardados app-saved-points')).not.toBeNull();
  });

  it('presenta y cierra el aviso de mapa con nombre accesible', () => {
    component.mapFallbackVisible = true;
    initialize();

    const host = fixture.nativeElement as HTMLElement;
    const banner = host.querySelector<HTMLElement>(
      '.si-map-fallback-banner[role="status"][aria-live="polite"]'
    );
    const closeButton = banner?.querySelector<HTMLButtonElement>(
      'button[aria-label="Cerrar aviso de mapa"]'
    );

    expect(banner).not.toBeNull();
    expect(closeButton).not.toBeNull();
    closeButton?.click();
    fixture.detectChanges(false);
    expect(component.mapFallbackVisible).toBe(false);
  });

  it('cierra el visor de imagen con Escape', () => {
    const host = fixture.nativeElement as HTMLElement;
    component.fullScreenImage = 'https://example.test/punto.webp';
    initialize();

    const overlay = host.querySelector<HTMLElement>(
      '.si-image-preview-overlay[role="dialog"][aria-modal="true"]'
    );
    expect(overlay?.getAttribute('aria-label')).toBe('Vista previa de imagen ampliada');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges(false);
    expect(host.querySelector('.si-image-preview-overlay')).toBeNull();
  });

  it('cierra el visor de imagen desde el backdrop', () => {
    const host = fixture.nativeElement as HTMLElement;
    component.fullScreenImage = 'https://example.test/punto.webp';
    initialize();

    host.querySelector<HTMLElement>('.si-image-preview-overlay')?.click();
    fixture.detectChanges(false);
    expect(host.querySelector('.si-image-preview-overlay')).toBeNull();
  });

  it('cierra el visor de imagen desde su boton', () => {
    const host = fixture.nativeElement as HTMLElement;
    component.fullScreenImage = 'https://example.test/punto.webp';
    initialize();

    host.querySelector<HTMLButtonElement>('.si-image-preview-close')?.click();
    fixture.detectChanges(false);
    expect(host.querySelector('.si-image-preview-overlay')).toBeNull();
  });

  it('publica el contrato de canvas, inset y capas del shell', () => {
    initialize();
    const shellStyles = Array.from(document.head.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .find((styles) => styles.includes('.si-shell-canvas'));

    expect(shellStyles).toBeDefined();
    expect(shellStyles).toContain('--si-shell-content-inset-bottom');
    expect(shellStyles).toContain('var(--si-safe-area-bottom)');
    expect(shellStyles).toContain('height: 100dvh');
    expect(shellStyles).not.toContain('!important');
    expect(shellStyles).toMatch(/\.si-map-fallback-banner[^}]*z-index:\s*2000/s);
    expect(shellStyles).toMatch(/\.si-image-preview-overlay[^}]*z-index:\s*9000/s);
    expect(shellStyles).toMatch(/\.si-image-preview-close[^}]*min-width:\s*44px/s);
    expect(shellStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/
    );
  });

  it('no vuelve a publicar selectores globales reemplazados por el shell', () => {
    initialize();
    const componentStyles = Array.from(document.head.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');
    const legacySelectors = [
      'mobile-first-layout',
      'inicio-tab-content',
      'map-fallback-banner',
      'map-fallback-close',
      'image-preview-overlay',
      'image-preview-close',
      'image-preview-content'
    ];

    for (const selector of legacySelectors) {
      expect(componentStyles).not.toMatch(
        new RegExp(`(^|})\\s*\\.${selector}(?=\\[|\\s|\\{|,|:)`, 'm')
      );
    }
  });
});
