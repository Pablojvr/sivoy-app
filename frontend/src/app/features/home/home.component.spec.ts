import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import { MapasService } from '../../core/services/mapas.service';
import { ToastService } from '../../core/services/toast.service';
import { ShipmentSearchFacade } from './shipment-search.facade';
import { PointShareService } from '../../core/services/point-share.service';
import { CatalogService } from '../../core/services/catalog.service';
import { CatalogPage, CatalogPoint } from '../../core/models/catalog.models';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';

describe('HomeComponent (T31d)', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let mapasServiceMock: { searchPlaces: Mock; resolvePlace: Mock };
  let facadeMock: Record<string, unknown>;
  let toastMock: Record<string, unknown>;
  let shareMock: Record<string, unknown>;
  let catalogMock: { listFacets: Mock; listPoints: Mock; getPointDetails: Mock };

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
    catalogMock = {
      listFacets: vi.fn().mockReturnValue(of(emptyCatalogPage())),
      listPoints: vi.fn().mockReturnValue(of(emptyCatalogPage())),
      getPointDetails: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: MapasService, useValue: mapasServiceMock },
        { provide: ShipmentSearchFacade, useValue: facadeMock },
        { provide: ToastService, useValue: toastMock },
        { provide: PointShareService, useValue: shareMock },
        { provide: CatalogService, useValue: catalogMock }
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

  it('searches municipality facets remotely with debounce in catalog mode', () => {
    vi.useFakeTimers();
    catalogMock.listFacets.mockReturnValue(of({
      data: [{ value: 'Soyapango', label: 'Soyapango', count: 3, context: { department: 'San Salvador' } }],
      page: { limit: 8, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:1' }
    }));
    component.catalogMode = true;

    component.onDestinoInput('soya');
    expect(catalogMock.listFacets).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);

    expect(catalogMock.listFacets).toHaveBeenCalledWith({ facet: 'municipality', q: 'soya', limit: 8 });
    expect(component.filteredMunicipalities).toEqual([
      { nombre_display: 'Soyapango', municipio: 'Soyapango', departamento: 'San Salvador', pointCount: 3 }
    ]);
  });

  it('loads one bounded municipality page and full schedules only when a card expands', () => {
    const point = catalogPoint();
    catalogMock.listPoints.mockReturnValue(of({
      data: [point],
      page: { limit: 20, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:1' }
    }));
    catalogMock.getPointDetails.mockReturnValue(of({
      ...point,
      schedules: [{ day: 'Lunes', opensAt: '09:00', closesAt: '16:00' }]
    }));
    component.catalogMode = true;

    component.discoveryModeForMunicipality('Soyapango', 'San Salvador');

    expect(catalogMock.listPoints).toHaveBeenCalledWith({
      municipality: 'Soyapango', department: 'San Salvador', limit: 20
    });
    expect(component.displayedResults).toHaveLength(1);
    expect(component.displayedResults[0].horarios_operativos).toEqual([]);

    component.togglePointCard(component.displayedResults[0]);

    expect(catalogMock.getPointDetails).toHaveBeenCalledWith('AG_01');
    expect(component.displayedResults[0].horarios_operativos).toEqual([
      { dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }
    ]);
  });

  describe('UI-REB-09 — resultados a pagina completa', () => {
    const openAvailability = {
      status: 'OPEN' as const,
      closesAt: '16:00',
      nextOpeningAt: null,
      evaluatedAt: '2026-10-19T10:00:00-06:00',
      timeZone: 'America/El_Salvador'
    };

    function result(id: string, status: 'OPEN' | 'CLOSED', lat: number) {
      return {
        id,
        id_destino: id,
        nombre_destino: id,
        destino_nombre: id,
        empresa: 'Pedidos Express',
        ubicacion: { municipio: 'Soyapango', departamento: 'San Salvador', lat, lng: -89.2 },
        catalogAvailability: { ...openAvailability, status, closesAt: status === 'OPEN' ? '16:00' : null },
        horarios_operativos: [
          { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: id === 'extendido' ? '19:00' : '17:00' }
        ]
      };
    }

    it('presenta la lista municipal como pagina y no como panel deslizable', async () => {
      await fixture.whenStable();
      component.destino = 'Soyapango, San Salvador';
      component.isDiscoveryMode = true;
      component.municipalityResults = [result('AG_01', 'OPEN', 13.7)];
      component.displayedResults = [...component.municipalityResults];
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      const page = fixture.nativeElement.querySelector('.bottom-sheet.point-results-page');
      expect(page).toBeTruthy();
      expect(page.querySelector('.drag-handle')).toBeNull();
      expect(page.textContent).toContain('Encuentra el punto ideal');
    });

    it('usa la misma superficie completa al explorar puntos de origen', () => {
      component.origenMunicipio = 'Santa Tecla';
      component.isOriginDiscoveryMode = true;
      component.municipalityResults = [result('OR_01', 'OPEN', 13.68)];
      component.displayedResults = [...component.municipalityResults];

      expect(component.isPointResultsPage).toBe(true);
    });

    it('filtra disponibilidad y permite limpiar sin perder el orden del catalogo', () => {
      component.municipalityResults = [result('cerrado', 'CLOSED', 13.8), result('abierto', 'OPEN', 13.7)];

      component.setPointAvailabilityFilter('open');
      expect(component.displayedResults.map(point => point.id)).toEqual(['abierto']);

      component.clearPointResultFilters();
      expect(component.displayedResults.map(point => point.id)).toEqual(['cerrado', 'abierto']);
    });

    it('filtra por jornada extendida y la combina con disponibilidad', () => {
      component.municipalityResults = [
        result('normal', 'OPEN', 13.8),
        result('extendido', 'OPEN', 13.7),
        { ...result('extendido-cerrado', 'CLOSED', 13.6), horarios_operativos: [{ dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '19:00' }] }
      ];

      component.setPointScheduleFilter('extended');
      component.setPointAvailabilityFilter('open');

      expect(component.displayedResults.map(point => point.id)).toEqual(['extendido']);
    });

    it('restaura filtros validos desde la URL y degrada valores desconocidos', () => {
      component.municipalityResults = [result('abierto', 'OPEN', 13.7)];
      fixture.componentRef.setInput('initialIntent', { orden: 'cerca', disponibilidad: 'abierto', horario: 'tarde' });
      fixture.detectChanges();
      expect(component.pointResultFilters).toEqual({ availability: 'open', schedule: 'afternoon' });

      fixture.componentRef.setInput('initialIntent', { orden: 'otro', disponibilidad: 'otra', horario: 'otro' });
      fixture.detectChanges();
      expect(component.pointResultFilters).toEqual({ availability: 'all', schedule: 'all' });
    });

    it('no vuelve a ejecutar la vista previa al cambiar solo filtros de resultados', () => {
      vi.useFakeTimers();
      const point = result('AG_01', 'OPEN', 13.7);
      component.locations = [point];
      const applyPointIntent = vi.spyOn(component as any, 'applyPointIntent').mockImplementation(() => undefined);

      component.initialIntent = { punto: 'AG_01', accion: 'preview', disponibilidad: 'todos', horario: 'todos' };
      (component as any).applyInitialIntent();
      vi.runOnlyPendingTimers();

      component.initialIntent = { punto: 'AG_01', accion: 'preview', disponibilidad: 'todos', horario: 'extendido' };
      (component as any).applyInitialIntent();
      vi.runOnlyPendingTimers();

      expect(applyPointIntent).toHaveBeenCalledTimes(1);
    });

    it('aplica la franja restaurada al abrir directamente la vista previa de un punto', () => {
      component.pointResultFilters = { availability: 'all', schedule: 'extended' };

      component.previewPointFromDiscovery(result('normal', 'OPEN', 13.7));

      expect(component.municipalityResults).toHaveLength(1);
      expect(component.displayedResults).toEqual([]);
    });
  });

  describe('UI-REB-10 — contexto de lugar de referencia', () => {
    it('publica el municipio elegido y descarta el contexto de lugar anterior', () => {
      component.initialIntent = {
        municipio: 'San Salvador',
        departamento: 'San Salvador',
        referencia: 'Parque anterior',
        refLat: '13.7',
        refLng: '-89.2'
      };
      component.placeDestinationContext = Object.freeze({
        reference: 'Parque anterior', municipio: 'San Salvador', departamento: 'San Salvador',
        lat: 13.7, lng: -89.2
      });
      const emitted = vi.fn();
      component.destinationMunicipalityChange.subscribe(emitted);
      vi.spyOn(component, 'executeSearch').mockImplementation(() => undefined);

      component.selectMunicipality({ municipio: 'Santa Tecla', departamento: 'La Libertad' }, 'destino');

      expect(component.placeDestinationContext).toBeNull();
      expect(emitted).toHaveBeenCalledWith({ municipio: 'Santa Tecla', departamento: 'La Libertad' });
    });

    it('conserva el lugar de referencia al aplicar un municipio que ya viene de la URL', () => {
      component.placeDestinationContext = Object.freeze({
        reference: 'Parque San Martín', municipio: 'Santa Tecla', departamento: 'La Libertad',
        lat: 13.676912, lng: -89.279712
      });
      const emitted = vi.fn();
      component.destinationMunicipalityChange.subscribe(emitted);
      vi.spyOn(component, 'executeSearch').mockImplementation(() => undefined);

      component.selectMunicipalityFromDiscovery({ municipio: 'Santa Tecla', departamento: 'La Libertad' });

      expect(component.placeDestinationContext?.reference).toBe('Parque San Martín');
      expect(emitted).not.toHaveBeenCalled();
    });

    it('acepta referencia y coordenadas solamente como un conjunto valido e inmutable', () => {
      vi.useFakeTimers();
      const openMunicipality = vi.spyOn(component, 'selectMunicipalityFromDiscovery')
        .mockImplementation(() => undefined);
      component.initialIntent = {
        municipio: 'Santa Tecla',
        departamento: 'La Libertad',
        referencia: 'Parque San Martín',
        refLat: '13.676912',
        refLng: '-89.279712'
      };

      (component as any).applyInitialIntent();
      vi.runOnlyPendingTimers();

      expect(component.placeDestinationContext).toEqual({
        reference: 'Parque San Martín',
        municipio: 'Santa Tecla',
        departamento: 'La Libertad',
        lat: 13.676912,
        lng: -89.279712
      });
      expect(Object.isFrozen(component.placeDestinationContext)).toBe(true);
      expect(openMunicipality).toHaveBeenCalledWith({
        municipio: 'Santa Tecla', departamento: 'La Libertad'
      });
    });

    it.each([
      [{ referencia: 'Parque', refLat: '13.7' }, 'contexto incompleto'],
      [{ referencia: 'Parque', refLat: '', refLng: '-89.2' }, 'latitud vacia'],
      [{ referencia: 'Parque', refLat: 'NaN', refLng: '-89.2' }, 'NaN'],
      [{ referencia: 'Parque', refLat: 'Infinity', refLng: '-89.2' }, 'infinito'],
      [{ referencia: 'Parque', refLat: '1e1', refLng: '-89.2' }, 'notacion inesperada'],
      [{ referencia: 'Parque', refLat: '91', refLng: '-89.2' }, 'fuera de rango'],
      [{ referencia: 'x'.repeat(129), refLat: '13.7', refLng: '-89.2' }, 'texto excesivo']
    ])('ignora %s sin alterar la apertura municipal tradicional', (referenceIntent, _description) => {
      vi.useFakeTimers();
      const openMunicipality = vi.spyOn(component, 'selectMunicipalityFromDiscovery')
        .mockImplementation(() => undefined);
      component.initialIntent = {
        municipio: 'Santa Tecla',
        departamento: 'La Libertad',
        ...referenceIntent
      };
      (component as any).appliedIntentKey = '';

      (component as any).applyInitialIntent();
      vi.runOnlyPendingTimers();

      expect(component.placeDestinationContext).toBeNull();
      expect(openMunicipality).toHaveBeenCalledWith({
        municipio: 'Santa Tecla', departamento: 'La Libertad'
      });
      openMunicipality.mockRestore();
    });

    it('reune todas las paginas, elimina duplicados y ordena globalmente por distancia', () => {
      const far = catalogPoint();
      far.pointId = 'FAR';
      far.name = 'Punto lejano';
      far.location.coordinates = { lat: 13.8, lng: -89.28 };
      far.location.municipality = 'Santa Tecla';
      far.location.department = 'La Libertad';
      const near = catalogPoint();
      near.pointId = 'NEAR';
      near.name = 'Punto cercano';
      near.location.coordinates = { lat: 13.677, lng: -89.28 };
      near.location.municipality = 'Santa Tecla';
      near.location.department = 'La Libertad';
      const unknown = catalogPoint();
      unknown.pointId = 'UNKNOWN';
      unknown.name = 'Punto sin coordenadas';
      unknown.location.coordinates = { lat: null, lng: null };
      unknown.location.municipality = 'Santa Tecla';
      unknown.location.department = 'La Libertad';
      catalogMock.listPoints.mockImplementation(query => query.cursor === 'page-2'
        ? of({
            data: [near, unknown],
            page: { limit: 20, hasMore: false, nextCursor: null },
            meta: { catalogRevision: 'catalog:1' }
          })
        : of({
            data: [far, far],
            page: { limit: 20, hasMore: true, nextCursor: 'page-2' },
            meta: { catalogRevision: 'catalog:1' }
          }));
      component.catalogMode = true;
      component.placeDestinationContext = Object.freeze({
        reference: 'Parque San Martín', municipio: 'Santa Tecla', departamento: 'La Libertad',
        lat: 13.6769, lng: -89.2797
      });

      component.discoveryModeForMunicipality('Santa Tecla', 'La Libertad');

      expect(catalogMock.listPoints).toHaveBeenCalledTimes(2);
      expect(component.municipalityResults.map(point => point.id_destino)).toEqual(['NEAR', 'FAR', 'UNKNOWN']);
      expect(component.municipalityResults[0].referenceDistanceKm).toBeGreaterThanOrEqual(0);
      expect(component.municipalityResults[2].referenceDistanceKm).toBeNull();
      expect(component.catalogPointsHasMore).toBe(false);
    });

    it('no publica un ranking parcial cuando una pagina intermedia falla', () => {
      const first = catalogPoint();
      first.location.municipality = 'Santa Tecla';
      first.location.department = 'La Libertad';
      catalogMock.listPoints.mockImplementation(query => query.cursor
        ? throwError(() => new Error('page failed'))
        : of({
            data: [first],
            page: { limit: 20, hasMore: true, nextCursor: 'page-2' },
            meta: { catalogRevision: 'catalog:1' }
          }));
      component.catalogMode = true;
      component.placeDestinationContext = Object.freeze({
        reference: 'Parque San Martín', municipio: 'Santa Tecla', departamento: 'La Libertad',
        lat: 13.6769, lng: -89.2797
      });

      component.discoveryModeForMunicipality('Santa Tecla', 'La Libertad');

      expect(component.municipalityResults).toEqual([]);
      expect(component.displayedResults).toEqual([]);
      expect(component.errorMsg).toBe('No pudimos cargar todos los puntos de este municipio.');
    });

    it('cancela una carga municipal anterior antes de publicar el nuevo municipio', () => {
      const first = new Subject<CatalogPage<CatalogPoint>>();
      const second = new Subject<CatalogPage<CatalogPoint>>();
      catalogMock.listPoints.mockImplementation(query => query.municipality === 'Santa Tecla'
        ? first
        : second);
      component.catalogMode = true;

      component.discoveryModeForMunicipality('Santa Tecla', 'La Libertad');
      expect(first.observed).toBe(true);
      component.discoveryModeForMunicipality('Soyapango', 'San Salvador');
      expect(first.observed).toBe(false);

      const current = catalogPoint();
      current.pointId = 'CURRENT';
      current.location.municipality = 'Soyapango';
      second.next({
        data: [current],
        page: { limit: 20, hasMore: false, nextCursor: null },
        meta: { catalogRevision: 'catalog:1' }
      });
      second.complete();

      expect(component.municipalityResults.map(point => point.id_destino)).toEqual(['CURRENT']);
    });

    it('usa la copia aprobada cuando el municipio reconocido no tiene cobertura', () => {
      catalogMock.listPoints.mockReturnValue(of(emptyCatalogPage()));
      component.catalogMode = true;
      component.placeDestinationContext = Object.freeze({
        reference: 'Parque San Martín', municipio: 'Santa Tecla', departamento: 'La Libertad',
        lat: 13.6769, lng: -89.2797
      });

      component.discoveryModeForMunicipality('Santa Tecla', 'La Libertad');

      expect(component.errorMsg).toBe('No existe cobertura cercana o similar');
    });

    it('muestra el contexto de proximidad sin prometer tiempo de viaje', () => {
      component.placeDestinationContext = Object.freeze({
        reference: 'Parque San Martín', municipio: 'Santa Tecla', departamento: 'La Libertad',
        lat: 13.6769, lng: -89.2797
      });
      component.destino = 'Santa Tecla, La Libertad';
      component.destinoMunicipio = 'Santa Tecla';
      component.isDiscoveryMode = true;
      component.municipalityResults = [{
        id: 'AG_01',
        id_destino: 'AG_01',
        nombre_destino: 'Agencia Santa Tecla',
        destino_nombre: 'Agencia Santa Tecla',
        empresa: 'Pedidos Express',
        ubicacion: { municipio: 'Santa Tecla', departamento: 'La Libertad', lat: 13.68, lng: -89.28 },
        catalogAvailability: {
          status: 'OPEN', closesAt: '16:00', nextOpeningAt: null,
          evaluatedAt: '2026-10-19T10:00:00-06:00', timeZone: 'America/El_Salvador'
        },
        horarios_operativos: []
      }];
      component.displayedResults = [...component.municipalityResults];
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      const context = fixture.nativeElement.querySelector('.point-proximity-context') as HTMLElement;
      expect(context.textContent).toContain('Opciones cerca de Parque San Martín');
      expect(context.textContent).toContain('Distancia aproximada en línea recta; no indica tiempo de viaje.');
    });
  });

  it('resolves a direct point intent by canonical id when it is outside the bootstrap page', () => {
    vi.useFakeTimers();
    const point = catalogPoint();
    catalogMock.getPointDetails.mockReturnValue(of({ ...point, schedules: [] }));
    component.catalogMode = true;
    component.initialIntent = { punto: 'AG_01', accion: 'preview' };

    (component as any).applyInitialIntent();
    vi.runOnlyPendingTimers();

    expect(catalogMock.getPointDetails).toHaveBeenCalledWith('AG_01');
    expect(component.displayedResults).toHaveLength(1);
    expect(component.expandedResultCard).toEqual(expect.objectContaining({ id_destino: 'AG_01' }));
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

  describe('UI-REB-07b — estados publicos de busqueda', () => {
    function stateSurface(): HTMLElement | null {
      return fixture.nativeElement.querySelector('si-search-state-card .search-state-surface');
    }

    function refresh(): void {
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    }

    it('muestra una invitacion inicial con acceso directo al selector de destino', () => {
      const openSelectorSpy = vi
        .spyOn(component, 'openLocationSelector')
        .mockImplementation(() => undefined);
      fixture.componentRef.setInput('mapResourceMode', true);

      refresh();
      const surface = stateSurface();
      const action = fixture.nativeElement.querySelector(
        'si-search-state-card button'
      ) as HTMLButtonElement;

      expect(surface?.dataset['state']).toBe('initial');
      expect(surface?.textContent).toContain('Elige un destino');
      action.click();
      expect(openSelectorSpy).toHaveBeenCalledWith('destino');
    });

    it('muestra el estado de carga con semantica accesible', () => {
      component.loading = true;
      refresh();

      expect(stateSurface()?.dataset['state']).toBe('loading');
      expect(stateSurface()?.getAttribute('role')).toBe('status');
    });

    it('muestra el mensaje tecnico de error una sola vez dentro del contenido', () => {
      component.errorMsg = 'No pudimos completar la busqueda.';
      refresh();

      expect(stateSurface()?.dataset['state']).toBe('error');
      expect(stateSurface()?.getAttribute('role')).toBe('alert');
      expect(
        fixture.nativeElement.textContent.match(/No pudimos completar la busqueda\./g)
      ).toHaveLength(1);
    });

    it('ofrece cambiar el destino cuando no existen resultados', () => {
      const openSelectorSpy = vi
        .spyOn(component, 'openLocationSelector')
        .mockImplementation(() => undefined);
      component.destino = 'Santa Ana';
      component.destinoInputValue = 'Santa Ana';
      component.municipalityResults = [];
      component.flightResults = [];
      refresh();

      expect(stateSurface()?.dataset['state']).toBe('empty');
      expect(stateSurface()?.textContent).toContain('Probemos otro destino');
      expect(stateSurface()?.querySelector('button')?.textContent).toContain(
        'Elegir otro destino'
      );
      stateSurface()?.querySelector('button')?.click();
      expect(openSelectorSpy).toHaveBeenCalledWith('destino');
    });
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

function emptyCatalogPage<T = never>() {
  return {
    data: [] as T[],
    page: { limit: 0, hasMore: false, nextCursor: null },
    meta: { catalogRevision: 'catalog:1' }
  };
}

function catalogPoint(): CatalogPoint {
  return {
    pointId: 'AG_01',
    company: { companyId: '2', name: 'Pedidos Express', logoUrl: null },
    name: 'AGENCIA CENTRO',
    pointType: 'AGENCIA',
    location: {
      department: 'San Salvador',
      municipality: 'Soyapango',
      address: 'Centro',
      coordinates: { lat: 13.7, lng: -89.1 }
    },
    media: { imageUrl: null, mapsUrl: null },
    availability: {
      status: 'OPEN',
      closesAt: '16:00',
      nextOpeningAt: null,
      evaluatedAt: '2026-10-07T10:00:00-06:00',
      timeZone: 'America/El_Salvador'
    },
    schedulePreview: [{ daysLabel: 'Lunes a viernes', opensAt: '09:00', closesAt: '16:00' }]
  };
}
