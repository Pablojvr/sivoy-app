import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { CatalogLocationView, catalogPointToLocation } from '../../core/models/catalog-location.adapter';
import { CatalogService } from '../../core/services/catalog.service';

export interface HomeMunicipalityOption {
  nombre_display: string;
  municipio: string;
  departamento: string;
  pointCount: number;
}

export interface HomeCatalogPoint extends CatalogLocationView {
  readonly destino_nombre: string;
  readonly distance: number;
  readonly catalogDetailLoaded?: boolean;
}

export interface HomeCatalogPointPage {
  readonly points: HomeCatalogPoint[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

@Injectable({ providedIn: 'root' })
export class HomeCatalogFacade {
  constructor(private readonly catalog: CatalogService) {}

  searchMunicipalities(query: string): Observable<HomeMunicipalityOption[]> {
    const normalized = query.trim();
    return this.catalog.listFacets({
      facet: 'municipality',
      ...(normalized.length >= 2 ? { q: normalized } : {}),
      limit: 8
    }).pipe(map(page => page.data.map(facet => ({
      nombre_display: facet.label,
      municipio: facet.label,
      departamento: facet.context?.department || '',
      pointCount: facet.count
    }))));
  }

  listMunicipalityPoints(query: {
    municipality: string;
    department?: string;
    cursor?: string;
  }): Observable<HomeCatalogPointPage> {
    return this.catalog.listPoints({
      municipality: query.municipality,
      ...(query.department ? { department: query.department } : {}),
      limit: 20,
      ...(query.cursor ? { cursor: query.cursor } : {})
    }).pipe(map(page => ({
      points: page.data.map(point => this.toHomePoint(catalogPointToLocation(point))),
      hasMore: page.page.hasMore,
      nextCursor: page.page.nextCursor
    })));
  }

  getPoint(pointId: string): Observable<HomeCatalogPoint> {
    return this.catalog.getPointDetails(pointId).pipe(map(point => ({
      ...this.toHomePoint(catalogPointToLocation(point)),
      catalogDetailLoaded: true
    })));
  }

  private toHomePoint(point: CatalogLocationView): HomeCatalogPoint {
    return {
      ...point,
      destino_nombre: point.nombre_destino,
      distance: 9999
    };
  }
}
