import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../../environments/environment';
import { CatalogService } from './catalog.service';
import { CatalogPage, CatalogPoint, CatalogFacet } from '../models/catalog.models';

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CatalogService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests one bounded point page with only explicit filters', () => {
    const expected: CatalogPage<CatalogPoint> = {
      data: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:1' }
    };

    service.listPoints({ municipality: 'Soyapango', q: 'centro', limit: 20 })
      .subscribe(result => expect(result).toEqual(expected));

    const request = http.expectOne(req => req.url === `${environment.apiUrl}/api/catalog/points`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['limit', 'municipality', 'q']);
    expect(request.request.params.get('municipality')).toBe('Soyapango');
    expect(request.request.params.get('q')).toBe('centro');
    expect(request.request.params.get('limit')).toBe('20');
    request.flush(expected);
  });

  it('requests full point details using the opaque public identity', () => {
    const expected = { pointId: 'AG 01', schedules: [] } as unknown as CatalogPoint;

    service.getPointDetails('AG 01').subscribe(result => expect(result).toEqual(expected));

    const request = http.expectOne(`${environment.apiUrl}/api/catalog/points/AG%2001`);
    expect(request.request.method).toBe('GET');
    request.flush(expected);
  });

  it('requests one selected facet instead of downloading the catalog', () => {
    const expected: CatalogPage<CatalogFacet> = {
      data: [{ value: 'Soyapango', label: 'Soyapango', count: 3 }],
      page: { limit: 20, hasMore: false, nextCursor: null },
      meta: { catalogRevision: 'catalog:1' }
    };

    service.listFacets({ facet: 'municipality', department: 'San Salvador', q: 'soy' })
      .subscribe(result => expect(result).toEqual(expected));

    const request = http.expectOne(req => req.url === `${environment.apiUrl}/api/catalog/facets`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('facet')).toBe('municipality');
    expect(request.request.params.get('department')).toBe('San Salvador');
    expect(request.request.params.get('q')).toBe('soy');
    request.flush(expected);
  });
});
