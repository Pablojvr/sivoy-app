import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { CatalogFacet, CatalogPage, CatalogPoint } from '../../core/models/catalog.models';
import { CatalogService } from '../../core/services/catalog.service';
import { MapasService } from '../../core/services/mapas.service';
import { ToastService } from '../../core/services/toast.service';
import { SavedPointSnapshot } from '../../core/saved-points/saved-points.models';
import { SavedPointsService } from '../../core/saved-points/saved-points.service';
import { DiscoveryHomeComponent } from './discovery-home.component';

class SavedPointsStub {
  readonly ids = new Set<string>();
  saveOutcome: 'saved' | 'already-saved' | 'limit-reached' | 'invalid-point' | 'storage-unavailable' = 'saved';
  readonly save = vi.fn((snapshot: SavedPointSnapshot) => {
    if (this.saveOutcome === 'saved') this.ids.add(snapshot.pointId);
    return this.saveOutcome;
  });
  readonly remove = vi.fn((pointId: string) => this.ids.delete(pointId));
  readonly isSaved = vi.fn((pointId: string) => this.ids.has(pointId));
}

const point = (pointId: string, name: string, municipality = 'Soyapango'): CatalogPoint => ({
  pointId,
  company: { companyId: '1', name: 'Pedidos Express', logoUrl: null },
  name,
  pointType: 'AGENCIA',
  location: {
    department: 'San Salvador',
    municipality,
    address: null,
    coordinates: { lat: null, lng: null }
  },
  media: { imageUrl: null, mapsUrl: null },
  availability: {
    status: 'OPEN',
    closesAt: '16:00',
    nextOpeningAt: null,
    evaluatedAt: '2026-10-07T12:00:00-06:00',
    timeZone: 'America/El_Salvador'
  },
  schedulePreview: []
});

function page<T>(data: T[], hasMore = false): CatalogPage<T> {
  return {
    data,
    page: { limit: 5, hasMore, nextCursor: null },
    meta: { catalogRevision: 'catalog:1' }
  };
}

