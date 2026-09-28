import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { UbicacionesService } from '../../core/services/ubicaciones.service';
import { MapCapabilityService } from '../../core/maps/map-capability.service';
import {
  MapPort,
  MapCoordinate,
  MapViewportOptions,
  MapFitOptions,
  MapRouteStyle,
  MapMarkerOptions,
  MapPopupContent,
  MapMarkerPort,
  MapInitializeOptions
} from '../../core/maps/map.port';
import { AdminComponent } from './admin.component';
import { ADMIN_MAP_FACTORY, AdminPageComponent, parseAdminCoordinate } from './admin-page.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  template: ''
})
class AdminStubComponent {
  @Input() locations: unknown[] = [];
  @Output() locationUpdated = new EventEmitter<void>();
  @Output() previewImageEvent = new EventEmitter<string>();
  @Output() viewOnMapEvent = new EventEmitter<unknown>();
  @Output() previewMapEvent = new EventEmitter<unknown>();
  @Output() minimizeModalEvent = new EventEmitter<boolean>();
  @Output() requestMapPick = new EventEmitter<unknown>();

  isPickingLocation = false;
  pickedLocation?: { lat: string; lng: string };

  updatePickedLocation(lat: string, lng: string): void {
    this.pickedLocation = { lat, lng };
  }
}

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  template: ''
})
class BottomNavStubComponent {
  @Input() activeTab = 'inicio';
}

class FakeMapMarker implements MapMarkerPort {
  coordinate: MapCoordinate;
  options?: MapMarkerOptions;
  removed = false;
  dragEndHandlers: Array<(coord: MapCoordinate) => void> = [];

  constructor(coord: MapCoordinate, options?: MapMarkerOptions) {
    this.coordinate = { ...coord };
    this.options = options;
  }

  setCoordinate(coord: MapCoordinate): void {
    this.coordinate = { ...coord };
  }

  getCoordinate(): MapCoordinate {
    return { ...this.coordinate };
  }

  setPopupContent(_content: MapPopupContent): void {}

  onDragEnd(handler: (coord: MapCoordinate) => void): () => void {
    this.dragEndHandlers.push(handler);
    return () => {
      this.dragEndHandlers = this.dragEndHandlers.filter(h => h !== handler);
    };
  }

  triggerDragEnd(coord: MapCoordinate): void {
    this.coordinate = { ...coord };
    this.dragEndHandlers.forEach(h => h(coord));
  }

