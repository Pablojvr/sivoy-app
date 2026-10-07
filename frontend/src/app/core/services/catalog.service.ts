import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  CatalogFacet,
  CatalogFacetQuery,
  CatalogPage,
  CatalogPoint,
  CatalogPointDetail,
  CatalogPointQuery
} from '../models/catalog.models';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly apiUrl = `${environment.apiUrl}/api/catalog`;

  constructor(private readonly http: HttpClient) {}

  listPoints(query: CatalogPointQuery = {}): Observable<CatalogPage<CatalogPoint>> {
    return this.http.get<CatalogPage<CatalogPoint>>(`${this.apiUrl}/points`, {
      params: queryParams(query)
    });
  }

  getPointDetails(pointId: string): Observable<CatalogPointDetail> {
    return this.http.get<CatalogPointDetail>(
      `${this.apiUrl}/points/${encodeURIComponent(pointId)}`
    );
  }

  listFacets(query: CatalogFacetQuery): Observable<CatalogPage<CatalogFacet>> {
    return this.http.get<CatalogPage<CatalogFacet>>(`${this.apiUrl}/facets`, {
      params: queryParams(query)
    });
  }
}

function queryParams(query: CatalogPointQuery | CatalogFacetQuery): HttpParams {
  let params = new HttpParams();
  const values: Record<string, string | number | undefined> = {
    facet: 'facet' in query ? query.facet : undefined,
    companyId: query.companyId,
    department: query.department,
    municipality: query.municipality,
    pointType: query.pointType,
    q: query.q,
    matchMode: query.matchMode,
    limit: query.limit,
    cursor: query.cursor
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params = params.set(key, String(value));
  }
  return params;
}
