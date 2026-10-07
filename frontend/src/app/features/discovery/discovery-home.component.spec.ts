import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { CatalogFacet, CatalogPage, CatalogPoint } from '../../core/models/catalog.models';
import { CatalogService } from '../../core/services/catalog.service';
import { DiscoveryHomeComponent } from './discovery-home.component';

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
    await TestBed.configureTestingModule({
      imports: [DiscoveryHomeComponent],
      providers: [{ provide: CatalogService, useValue: service }]
    }).compileComponents();
    fixture = TestBed.createComponent(DiscoveryHomeComponent);
    component = fixture.componentInstance;
  });

  it('loads bounded companies, municipalities and featured points without /api/locations', () => {
    fixture.detectChanges();

    expect(service.listFacets).toHaveBeenCalledWith({ facet: 'company', limit: 50 });
    expect(service.listFacets).toHaveBeenCalledWith({ facet: 'municipality', limit: 5 });
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

  it('debounces search and asks the backend for bounded suggestions', async () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges();
      service.listFacets.mockClear();
      service.listPoints.mockClear();

      component.updateDestinationSearch('s');
      await vi.advanceTimersByTimeAsync(250);
      expect(service.listFacets).not.toHaveBeenCalled();
      expect(service.listPoints).not.toHaveBeenCalled();

      component.updateDestinationSearch('soy');
      expect(component.searching).toBe(true);
      await vi.advanceTimersByTimeAsync(199);
      expect(service.listPoints).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(service.listFacets).toHaveBeenCalledWith({ facet: 'municipality', q: 'soy', limit: 5 });
      expect(service.listPoints).toHaveBeenCalledWith({ q: 'soy', limit: 5 });
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

  it('clears stale suggestions immediately for an empty or one-letter query', () => {
    component.filteredMunicipalities = [{ municipio: 'Viejo', departamento: 'D', pointCount: 1 }];
    component.filteredPoints = [point('OLD', 'AGENCIA VIEJA')];
    component.updateDestinationSearch('x');
    expect(component.filteredMunicipalities).toEqual([]);
    expect(component.filteredPoints).toEqual([]);
    expect(component.isDestinationSearchActive).toBe(true);
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
});