describe('DiscoveryHomeComponent catalog flow', () => {
  let fixture: ComponentFixture<DiscoveryHomeComponent>;
  let component: DiscoveryHomeComponent;
  let service: {
    listFacets: ReturnType<typeof vi.fn>;
    listPoints: ReturnType<typeof vi.fn>;
  };
  let savedPoints: SavedPointsStub;
  let toast: { showSuccess: ReturnType<typeof vi.fn>; showError: ReturnType<typeof vi.fn> };
  let mapas: {
    searchPlaces: ReturnType<typeof vi.fn>;
    resolvePlace: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      listFacets: vi.fn().mockImplementation(query => {
        if (query.facet === 'company') {
          return of(page<CatalogFacet>([
            { value: '1', label: 'Pedidos Express', count: 184 }
          ]));
        }
        return of(page<CatalogFacet>([
          { value: 'Soyapango', label: 'Soyapango', count: 3, context: { department: 'San Salvador' } }
        ]));
      }),
      listPoints: vi.fn().mockReturnValue(of(page([point('AG_01', 'AGENCIA UNICENTRO')])) )
    };
    savedPoints = new SavedPointsStub();
    toast = { showSuccess: vi.fn(), showError: vi.fn() };
    mapas = {
      searchPlaces: vi.fn().mockReturnValue(of({ suggestions: [] })),
      resolvePlace: vi.fn().mockReturnValue(of({ success: false }))
    };
    await TestBed.configureTestingModule({
      imports: [DiscoveryHomeComponent],
      providers: [
        { provide: CatalogService, useValue: service },
        { provide: MapasService, useValue: mapas },
        { provide: SavedPointsService, useValue: savedPoints },
        { provide: ToastService, useValue: toast }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(DiscoveryHomeComponent);
    component = fixture.componentInstance;
  });

  it('loads bounded companies, municipalities and featured points without /api/locations', () => {
    fixture.detectChanges();

    expect(service.listFacets).toHaveBeenCalledWith({ facet: 'company', limit: 50 });
    expect(service.listFacets).toHaveBeenCalledWith({ facet: 'municipality', limit: 50 });
    expect(service.listPoints).toHaveBeenCalledWith({ limit: 5 });
    expect(component.companies[0].name).toBe('Pedidos Express');
    expect(component.municipalities[0]).toEqual({
      municipio: 'Soyapango',
      departamento: 'San Salvador',
      pointCount: 3
    });
    expect(component.featuredPoints[0].pointId).toBe('AG_01');
    expect(component.isLoading).toBe(false);
  });

  it('keeps the header minimal and gives the featured-point map action a visible label', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.coverage-chip')).toBeNull();
    const mapAction = fixture.nativeElement.querySelector('.map-icon-button') as HTMLButtonElement;
    expect(mapAction.textContent?.trim()).toBe('Ver en mapa');
    expect(mapAction.getAttribute('aria-label')).toContain('en el mapa');
  });

  it('presents each featured point with a clear content hierarchy and availability', () => {
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.discovery-point-card') as HTMLElement;
    expect(card.querySelector('.point-provider-copy strong')?.textContent?.trim()).toBe('Pedidos Express');
    expect(card.querySelector('h3')?.textContent?.trim()).toBe('UNICENTRO');
    expect(card.querySelector('.point-location')?.textContent?.trim()).toBe('Soyapango, San Salvador');
    expect(card.querySelector('.point-availability')?.textContent?.trim()).toBe('Abierto ahora');
    expect(card.querySelector('.point-primary-action')?.textContent).toContain('Ver detalles');
  });

  it('uses a lazy contextual image when available and a sober placeholder otherwise', () => {
    service.listPoints.mockReturnValue(of(page([
      {
        ...point('AG_PHOTO', 'AGENCIA CON FOTO'),
        media: { imageUrl: 'https://example.test/agencia.webp', mapsUrl: null }
      },
      point('AG_PLACEHOLDER', 'AGENCIA SIN FOTO')
    ])));
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.discovery-point-card') as NodeListOf<HTMLElement>;
    const image = cards[0].querySelector('.point-visual img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('https://example.test/agencia.webp');
    expect(image.getAttribute('alt')).toBe('Referencia visual de CON FOTO');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(cards[1].querySelector('.point-visual-placeholder')).not.toBeNull();
    expect(cards[1].querySelector('.point-visual img')).toBeNull();
  });

  it('keeps preview and map actions wired to the featured point', () => {
    fixture.detectChanges();
    const preview = vi.fn();
    const map = vi.fn();
    component.pointPreview.subscribe(preview);
    component.pointMap.subscribe(map);

    const card = fixture.nativeElement.querySelector('.discovery-point-card') as HTMLElement;
    card.querySelector<HTMLButtonElement>('.point-primary-action')?.click();
    card.querySelector<HTMLButtonElement>('.map-icon-button')?.click();

    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ pointId: 'AG_01' }));
    expect(map).toHaveBeenCalledWith(expect.objectContaining({ pointId: 'AG_01' }));
  });

  it('keeps the loading skeleton geometry aligned with the redesigned cards', () => {
    service.listPoints.mockReturnValue(of(page([])));
    fixture.detectChanges();

    const skeleton = fixture.nativeElement.querySelector('.point-loading') as HTMLElement;
    expect(skeleton.querySelector('.point-loading-media')).not.toBeNull();
    expect(skeleton.querySelector('.point-loading-copy')).not.toBeNull();
    expect(skeleton.querySelector('.point-loading-actions')).not.toBeNull();
  });

  it('saves and removes a featured point with one accessible bookmark action', () => {
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const saveButton = host.querySelector<HTMLButtonElement>('[data-testid="featured-save-AG_01"]');

    expect(saveButton?.getAttribute('aria-pressed')).toBe('false');
    expect(saveButton?.getAttribute('aria-label')).toContain('Guardar');

    saveButton?.click();
    fixture.detectChanges();
    expect(savedPoints.save).toHaveBeenCalledWith(expect.objectContaining({ pointId: 'AG_01' }));
    expect(saveButton?.getAttribute('aria-pressed')).toBe('true');
    expect(saveButton?.getAttribute('aria-label')).toContain('Quitar');
    expect(saveButton?.classList.contains('is-save-confirmed')).toBe(true);
    expect(toast.showSuccess).toHaveBeenCalledWith(
      'UNICENTRO ya está disponible en Guardados.',
      'Punto guardado'
    );

    saveButton?.click();
    fixture.detectChanges();
    expect(savedPoints.remove).toHaveBeenCalledWith('AG_01');
    expect(saveButton?.getAttribute('aria-pressed')).toBe('false');
    expect(saveButton?.classList.contains('is-save-confirmed')).toBe(false);
    expect(toast.showSuccess).toHaveBeenCalledTimes(1);
  });

  it('explains when the device cannot persist a featured point', () => {
    savedPoints.saveOutcome = 'storage-unavailable';
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="featured-save-AG_01"]')?.click();

    expect(toast.showError).toHaveBeenCalledWith(
      'El navegador no permitió guardar el punto en este dispositivo.',
      'No se pudo guardar'
    );
  });

  it('maps company totals and monograms without deriving them from point rows', () => {
    fixture.detectChanges();
    expect(component.companies[0]).toEqual({
      name: 'Pedidos Express',
      pointCount: 184,
      monogram: 'PE',
      accent: '#F45B78'
    });
    expect(component.pointCount).toBe(184);
    expect(component.companyCount).toBe(1);
  });

  it('finishes in a usable empty state when the initial catalog is unavailable', () => {
    service.listFacets.mockReturnValue(throwError(() => new Error('offline')));
    service.listPoints.mockReturnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    expect(component.isLoading).toBe(false);
    expect(component.companies).toEqual([]);
    expect(component.municipalities).toEqual([]);
    expect(component.featuredPoints).toEqual([]);
  });

  it('keeps successful point content when one summary request fails', () => {
    service.listFacets.mockReturnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    expect(component.companies).toEqual([]);
    expect(component.municipalities).toEqual([]);
    expect(component.featuredPoints[0].pointId).toBe('AG_01');
  });

  it('offers local suggestions from the first character after the local debounce', async () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      service.listFacets.mockClear();
      service.listPoints.mockClear();

      component.updateDestinationSearch('s');
      expect(component.searching).toBe(true);
      await vi.advanceTimersByTimeAsync(199);
      expect(service.listFacets).not.toHaveBeenCalled();
      expect(service.listPoints).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(service.listFacets).not.toHaveBeenCalled();
      expect(service.listPoints).not.toHaveBeenCalled();
      expect(component.filteredMunicipalities[0].municipio).toBe('Soyapango');
      expect(component.filteredPoints[0].pointId).toBe('AG_01');
      expect(component.searching).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending debounce when a newer query arrives', async () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      service.listFacets.mockClear();
      service.listPoints.mockClear();
      component.updateDestinationSearch('soy');
      await vi.advanceTimersByTimeAsync(100);
      component.updateDestinationSearch('apo');
      await vi.advanceTimersByTimeAsync(200);

      expect(service.listPoints).toHaveBeenCalledTimes(1);
      expect(service.listPoints).toHaveBeenCalledWith({ q: 'apo', limit: 5 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not execute a pending search after destruction', async () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      service.listFacets.mockClear();
      service.listPoints.mockClear();
      component.updateDestinationSearch('soy');
      component.ngOnDestroy();
      await vi.advanceTimersByTimeAsync(250);
      expect(service.listFacets).not.toHaveBeenCalled();
      expect(service.listPoints).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears stale suggestions immediately for an empty query', () => {
    component.filteredMunicipalities = [{ municipio: 'Viejo', departamento: 'D', pointCount: 1 }];
    component.filteredPoints = [point('OLD', 'AGENCIA VIEJA')];
    component.updateDestinationSearch('');
    expect(component.filteredMunicipalities).toEqual([]);
    expect(component.filteredPoints).toEqual([]);
    expect(component.isDestinationSearchActive).toBe(true);
  });

  it('keeps current results and clears loading for an equivalent normalized edit', async () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      component.updateDestinationSearch('Soy');
      await vi.advanceTimersByTimeAsync(200);
      const calls = service.listPoints.mock.calls.length;

      component.updateDestinationSearch('  SÓY  ');

      expect(component.searching).toBe(false);
      expect(component.filteredMunicipalities[0].municipio).toBe('Soyapango');
      expect(service.listPoints).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes suggestions with Escape semantics without discarding the query or results', () => {
    fixture.detectChanges();
    component.destinationSearchQuery = 'soy';
    component.filteredMunicipalities = [{ municipio: 'Soyapango', departamento: 'San Salvador', pointCount: 3 }];
    component.isDestinationSearchActive = true;

    component.closeDestinationSearch();
    component.activateDestinationSearch();

    expect(component.destinationSearchQuery).toBe('soy');
    expect(component.filteredMunicipalities[0].municipio).toBe('Soyapango');
    expect(component.isDestinationSearchActive).toBe(true);
  });

  it('queries Places automatically after 350 ms only when local matches are weak', async () => {
    vi.useFakeTimers();
    try {
      service.listFacets.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      service.listPoints.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      mapas.searchPlaces.mockReturnValue(of({
        suggestions: [{ placeId: 'place-1', text: 'Parque San Martín, Santa Tecla' }]
      }));
      fixture.detectChanges();

      component.updateDestinationSearch('  PÁRQUE   SAN  ');
      await vi.advanceTimersByTimeAsync(349);
      expect(mapas.searchPlaces).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(mapas.searchPlaces).toHaveBeenCalledTimes(1);
      expect(mapas.searchPlaces).toHaveBeenCalledWith('parque san', expect.any(String));
      expect(component.externalPlaceSuggestions).toEqual([
        { placeId: 'place-1', text: 'Parque San Martín, Santa Tecla' }
      ]);
      expect(component.externalPlaceSearchState).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps Places dormant when the optional provider is not configured', async () => {
    vi.useFakeTimers();
    try {
      service.listFacets.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      service.listPoints.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      mapas.searchPlaces.mockReturnValue(of({
        providerAvailable: false,
        suggestions: []
      }));
      fixture.detectChanges();

      component.updateDestinationSearch('parque');
      await vi.advanceTimersByTimeAsync(350);

      expect(mapas.searchPlaces).toHaveBeenCalledTimes(1);
      expect(component.externalPlaceSuggestions).toEqual([]);
      expect(component.externalPlaceSearchState).toBe('idle');
      expect(component.externalPlaceProviderAvailable).toBe(false);
      expect(component.externalPlaceSearchError).toBe('');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Prueba con otro municipio o punto de entrega.');

      component.updateDestinationSearch('hospital');
      await vi.advanceTimersByTimeAsync(350);
      expect(mapas.searchPlaces).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not query Places for fewer than three characters, more than 128, or a strong local match', async () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();

      component.updateDestinationSearch('so');
      await vi.advanceTimersByTimeAsync(500);
      component.updateDestinationSearch('soy');
      await vi.advanceTimersByTimeAsync(500);
      component.updateDestinationSearch('x'.repeat(129));
      await vi.advanceTimersByTimeAsync(500);

      expect(mapas.searchPlaces).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips the bounded catalog query but still searches Places for 81 to 128 characters', async () => {
    vi.useFakeTimers();
    try {
      const longPlace = 'x'.repeat(90);
      fixture.detectChanges();

      component.updateDestinationSearch(longPlace);
      await vi.advanceTimersByTimeAsync(350);

      expect(service.listFacets).not.toHaveBeenCalledWith(expect.objectContaining({ q: longPlace }));
      expect(service.listPoints).not.toHaveBeenCalledWith(expect.objectContaining({ q: longPlace }));
      expect(mapas.searchPlaces).toHaveBeenCalledWith(longPlace, expect.any(String));
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an older external response so it cannot replace the latest query', async () => {
    vi.useFakeTimers();
    try {
      const firstResponse = new Subject<{ suggestions: Array<{ placeId: string; text: string }> }>();
      const secondResponse = new Subject<{ suggestions: Array<{ placeId: string; text: string }> }>();
      service.listFacets.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      service.listPoints.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      mapas.searchPlaces.mockImplementation((query: string) => query === 'parque'
        ? firstResponse
        : secondResponse);
      fixture.detectChanges();

      component.updateDestinationSearch('parque');
      await vi.advanceTimersByTimeAsync(350);
      component.updateDestinationSearch('hospital');
      await vi.advanceTimersByTimeAsync(350);
      secondResponse.next({ suggestions: [{ placeId: 'new', text: 'Hospital nuevo' }] });
      firstResponse.next({ suggestions: [{ placeId: 'old', text: 'Parque anterior' }] });

      expect(component.externalPlaceSuggestions).toEqual([
        { placeId: 'new', text: 'Hospital nuevo' }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves weak local results and exposes only a generic error when Places fails', async () => {
    vi.useFakeTimers();
    try {
      service.listFacets.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      service.listPoints.mockImplementation(query => query.q
        ? of(page([point('LOCAL', 'AGENCIA CENTRAL')]))
        : of(page([])));
      mapas.searchPlaces.mockReturnValue(throwError(() => ({
        status: 500,
        error: { error: 'stack trace and provider quota' }
      })));
      fixture.detectChanges();

      component.updateDestinationSearch('parque');
      await vi.advanceTimersByTimeAsync(350);

      expect(component.filteredPoints.map(item => item.pointId)).toEqual(['LOCAL']);
      expect(component.externalPlaceSearchState).toBe('error');
      expect(component.externalPlaceSearchError).toBe('No pudimos buscar lugares en este momento.');
      expect(mapas.searchPlaces).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rotates the external session token after an autocomplete error', async () => {
    vi.useFakeTimers();
    try {
      service.listFacets.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      service.listPoints.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      mapas.searchPlaces
        .mockReturnValueOnce(throwError(() => new Error('provider failed')))
        .mockReturnValueOnce(of({ suggestions: [] }));
      fixture.detectChanges();

      component.updateDestinationSearch('parque');
      await vi.advanceTimersByTimeAsync(350);
      const failedToken = mapas.searchPlaces.mock.calls[0][1];
      component.updateDestinationSearch('hospital');
      await vi.advanceTimersByTimeAsync(350);
      const retryToken = mapas.searchPlaces.mock.calls[1][1];

      expect(retryToken).not.toBe(failedToken);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rotates the external session token after clearing without selecting a suggestion', async () => {
    vi.useFakeTimers();
    try {
      service.listFacets.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      service.listPoints.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      fixture.detectChanges();

      component.updateDestinationSearch('parque');
      await vi.advanceTimersByTimeAsync(350);
      const firstToken = mapas.searchPlaces.mock.calls[0][1];
      component.clearDestinationSearch();
      component.updateDestinationSearch('hospital');
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(350);
      const secondToken = mapas.searchPlaces.mock.calls[1][1];

      expect(firstToken).toEqual(expect.any(String));
      expect(secondToken).toEqual(expect.any(String));
      expect(secondToken).not.toBe(firstToken);
      expect(component.externalPlaceSuggestions).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not emit a destination or retry when external suggestions merely arrive', async () => {
    vi.useFakeTimers();
    try {
      service.listFacets.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      service.listPoints.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      mapas.searchPlaces.mockReturnValue(of({
        suggestions: [{ placeId: 'place-1', text: '<img src=x onerror=alert(1)>' }]
      }));
      const municipalitySelected = vi.fn();
      const pointSelected = vi.fn();
      component.municipalitySelected.subscribe(municipalitySelected);
      component.pointPreview.subscribe(pointSelected);
      fixture.detectChanges();

      component.updateDestinationSearch('parque');
      await vi.advanceTimersByTimeAsync(1000);

      expect(component.externalPlaceSuggestions[0].text).toBe('<img src=x onerror=alert(1)>');
      expect(municipalitySelected).not.toHaveBeenCalled();
      expect(pointSelected).not.toHaveBeenCalled();
      expect(mapas.searchPlaces).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the pending external debounce when destroyed', async () => {
    vi.useFakeTimers();
    try {
      service.listFacets.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      service.listPoints.mockImplementation(query => query.q ? of(page([])) : of(page([])));
      fixture.detectChanges();

      component.updateDestinationSearch('parque');
      await vi.advanceTimersByTimeAsync(200);
      component.ngOnDestroy();
      await vi.advanceTimersByTimeAsync(500);

      expect(mapas.searchPlaces).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps an empty bounded result when search providers fail', async () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      service.listFacets.mockImplementation(query => query.q
        ? throwError(() => new Error('offline'))
        : of(page([])));
      component.updateDestinationSearch('soy');
      await vi.advanceTimersByTimeAsync(200);
      expect(component.filteredMunicipalities).toEqual([]);
      expect(component.filteredPoints).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits only after a concrete municipality or point is selected', () => {
    fixture.detectChanges();
    let selectedMunicipality: string | undefined;
    let selectedPoint: string | undefined;
    component.municipalitySelected.subscribe(value => selectedMunicipality = value.municipio);
    component.pointPreview.subscribe(value => selectedPoint = value.pointId);

    component.activateDestinationSearch();
    expect(selectedMunicipality).toBeUndefined();
    expect(selectedPoint).toBeUndefined();

    component.selectMunicipalitySuggestion(component.municipalities[0]);
    component.selectPointSuggestion(component.featuredPoints[0]);
    expect(selectedMunicipality).toBe('Soyapango');
    expect(selectedPoint).toBe('AG_01');
    expect(component.destinationSearchQuery).toBe('');
    expect(component.isDestinationSearchActive).toBe(false);
  });

  it('clears the query without navigation and preserves the active search surface', () => {
    let selected = false;
    component.pointPreview.subscribe(() => selected = true);
    component.destinationSearchQuery = 'soy';
    component.filteredPoints = [point('AG_01', 'AGENCIA UNICENTRO')];
    component.clearDestinationSearch();
    expect(selected).toBe(false);
    expect(component.destinationSearchQuery).toBe('');
    expect(component.filteredPoints).toEqual([]);
    expect(component.isDestinationSearchActive).toBe(true);
  });

  it('reads browser input values without coupling to keyboard events', () => {
    const input = document.createElement('input');
    input.value = 'san miguel';
    component.onDestinationSearchInput({ target: input } as unknown as Event);
    expect(component.destinationSearchQuery).toBe('san miguel');
  });

  it('uses canonical point fields for labels and stable tracking', () => {
    const target = point('AG_02', 'AGENCIA SAN MIGUEL', 'San Miguel');
    expect(component.pointName(target)).toBe('SAN MIGUEL');
    expect(component.locationLabel(target)).toBe('San Miguel, San Salvador');
    expect(component.trackPoint(0, target)).toBe('AG_02');
  });

  it('tracks municipalities by name and department to keep homonyms distinct', () => {
    expect(component.trackMunicipality(0, {
      municipio: 'San Antonio', departamento: 'Santa Ana', pointCount: 1
    })).toBe('San Antonio-Santa Ana');
  });

  it('resolves an explicitly selected place and emits only after explicit confirmation', () => {
    fixture.detectChanges();
    mapas.resolvePlace.mockReturnValue(of(resolvedPlace({
      name: 'Parque San Martín',
      municipality: 'Santa Tecla',
      department: 'La Libertad'
    })));
    service.listFacets.mockReturnValue(of(page<CatalogFacet>([
      { value: 'Santa Tecla', label: 'Santa Tecla', count: 4, context: { department: 'La Libertad' } }
    ])));
    const emitted = vi.fn();
    component.placeDestinationSelected.subscribe(emitted);

    component.selectExternalPlaceSuggestion({
      placeId: 'place-1',
      text: 'Parque San Martín, Santa Tecla',
      mainText: 'Parque San Martín'
    });

    expect(mapas.resolvePlace).toHaveBeenCalledWith('place-1', expect.any(String));
    expect(service.listFacets).toHaveBeenCalledWith({
      facet: 'municipality', q: 'Santa Tecla', limit: 50
    });
    const context = Object.freeze({
      reference: 'Parque San Martín',
      municipio: 'Santa Tecla',
      departamento: 'La Libertad',
      lat: 13.6769,
      lng: -89.2797
    });
    expect(emitted).not.toHaveBeenCalled();
    expect(component.resolvedPlaceContext).toEqual(context);
    expect(component.externalPlaceResolutionState).toBe('resolved');
    component.confirmResolvedPlaceDestination();
    expect(emitted).toHaveBeenCalledWith(context);
  });

  it('rejects a resolved place outside El Salvador or without valid coordinates', () => {
    fixture.detectChanges();
    const emitted = vi.fn();
    component.placeDestinationSelected.subscribe(emitted);
    mapas.resolvePlace.mockReturnValue(of(resolvedPlace({ countryCode: 'GT' })));

    component.selectExternalPlaceSuggestion({ placeId: 'outside', text: 'Lugar externo' });

    expect(service.listFacets).not.toHaveBeenCalledWith(expect.objectContaining({ q: 'Santa Tecla' }));
    expect(emitted).not.toHaveBeenCalled();
    expect(component.externalPlaceResolutionState).toBe('uncovered');
    expect(component.externalPlaceResolutionError).toBe('No existe cobertura cercana o similar');

    mapas.resolvePlace.mockReturnValue(of(resolvedPlace({ latitude: 120 })));
    component.selectExternalPlaceSuggestion({ placeId: 'invalid-coordinate', text: 'Lugar inválido' });
    expect(emitted).not.toHaveBeenCalled();
    expect(component.externalPlaceResolutionState).toBe('uncovered');
  });

  it('requires an exact municipality and department match for homonyms', () => {
    fixture.detectChanges();
    mapas.resolvePlace.mockReturnValue(of(resolvedPlace({
      municipality: 'San Antonio', department: 'La Paz'
    })));
    service.listFacets.mockReturnValue(of(page<CatalogFacet>([
      { value: 'San Antonio', label: 'San Antonio', count: 2, context: { department: 'Santa Ana' } }
    ])));
    const emitted = vi.fn();
    component.placeDestinationSelected.subscribe(emitted);

    component.selectExternalPlaceSuggestion({ placeId: 'homonym', text: 'San Antonio' });

    expect(emitted).not.toHaveBeenCalled();
    expect(component.externalPlaceResolutionState).toBe('uncovered');
  });

  it('ignores a late resolution after a newer place is selected', () => {
    fixture.detectChanges();
    const oldResolution = new Subject<unknown>();
    mapas.resolvePlace.mockImplementation((placeId: string) => placeId === 'old'
      ? oldResolution
      : of(resolvedPlace({ name: 'Hospital Nuevo' })));
    service.listFacets.mockReturnValue(of(page<CatalogFacet>([
      { value: 'Santa Tecla', label: 'Santa Tecla', count: 4, context: { department: 'La Libertad' } }
    ])));
    const emitted = vi.fn();
    component.placeDestinationSelected.subscribe(emitted);

    component.selectExternalPlaceSuggestion({ placeId: 'old', text: 'Lugar anterior' });
    component.selectExternalPlaceSuggestion({ placeId: 'new', text: 'Hospital Nuevo' });
    oldResolution.next(resolvedPlace({ name: 'Lugar anterior' }));

    expect(emitted).not.toHaveBeenCalled();
    expect(component.resolvedPlaceContext).toEqual(expect.objectContaining({ reference: 'Hospital Nuevo' }));
    component.confirmResolvedPlaceDestination();
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('renders external places after local sections with an explicit selection and privacy notice', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoveryHomeComponent);
    component = fixture.componentInstance;
    component.isDestinationSearchActive = true;
    component.destinationSearchQuery = 'parque';
    component.searching = false;
    component.filteredPoints = [point('LOCAL', 'AGENCIA LOCAL')];
    component.externalPlaceSearchState = 'ready';
    component.externalPlaceSuggestions = [{
      placeId: 'place-1', mainText: 'Parque San Martín', text: 'Parque San Martín, Santa Tecla',
      secondaryText: 'Santa Tecla, La Libertad'
    }];
    const select = vi.spyOn(component, 'selectExternalPlaceSuggestion');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const localSection = host.querySelector('.destination-local-results');
    const externalSection = host.querySelector('.destination-external-results');
    const externalButton = host.querySelector<HTMLButtonElement>('.external-place-suggestion');
    expect(localSection).not.toBeNull();
    expect(externalSection).not.toBeNull();
    expect(localSection!.compareDocumentPosition(externalSection!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(externalSection?.textContent).toContain('Lugares en El Salvador');
    expect(externalSection?.textContent).toContain('Al buscar lugares, el texto se envía a Google.');
    externalButton?.click();
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ placeId: 'place-1' }));
  });

  it('renders municipality suggestions before delivery points', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoveryHomeComponent);
    component = fixture.componentInstance;
    component.isDestinationSearchActive = true;
    component.destinationSearchQuery = 'soya';
    component.searching = false;
    component.filteredMunicipalities = [
      { municipio: 'Soyapango', departamento: 'San Salvador', pointCount: 4 }
    ];
    component.filteredPoints = [point('LOCAL', 'AGENCIA SOYAPANGO')];
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const municipalities = host.querySelector('#municipality-suggestions-title')?.parentElement;
    const points = host.querySelector('#point-suggestions-title')?.parentElement;
    expect(municipalities).not.toBeNull();
    expect(points).not.toBeNull();
    expect(municipalities!.compareDocumentPosition(points!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders a distinct confirmation action before navigating to covered points', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoveryHomeComponent);
    component = fixture.componentInstance;
    component.isDestinationSearchActive = true;
    component.destinationSearchQuery = 'parque';
    component.externalPlaceResolutionState = 'resolved';
    component.resolvedPlaceContext = {
      reference: 'Parque San Martín', municipio: 'Santa Tecla', departamento: 'La Libertad',
      lat: 13.6769, lng: -89.2797
    };
    const confirm = vi.spyOn(component, 'confirmResolvedPlaceDestination');
    fixture.detectChanges();

    const action = fixture.nativeElement.querySelector('.external-place-confirm') as HTMLButtonElement;
    expect(action.textContent).toContain('Ver puntos de Santa Tecla');
    action.click();
    expect(confirm).toHaveBeenCalled();
  });

  it('shows the exact uncovered copy without hiding the search surface', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoveryHomeComponent);
    component = fixture.componentInstance;
    component.isDestinationSearchActive = true;
    component.destinationSearchQuery = 'parque';
    component.searching = false;
    component.externalPlaceResolutionState = 'uncovered';
    component.externalPlaceResolutionError = 'No existe cobertura cercana o similar';
    fixture.detectChanges();

    const state = fixture.nativeElement.querySelector('.external-place-state.is-uncovered') as HTMLElement;
    expect(state.getAttribute('role')).toBe('status');
    expect(state.textContent).toContain('No existe cobertura cercana o similar');
    expect(fixture.nativeElement.querySelector('#destination-search-input')).not.toBeNull();
  });
});

function resolvedPlace(overrides: {
  name?: string;
  municipality?: string;
  department?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
} = {}): unknown {
  return {
    success: true,
    place: {
      placeId: 'place-1',
      name: overrides.name ?? 'Parque San Martín',
      formattedAddress: 'Santa Tecla, La Libertad, El Salvador',
      addressComponents: [
        { longText: overrides.municipality ?? 'Santa Tecla', shortText: 'Santa Tecla', types: ['locality'] },
        { longText: overrides.department ?? 'La Libertad', shortText: 'La Libertad', types: ['administrative_area_level_1'] },
        { longText: 'El Salvador', shortText: overrides.countryCode ?? 'SV', types: ['country'] }
      ],
      location: {
        latitude: overrides.latitude ?? 13.6769,
        longitude: overrides.longitude ?? -89.2797
      }
    }
  };
}
