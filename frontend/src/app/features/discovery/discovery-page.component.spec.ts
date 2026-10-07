import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { CatalogPoint } from '../../core/models/catalog.models';
import { CatalogService } from '../../core/services/catalog.service';
import { DiscoveryPageComponent } from './discovery-page.component';

const target: CatalogPoint = {
  pointId: 'AG_01',
  company: { companyId: '1', name: 'Pedidos Express', logoUrl: null },
  name: 'AGENCIA CENTRO',
  pointType: 'AGENCIA',
  location: {
    department: 'San Salvador', municipality: 'Soyapango', address: null,
    coordinates: { lat: null, lng: null }
  },
  media: { imageUrl: null, mapsUrl: null },
  availability: {
    status: 'CLOSED', closesAt: null, nextOpeningAt: null,
    evaluatedAt: '2026-10-07T12:00:00-06:00', timeZone: 'America/El_Salvador'
  },
  schedulePreview: []
};

describe('DiscoveryPageComponent navigation', () => {
  let component: DiscoveryPageComponent;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiscoveryPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: CatalogService,
          useValue: {
            listFacets: vi.fn().mockReturnValue(of({ data: [], page: { limit: 5, hasMore: false, nextCursor: null }, meta: { catalogRevision: 'catalog:1' } })),
            listPoints: vi.fn().mockReturnValue(of({ data: [], page: { limit: 5, hasMore: false, nextCursor: null }, meta: { catalogRevision: 'catalog:1' } }))
          }
        }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(DiscoveryPageComponent);
    component = fixture.componentInstance;
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('opens one municipality using its explicit department context', () => {
    component.openMunicipality({ municipio: 'Soyapango', departamento: 'San Salvador', pointCount: 3 });
    expect(navigate).toHaveBeenCalledWith(['/enviar'], {
      queryParams: { municipio: 'Soyapango', departamento: 'San Salvador' }
    });
  });

  it('opens one canonical point without interpreting its opaque identity', () => {
    component.openPoint(target, 'preview');
    expect(navigate).toHaveBeenCalledWith(['/enviar'], {
      queryParams: { punto: 'AG_01', accion: 'preview', vista: null }
    });
  });

  it('keeps the map as an explicit auxiliary action', () => {
    component.openMap();
    expect(navigate).toHaveBeenCalledWith(['/enviar'], { queryParams: { vista: 'mapa' } });
  });
});
