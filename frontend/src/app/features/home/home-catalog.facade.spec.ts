import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { CatalogService } from '../../core/services/catalog.service';
import { HomeCatalogFacade } from './home-catalog.facade';

describe('HomeCatalogFacade', () => {
  it('maps municipality facets into the search contract', () => {
    const catalog = {
      listFacets: vi.fn().mockReturnValue(of({
        data: [{ value: 'Soyapango', label: 'Soyapango', count: 4, context: { department: 'San Salvador' } }],
        page: { limit: 8, hasMore: false, nextCursor: null },
        meta: { catalogRevision: 'catalog:1' }
      }))
    };
    TestBed.configureTestingModule({
      providers: [HomeCatalogFacade, { provide: CatalogService, useValue: catalog }]
    });

    TestBed.inject(HomeCatalogFacade).searchMunicipalities('soya').subscribe(result => {
      expect(result).toEqual([
        { nombre_display: 'Soyapango', municipio: 'Soyapango', departamento: 'San Salvador', pointCount: 4 }
      ]);
    });
    expect(catalog.listFacets).toHaveBeenCalledWith({ facet: 'municipality', q: 'soya', limit: 8 });
  });

  it('maps a bounded point page into the transitional view contract', () => {
    const catalog = {
      listPoints: vi.fn().mockReturnValue(of({
        data: [catalogPoint()],
        page: { limit: 20, hasMore: true, nextCursor: 'next' },
        meta: { catalogRevision: 'catalog:1' }
      }))
    };
    TestBed.configureTestingModule({
      providers: [HomeCatalogFacade, { provide: CatalogService, useValue: catalog }]
    });

    TestBed.inject(HomeCatalogFacade).listMunicipalityPoints({
      municipality: 'Soyapango', department: 'San Salvador'
    }).subscribe(result => {
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('next');
      expect(result.points[0]).toEqual(expect.objectContaining({
        id_destino: 'AG_01',
        destino_nombre: 'AGENCIA CENTRO',
        companyId: '2'
      }));
    });
  });

  it('maps point details and marks schedules as loaded', () => {
    const catalog = {
      getPointDetails: vi.fn().mockReturnValue(of({
        ...catalogPoint(),
        schedules: [{ day: 'Lunes', opensAt: '09:00', closesAt: '16:00' }]
      }))
    };
    TestBed.configureTestingModule({
      providers: [HomeCatalogFacade, { provide: CatalogService, useValue: catalog }]
    });

    TestBed.inject(HomeCatalogFacade).getPoint('AG_01').subscribe(result => {
      expect(result.catalogDetailLoaded).toBe(true);
      expect(result.horarios_operativos).toHaveLength(1);
    });
  });
});

function catalogPoint() {
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
      status: 'OPEN' as const,
      closesAt: '16:00',
      nextOpeningAt: null,
      evaluatedAt: '2026-10-07T10:00:00-06:00',
      timeZone: 'America/El_Salvador'
    },
    schedulePreview: []
  };
}
