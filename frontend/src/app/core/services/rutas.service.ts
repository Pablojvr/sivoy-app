import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

@Injectable({
  providedIn: 'root'
})
export class RutasService {
  private apiUrl = environment.apiUrl + '/api';

  constructor(private http: HttpClient) {}

  searchRoutesByMunicipality(params: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/search-routes-by-municipality`, params);
  }

  getUpcomingRoutes(params: PointAwareRouteSearchParams): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/get-upcoming-routes`, params);
  }

  searchFlights(params: RouteSearchParams): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/search-flights`, params);
  }
}
