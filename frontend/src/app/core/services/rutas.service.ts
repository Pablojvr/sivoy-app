import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  SearchFlightsResponseDto,
  GetUpcomingRoutesResponseDto,
  SearchRoutesByMunicipalityResponseDto,
  SearchFlightsPayload,
  GetUpcomingRoutesPayload,
  SearchRoutesByMunicipalityPayload
} from './route-api.contracts';

export interface RouteSearchParams {
  origen: string;
  destino: string;
  origenIsPin: boolean;
  dropoffDate: string;
  dropoffTime: string;
}

export interface PointAwareRouteSearchParams {
  origen: string[];
  destino: string[];
  dropoff_date: string;
  dropoff_time: string;
}

export type SearchFlightsTransitionPayload = RouteSearchParams & SearchFlightsPayload;
export type GetUpcomingRoutesTransitionPayload = PointAwareRouteSearchParams & Partial<GetUpcomingRoutesPayload>;

@Injectable({
  providedIn: 'root'
})
export class RutasService {
  private apiUrl = environment.apiUrl + '/api';

  constructor(private http: HttpClient) {}

  searchRoutesByMunicipality(params: SearchRoutesByMunicipalityPayload): Observable<SearchRoutesByMunicipalityResponseDto> {
    return this.http.post<SearchRoutesByMunicipalityResponseDto>(
      `${this.apiUrl}/search-routes-by-municipality`, params
    );
  }

  getUpcomingRoutes(params: GetUpcomingRoutesTransitionPayload | GetUpcomingRoutesPayload): Observable<GetUpcomingRoutesResponseDto> {
    return this.http.post<GetUpcomingRoutesResponseDto>(
      `${this.apiUrl}/get-upcoming-routes`, params
    );
  }

  searchFlights(params: SearchFlightsTransitionPayload | SearchFlightsPayload): Observable<SearchFlightsResponseDto> {
    return this.http.post<SearchFlightsResponseDto>(
      `${this.apiUrl}/search-flights`, params
    );
  }
}
