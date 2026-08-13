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

@Injectable({
  providedIn: 'root'
})
export class RutasService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  searchRoutesByMunicipality(params: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/search-routes-by-municipality`, params);
  }

  searchFlights(params: RouteSearchParams): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/search-flights`, params);
  }
}
