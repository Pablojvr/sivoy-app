import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import { MapasService } from '../../core/services/mapas.service';
import { ToastService } from '../../core/services/toast.service';
import { ShipmentSearchFacade } from './shipment-search.facade';
import { PointShareService } from './results/point-share.service';
import { signal } from '@angular/core';
import { of, Subject } from 'rxjs';

describe('HomeComponent (T31d)', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let mapasServiceMock: { searchPlaces: Mock; resolvePlace: Mock };
  let facadeMock: Record<string, unknown>;
  let toastMock: Record<string, unknown>;
  let shareMock: Record<string, unknown>;

  beforeEach(async () => {
    mapasServiceMock = {
      searchPlaces: vi.fn().mockReturnValue(of({ suggestions: [] })),
      resolvePlace: vi.fn().mockReturnValue(of({}))
    };

    facadeMock = {
      state: signal({ mode: 'idle', status: 'initial', results: [] }),
      setOrigin: vi.fn(),
      setDestination: vi.fn()
    };

    toastMock = {
      showInfo: vi.fn()
    };
    shareMock = {
      share: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: MapasService, useValue: mapasServiceMock },
        { provide: ShipmentSearchFacade, useValue: facadeMock },
        { provide: ToastService, useValue: toastMock },
        { provide: PointShareService, useValue: shareMock }
      ]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (fixture && !fixture.componentRef?.hostView?.destroyed) {
      fixture.destroy();
    }
  });

  it('should not call MapasService.searchPlaces for pending placeSearchTimer after component destruction', () => {
    vi.useFakeTimers();
    // Trigger place search, which sets a timeout for 350ms
    component.onPlaceSearchInput('San Salvador');

    // Destroy component before timeout completes
    fixture.destroy();

    // Fast-forward time
    vi.advanceTimersByTime(400);

    // searchPlaces should NOT have been called
    expect(mapasServiceMock.searchPlaces).not.toHaveBeenCalled();
  });

  it('should unsubscribe from an in-flight place search on destroy', () => {
    vi.useFakeTimers();
    const searchSubject = new Subject<{ suggestions: any[] }>();
    mapasServiceMock.searchPlaces.mockReturnValue(searchSubject.asObservable());

    component.onPlaceSearchInput('San Salvador');
    vi.advanceTimersByTime(350);

    expect(searchSubject.observed).toBe(true);

    fixture.destroy();

    expect(searchSubject.observed).toBe(false);
    searchSubject.next({ suggestions: [{ placeId: 'late-result' }] });
    expect(component.placeSuggestions).toEqual([]);
  });

  it('should unsubscribe from an in-flight place search when the helper is cleared', () => {
    vi.useFakeTimers();
    const searchSubject = new Subject<{ suggestions: any[] }>();
    mapasServiceMock.searchPlaces.mockReturnValue(searchSubject.asObservable());

    component.onPlaceSearchInput('San Salvador');
    vi.advanceTimersByTime(350);
    expect(searchSubject.observed).toBe(true);

    component.clearPlaceSearch();

    expect(searchSubject.observed).toBe(false);
    searchSubject.next({ suggestions: [{ placeId: 'late-result' }] });
    expect(component.placeSuggestions).toEqual([]);
  });

  it('should unsubscribe from an in-flight place resolution on destroy', () => {
    const resolveSubject = new Subject<any>();
    mapasServiceMock.resolvePlace.mockReturnValue(resolveSubject.asObservable());

    component.selectPlaceSuggestion({ placeId: 'place-1', mainText: 'Centro Comercial' });

    expect(resolveSubject.observed).toBe(true);

    fixture.destroy();

    expect(resolveSubject.observed).toBe(false);
    resolveSubject.next({ place: { name: 'Respuesta tardía' } });
    expect(toastMock['showInfo']).not.toHaveBeenCalled();
    expect(facadeMock['setOrigin']).not.toHaveBeenCalled();
  });

  it('should cancel the pending initial-intent callback on destroy', () => {
    vi.useFakeTimers();
    const openSelectorSpy = vi.spyOn(component, 'openLocationSelector');
    component.initialIntent = { buscar: 'destino' };

    (component as any).applyInitialIntent();
    fixture.destroy();
    vi.runAllTimers();

    expect(openSelectorSpy).not.toHaveBeenCalled();
  });

  it('should cancel the pending selected-pin scroll callback on destroy', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const getElementByIdSpy = vi.spyOn(document, 'getElementById');

    component.selectedPin = { id_destino: 'point-1', nombre_destino: 'Punto uno' };
    fixture.destroy();
    vi.advanceTimersByTime(150);

    expect(getElementByIdSpy).not.toHaveBeenCalledWith('card-point-1');
  });

  it('focuses the destination combobox and closes the dialog after Escape', () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    const getElementByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue({ focus } as unknown as HTMLElement);

    component.openLocationSelector('destino');
    vi.runOnlyPendingTimers();

    expect(getElementByIdSpy).toHaveBeenCalledWith('destination-municipality');
    expect(focus).toHaveBeenCalledTimes(1);

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    const preventDefaultSpy = vi.spyOn(escapeEvent, 'preventDefault');
    component.onSearchDialogKeydown(escapeEvent);
    vi.runOnlyPendingTimers();

    expect(component.isSearchExpanded).toBe(false);
    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    getElementByIdSpy.mockRestore();
  });

  it('cancels pending search focus work on destroy', () => {
    vi.useFakeTimers();
    const getElementByIdSpy = vi.spyOn(document, 'getElementById');

    component.openLocationSelector('destino');
    fixture.destroy();
    vi.runAllTimers();

    expect(getElementByIdSpy).not.toHaveBeenCalledWith('destination-municipality');
    getElementByIdSpy.mockRestore();
  });

  describe('T48a — Acciones de mapa seguras en modo list-first', () => {
    let mapResourceModeChangeSpy: ReturnType<typeof vi.spyOn>;
    let resetMapMarkersSpy: ReturnType<typeof vi.spyOn>;
    let showPinDetailsSpy: ReturnType<typeof vi.spyOn>;
    let mapHighlightRouteSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mapResourceModeChangeSpy = vi.spyOn(component.mapResourceModeChange, 'emit');
      resetMapMarkersSpy = vi.spyOn(component.resetMapMarkersEvent, 'emit');
      showPinDetailsSpy = vi.spyOn(component.showPinDetails, 'emit');
      mapHighlightRouteSpy = vi.spyOn(component.mapHighlightRoute, 'emit');
    });

    describe('con mapAvailable=false', () => {
      beforeEach(() => {
        component.mapAvailable = false;
        component.mapResourceMode = false;
        component.bottomSheetState = 'half';
        component.lastSelectedLocationId = null;
        component.expandedResultCard = { id: 'card-1' } as any;
      });

      it('exploreMapFromDiscovery solicita modo mapa pero no muta estado ni emite resetMapMarkersEvent', () => {
        component.exploreMapFromDiscovery();

        expect(mapResourceModeChangeSpy).toHaveBeenCalledTimes(1);
        expect(mapResourceModeChangeSpy).toHaveBeenCalledWith(true);
        expect(component.mapResourceMode).toBe(false);
        expect(component.bottomSheetState).toBe('half');
        expect(resetMapMarkersSpy).not.toHaveBeenCalled();
      });

      it('viewPointOnMap solicita modo mapa pero no muta estado, pin ni emite showPinDetails', () => {
        const mockPoint = { id_destino: 'pto-123', nombre_destino: 'Punto Central' };
        component.viewPointOnMap(mockPoint);

        expect(mapResourceModeChangeSpy).toHaveBeenCalledTimes(1);
        expect(mapResourceModeChangeSpy).toHaveBeenCalledWith(true);
        expect(component.mapResourceMode).toBe(false);
        expect(component.bottomSheetState).toBe('half');
        expect(component.lastSelectedLocationId).toBeNull();
        expect(showPinDetailsSpy).not.toHaveBeenCalled();
      });

      it('highlightRouteOnMap solicita modo mapa pero no muta estado ni emite mapHighlightRoute', () => {
        const mockRoute = { id: 'route-456' };
        component.highlightRouteOnMap(mockRoute);

        expect(mapResourceModeChangeSpy).toHaveBeenCalledTimes(1);
        expect(mapResourceModeChangeSpy).toHaveBeenCalledWith(true);
        expect(component.mapResourceMode).toBe(false);
        expect(component.bottomSheetState).toBe('half');
        expect(component.expandedResultCard).toEqual({ id: 'card-1' });
        expect(mapHighlightRouteSpy).not.toHaveBeenCalled();
      });
    });

    describe('con mapAvailable=true', () => {
      beforeEach(() => {
        component.mapAvailable = true;
        component.mapResourceMode = false;
        component.bottomSheetState = 'half';
        component.lastSelectedLocationId = null;
        component.expandedResultCard = { id: 'card-1' } as any;
      });

      it('exploreMapFromDiscovery emite solicitud, colapsa sheet y emite resetMapMarkersEvent sin mutar input', () => {
        component.exploreMapFromDiscovery();

        expect(mapResourceModeChangeSpy).toHaveBeenCalledTimes(1);
        expect(mapResourceModeChangeSpy).toHaveBeenCalledWith(true);
        expect(component.mapResourceMode).toBe(false);
        expect(component.bottomSheetState).toBe('collapsed');
        expect(resetMapMarkersSpy).toHaveBeenCalledTimes(1);
      });

      it('viewPointOnMap emite solicitud, asigna lastSelectedLocationId y emite showPinDetails sin mutar input', () => {
        const mockPoint = { id_destino: 'pto-123', nombre_destino: 'Punto Central' };
        component.viewPointOnMap(mockPoint);

        expect(mapResourceModeChangeSpy).toHaveBeenCalledTimes(1);
        expect(mapResourceModeChangeSpy).toHaveBeenCalledWith(true);
        expect(component.mapResourceMode).toBe(false);
        expect(component.lastSelectedLocationId).toBe('pto-123');
        expect(showPinDetailsSpy).toHaveBeenCalledTimes(1);
        expect(showPinDetailsSpy).toHaveBeenCalledWith({
          location: mockPoint,
          type: 'destino'
        });
      });

      it('highlightRouteOnMap emite solicitud, emite ruta y colapsa sheet sin mutar input', () => {
        const mockRoute = { id: 'route-456' };
        component.highlightRouteOnMap(mockRoute);

        expect(mapResourceModeChangeSpy).toHaveBeenCalledTimes(1);
        expect(mapResourceModeChangeSpy).toHaveBeenCalledWith(true);
        expect(component.mapResourceMode).toBe(false);
        expect(component.bottomSheetState).toBe('collapsed');
        expect(component.expandedResultCard).toBeNull();
        expect(mapHighlightRouteSpy).toHaveBeenCalledTimes(1);
        expect(mapHighlightRouteSpy).toHaveBeenCalledWith(mockRoute);
      });
    });
  });
});
