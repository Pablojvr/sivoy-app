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
    if (httpMock) {
      httpMock.verify();
    }
  });

  // Helper to flush implicit requests triggered by ngOnInit
  const flushInitRequests = () => {
    const reqLoc = httpMock.expectOne(req => req.url.includes('/api/locations'));
    reqLoc.flush([
      { id: 10, empresa: 'SiVoyExpress', ubicacion: { municipio: 'San Miguel', departamento: 'San Miguel' } }
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
  
  it('should update search inputs and handoff focus on selectLocation()', () => {
    fixture.detectChanges();
    flushInitRequests();
    
    // Act: Select an origin location
    const mockLocation = { id: 99, nombre_destino: 'Oficina Central' } as unknown;
    component.selectLocation(mockLocation, 'origen');
    
    // Assert: Check the side effects on search state
    expect(component.origen).toBe(99);
    expect(component.origenInputValue).toBe('Oficina Central');
    expect(component.origenMunicipio).toBeNull();
    expect(component.showAutocomplete).toBe(false);
    expect(component.activeInput).toBe('destino');
  });
});