  getElement(): HTMLElement {
    return this.options?.element ?? document.createElement('div');
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeMapPort implements MapPort {
  initialized = false;
  destroyed = false;
  destroyCount = 0;
  resizeCount = 0;
  initializeOptions?: MapInitializeOptions;
  container?: HTMLElement;
  flyToCalls: Array<{ center: MapCoordinate; options?: MapViewportOptions }> = [];
  createdMarkers: FakeMapMarker[] = [];

  initialize(container: HTMLElement, options: MapInitializeOptions): void {
    this.initialized = true;
    this.container = container;
    this.initializeOptions = options;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getCenter(): MapCoordinate {
    return this.initializeOptions?.center ?? { lat: 0, lng: 0 };
  }

  flyTo(center: MapCoordinate, options?: MapViewportOptions): void {
    this.flyToCalls.push({ center, options });
  }

  jumpTo(center: MapCoordinate, options?: MapViewportOptions): void {
    this.flyToCalls.push({ center, options });
  }

  fitCoordinates(_coordinates: readonly MapCoordinate[], _options?: MapFitOptions): void {}

  resize(): void {
    this.resizeCount++;
  }

  onClick(_handler: (coord: MapCoordinate) => void): () => void {
    return () => {};
  }
  onDragStart(_handler: () => void): () => void {
    return () => {};
  }
  onMoveStart(_handler: () => void): () => void {
    return () => {};
  }
  onMoveEnd(_handler: () => void): () => void {
    return () => {};
  }
  onMove(_handler: (center: MapCoordinate) => void): () => void {
    return () => {};
  }
  onLoad(_handler: () => void): () => void {
    return () => {};
  }
  onError(_handler: (message: string) => void): () => void {
    return () => {};
  }

  createMarker(coord: MapCoordinate, options?: MapMarkerOptions): MapMarkerPort {
    const marker = new FakeMapMarker(coord, options);
    this.createdMarkers.push(marker);
    return marker;
  }

  drawRouteLine(_coordinates: readonly MapCoordinate[], _style?: MapRouteStyle): void {}
  removeRouteLine(): void {}

  destroy(): void {
    this.destroyed = true;
    this.destroyCount++;
  }
}

describe('AdminPageComponent (T29b)', () => {
  let fixture: ComponentFixture<AdminPageComponent>;
  let firstLocations: Subject<unknown[]>;
  let secondLocations: Subject<unknown[]>;
  let getLocations: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    firstLocations = new Subject<unknown[]>();
    secondLocations = new Subject<unknown[]>();
    getLocations = vi.fn()
      .mockReturnValueOnce(firstLocations)
      .mockReturnValueOnce(secondLocations);

    await TestBed.configureTestingModule({
      imports: [AdminPageComponent],
      providers: [
        provideRouter([]),
        { provide: UbicacionesService, useValue: { getLocations } }
      ]
    })
      .overrideComponent(AdminPageComponent, {
        remove: { imports: [AdminComponent, BottomNavComponent] },
        add: { imports: [AdminStubComponent, BottomNavStubComponent] }
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminPageComponent);
    fixture.detectChanges();
  });

  const renderAdmin = (locations: unknown[] = []): AdminStubComponent => {
    firstLocations.next(locations);
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(AdminStubComponent)).componentInstance as AdminStubComponent;
  };

  it('waits for the initial locations result before mounting the admin view', () => {
    expect(fixture.debugElement.query(By.directive(AdminStubComponent))).toBeNull();

    const admin = renderAdmin();

    expect(admin).toBeDefined();
  });

  it('loads locations and hands them to the admin view', () => {
    const points = [{ id: 'point-1', nombre_destino: 'Agencia Centro' }];
    const admin = renderAdmin(points);
    expect(getLocations).toHaveBeenCalledTimes(1);
    expect(admin.locations).toBe(points);
  });

  it('replaces locations after the admin view reports an update', () => {
    const admin = renderAdmin([{ id: 'old' }]);

    admin.locationUpdated.emit();
    const refreshed = [{ id: 'new' }];
    secondLocations.next(refreshed);
    fixture.detectChanges();

    expect(getLocations).toHaveBeenCalledTimes(2);
    expect(admin.locations).toBe(refreshed);
  });

  it('cancels an active locations load when destroyed', () => {
    expect(firstLocations.observed).toBe(true);

    fixture.destroy();

    expect(firstLocations.observed).toBe(false);
  });

  it('opens the image dialog and closes it with Escape', () => {
    const admin = renderAdmin();
    admin.previewImageEvent.emit('/uploads/reference.jpg');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"] img').getAttribute('src'))
      .toContain('/uploads/reference.jpg');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the dialog open for image clicks and closes it from the backdrop', () => {
    const admin = renderAdmin();
    admin.previewImageEvent.emit('/uploads/reference.jpg');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('[role="dialog"] img') as HTMLElement;
    image.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();

    const backdrop = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    backdrop.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('marks Panel as the active bottom navigation item', () => {
    const bottomNav = fixture.debugElement.query(By.directive(BottomNavStubComponent)).componentInstance as BottomNavStubComponent;
    expect(bottomNav.activeTab).toBe('puntos');
  });
});

describe('AdminPageComponent (T29c Map Integration)', () => {
  let fixture: ComponentFixture<AdminPageComponent>;
  let component: AdminPageComponent;
  let locationsSubject: Subject<unknown[]>;
  let getLocations: ReturnType<typeof vi.fn>;
  let fakeMap: FakeMapPort;
  let mapFactory: ReturnType<typeof vi.fn>;
  let mockCapabilityService: { supportsInteractiveMap: ReturnType<typeof vi.fn> };
  let originalResizeObserver: unknown;
  let mockResizeObserverInstances: Array<{
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(async () => {
    locationsSubject = new Subject<unknown[]>();
    getLocations = vi.fn().mockReturnValue(locationsSubject);
    fakeMap = new FakeMapPort();
    mapFactory = vi.fn().mockImplementation(() => fakeMap);
    mockCapabilityService = {
      supportsInteractiveMap: vi.fn().mockReturnValue(true)
    };

    mockResizeObserverInstances = [];
    originalResizeObserver = (globalThis as any).ResizeObserver;
    (globalThis as any).ResizeObserver = class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(_callback: ResizeObserverCallback) {
        mockResizeObserverInstances.push(this);
      }
    };

    await TestBed.configureTestingModule({
      imports: [AdminPageComponent],
      providers: [
        provideRouter([]),
        { provide: UbicacionesService, useValue: { getLocations } },
        { provide: MapCapabilityService, useValue: mockCapabilityService },
        { provide: ADMIN_MAP_FACTORY, useValue: mapFactory }
      ]
    })
      .overrideComponent(AdminPageComponent, {
        remove: { imports: [AdminComponent, BottomNavComponent] },
        add: { imports: [AdminStubComponent, BottomNavStubComponent] }
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    (globalThis as any).ResizeObserver = originalResizeObserver;
  });

  const getAdminStub = (): AdminStubComponent => {
    locationsSubject.next([{ id: 1, nombre_destino: 'Punto Base' }]);
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(AdminStubComponent)).componentInstance as AdminStubComponent;
  };

  it('initial zero capability/factory use: does not probe WebGL capability or create map at mount', () => {
    expect(mockCapabilityService.supportsInteractiveMap).not.toHaveBeenCalled();
    expect(mapFactory).not.toHaveBeenCalled();
    expect(component.mapMode).toBe('list');

    const mapHost = fixture.nativeElement.querySelector('#admin-map');
    expect(mapHost).not.toBeNull();
    expect(mapHost.hasAttribute('hidden')).toBe(false);
    expect(mapHost.classList.contains('is-active')).toBe(false);
    expect(mapHost.getAttribute('aria-hidden')).toBe('true');
  });

  it('lazy view initialization: initializes map on viewOnMapEvent, sets destination marker and flies to point', () => {
    const adminStub = getAdminStub();

    adminStub.viewOnMapEvent.emit({
      nombre_destino: 'Punto Santa Ana',
      ubicacion: { lat: 13.99, lng: -89.56 }
    });
    fixture.detectChanges();

    expect(mockCapabilityService.supportsInteractiveMap).toHaveBeenCalledTimes(1);
    expect(mapFactory).toHaveBeenCalledTimes(1);
    expect(fakeMap.initialized).toBe(true);
    expect(fakeMap.initializeOptions?.zoom).toBe(8.2);
    expect(component.mapMode).toBe('viewing');

    const mapHost = fixture.nativeElement.querySelector('#admin-map');
    expect(mapHost.classList.contains('is-active')).toBe(true);
    expect(mapHost.getAttribute('aria-hidden')).toBeNull();

    expect(fakeMap.createdMarkers.length).toBe(1);
    expect(fakeMap.createdMarkers[0].coordinate).toEqual({ lat: 13.99, lng: -89.56 });
    expect(fakeMap.flyToCalls).toContainEqual({
      center: { lat: 13.99, lng: -89.56 },
      options: { zoom: 17 }
    });

    const backBtn = fixture.nativeElement.querySelector('.admin-map-back-btn');
    expect(backBtn).not.toBeNull();
    expect(backBtn.getAttribute('aria-label')).toBe('Volver a la lista');
  });

  it('adapter reused across repeated spatial actions without re-calling factory', () => {
    const adminStub = getAdminStub();

    adminStub.viewOnMapEvent.emit({
      nombre_destino: 'Punto 1',
      ubicacion: { lat: 13.7, lng: -89.2 }
    });
    fixture.detectChanges();
    expect(mapFactory).toHaveBeenCalledTimes(1);

    adminStub.viewOnMapEvent.emit({
      nombre_destino: 'Punto 2',
      ubicacion: { lat: 13.8, lng: -89.3 }
    });
    fixture.detectChanges();
    expect(mapFactory).toHaveBeenCalledTimes(1);
    expect(fakeMap.flyToCalls.length).toBe(2);
  });

  it('draggable preview updates child coordinates on drag end', () => {
    const adminStub = getAdminStub();

    adminStub.previewMapEvent.emit({ lat: 13.75, lng: -89.25 });
    fixture.detectChanges();

    expect(component.mapMode).toBe('editing');
    expect(fakeMap.createdMarkers.length).toBe(1);
    const previewMarker = fakeMap.createdMarkers[0];
    expect(previewMarker.options?.draggable).toBe(true);
    expect(previewMarker.options?.anchor).toBe('bottom');
    expect(fakeMap.flyToCalls).toContainEqual({
      center: { lat: 13.75, lng: -89.25 },
      options: { zoom: 18 }
    });

    previewMarker.triggerDragEnd({ lat: 13.751234, lng: -89.251234 });
    expect(adminStub.pickedLocation).toEqual({ lat: '13.751234', lng: '-89.251234' });
  });

  it('normalizes valid string coordinates and enters preview mode', () => {
    const adminStub = getAdminStub();

    adminStub.previewMapEvent.emit({ lat: ' 13.700000 ', lng: ' -89.200000 ' });
    fixture.detectChanges();

    expect(component.mapMode).toBe('editing');
    expect(fakeMap.flyToCalls[0].center).toEqual({ lat: 13.7, lng: -89.2 });
  });

  it('rejects non-finite or out-of-range coordinates without initializing map', () => {
    const adminStub = getAdminStub();

    adminStub.previewMapEvent.emit({ lat: 195, lng: -89.2 });
    fixture.detectChanges();

    expect(mapFactory).not.toHaveBeenCalled();
    expect(component.mapMode).toBe('list');
    const fallback = fixture.nativeElement.querySelector('[role="status"].admin-map-fallback-banner');
    expect(fallback).not.toBeNull();
  });

  it('parseAdminCoordinate rejects empty or whitespace strings without initializing map or creating markers', () => {
    expect(parseAdminCoordinate('', '')).toBeNull();
    expect(parseAdminCoordinate('   ', '   ')).toBeNull();
    expect(parseAdminCoordinate('13.7', '  ')).toBeNull();
    expect(parseAdminCoordinate('  ', '-89.2')).toBeNull();

    const adminStub = getAdminStub();

    adminStub.previewMapEvent.emit({ lat: '   ', lng: '   ' });
    fixture.detectChanges();

    expect(mapFactory).not.toHaveBeenCalled();
    expect(fakeMap.createdMarkers.length).toBe(0);
    expect(component.mapMode).toBe('list');
    const fallback = fixture.nativeElement.querySelector('[role="status"].admin-map-fallback-banner');
    expect(fallback).not.toBeNull();
    expect(fallback.textContent).toContain('Las coordenadas para la vista previa no son válidas.');
  });

  it('requestMapPick uses default El Salvador coordinate when coords missing and hides child editor', () => {
    const adminStub = getAdminStub();

    adminStub.requestMapPick.emit({});
    fixture.detectChanges();

    expect(adminStub.isPickingLocation).toBe(true);
    expect(component.mapMode).toBe('editing');
    expect(fakeMap.createdMarkers.length).toBe(1);
    expect(fakeMap.createdMarkers[0].coordinate).toEqual({ lat: 13.69, lng: -89.21 });
    expect(fakeMap.flyToCalls).toContainEqual({
      center: { lat: 13.69, lng: -89.21 },
      options: { zoom: 18 }
    });

    const returnBtn = fixture.nativeElement.querySelector('.admin-map-return-edit-btn');
    expect(returnBtn).not.toBeNull();
    returnBtn.click();
    fixture.detectChanges();

    expect(adminStub.isPickingLocation).toBe(false);
    expect(component.mapMode).toBe('list');
    expect(fakeMap.createdMarkers[0].removed).toBe(true);
  });

  it('back-to-list action cleans markers and returns to list mode', () => {
    const adminStub = getAdminStub();

    adminStub.viewOnMapEvent.emit({
      nombre_destino: 'Punto A',
      ubicacion: { lat: 13.7, lng: -89.2 }
    });
    fixture.detectChanges();
    expect(component.mapMode).toBe('viewing');
    const marker = fakeMap.createdMarkers[0];

    const mapHost = fixture.nativeElement.querySelector('#admin-map');
    expect(mapHost.classList.contains('is-active')).toBe(true);

    const backBtn = fixture.nativeElement.querySelector('.admin-map-back-btn');
    backBtn.click();
    fixture.detectChanges();

    expect(component.mapMode).toBe('list');
    expect(marker.removed).toBe(true);
    expect(mapHost.classList.contains('is-active')).toBe(false);
    expect(mapHost.getAttribute('aria-hidden')).toBe('true');
  });

  it('minimizeModalEvent(false) returns to list mode and cleans preview marker', () => {
    const adminStub = getAdminStub();

    adminStub.previewMapEvent.emit({ lat: 13.7, lng: -89.2 });
    fixture.detectChanges();
    expect(component.mapMode).toBe('editing');
    const marker = fakeMap.createdMarkers[0];

    adminStub.minimizeModalEvent.emit(false);
    fixture.detectChanges();

    expect(component.mapMode).toBe('list');
    expect(marker.removed).toBe(true);
  });

  it('removes stale preview marker and returns to list mode when new invalid preview request arrives after active preview', () => {
    const adminStub = getAdminStub();

    adminStub.previewMapEvent.emit({ lat: 13.7, lng: -89.2 });
    fixture.detectChanges();

    expect(component.mapMode).toBe('editing');
    expect(fakeMap.createdMarkers.length).toBe(1);
    const marker = fakeMap.createdMarkers[0];
    expect(marker.removed).toBe(false);

    adminStub.previewMapEvent.emit({ lat: 'invalido', lng: null });
    fixture.detectChanges();

    expect(marker.removed).toBe(true);
    expect(component.mapMode).toBe('list');
    const fallback = fixture.nativeElement.querySelector('[role="status"].admin-map-fallback-banner');
    expect(fallback).not.toBeNull();
    expect(fallback.textContent).toContain('Las coordenadas para la vista previa no son válidas.');
  });

  it('unsupported WebGL displays accessible fallback without calling factory or losing child editor', () => {
    mockCapabilityService.supportsInteractiveMap.mockReturnValue(false);
    const adminStub = getAdminStub();

    adminStub.requestMapPick.emit({});
    fixture.detectChanges();

    expect(mapFactory).not.toHaveBeenCalled();
    expect(adminStub.isPickingLocation).toBe(false);
    expect(component.mapMode).toBe('list');

    const fallback = fixture.nativeElement.querySelector('[role="status"].admin-map-fallback-banner');
    expect(fallback).not.toBeNull();
  });

  it('initialization failure displays accessible fallback without crashing or losing child editor', () => {
    mapFactory.mockImplementationOnce(() => {
      throw new Error('WebGL context lost');
    });
    const adminStub = getAdminStub();

    adminStub.requestMapPick.emit({});
    fixture.detectChanges();

    expect(adminStub.isPickingLocation).toBe(false);
    expect(component.mapMode).toBe('list');
    const fallback = fixture.nativeElement.querySelector('[role="status"].admin-map-fallback-banner');
    expect(fallback).not.toBeNull();
  });

  it('cleans up and destroys adapter exactly once if initialize throws, maintaining null references and recovering child editor', () => {
    fakeMap.initialize = vi.fn().mockImplementation(() => {
      fakeMap.initialized = true;
      throw new Error('initialize failure');
    });

    const adminStub = getAdminStub();
    adminStub.requestMapPick.emit({});
    fixture.detectChanges();

    expect(fakeMap.destroyCount).toBe(1);
    expect(fakeMap.destroyed).toBe(true);
    expect(component['map']).toBeNull();
    expect(component['mapLifecycle']).toBeNull();
    expect(component['mapResizeObserver']).toBeNull();
    expect(adminStub.isPickingLocation).toBe(false);
    expect(component.mapMode).toBe('list');
    const fallback = fixture.nativeElement.querySelector('[role="status"].admin-map-fallback-banner');
    expect(fallback).not.toBeNull();
  });

  it('cleans up observer and destroys adapter exactly once if observer.observe throws', () => {
    (globalThis as any).ResizeObserver = class ThrowingResizeObserver {
      observe = vi.fn().mockImplementation(() => {
        throw new Error('observe failure');
      });
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(_callback: ResizeObserverCallback) {
        mockResizeObserverInstances.push(this);
      }
    };

    const adminStub = getAdminStub();
    adminStub.requestMapPick.emit({});
    fixture.detectChanges();

    expect(fakeMap.destroyCount).toBe(1);
    expect(mockResizeObserverInstances.length).toBe(1);
    expect(mockResizeObserverInstances[0].disconnect).toHaveBeenCalledTimes(1);
    expect(component['map']).toBeNull();
    expect(component['mapLifecycle']).toBeNull();
    expect(component['mapResizeObserver']).toBeNull();
    expect(adminStub.isPickingLocation).toBe(false);
    expect(component.mapMode).toBe('list');
    const fallback = fixture.nativeElement.querySelector('[role="status"].admin-map-fallback-banner');
    expect(fallback).not.toBeNull();
  });

  it('destroy disconnects ResizeObserver and destroys map exactly once', () => {
    const adminStub = getAdminStub();

    adminStub.viewOnMapEvent.emit({
      nombre_destino: 'Punto A',
      ubicacion: { lat: 13.7, lng: -89.2 }
    });
    fixture.detectChanges();

    expect(fakeMap.initialized).toBe(true);
    expect(mockResizeObserverInstances.length).toBeGreaterThan(0);
    const observer = mockResizeObserverInstances[0];

    fixture.destroy();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(fakeMap.destroyCount).toBe(1);
    expect(fakeMap.destroyed).toBe(true);
  });

  it('invalid coordinates in viewOnMapEvent do not initialize map and expose accessible status message', () => {
    const adminStub = getAdminStub();

    adminStub.viewOnMapEvent.emit({
      nombre_destino: 'Punto sin coords',
      ubicacion: { lat: 'no-number', lng: null }
    });
    fixture.detectChanges();

    expect(mapFactory).not.toHaveBeenCalled();
    expect(component.mapMode).toBe('list');
    const fallback = fixture.nativeElement.querySelector('[role="status"].admin-map-fallback-banner');
    expect(fallback).not.toBeNull();
  });
});
