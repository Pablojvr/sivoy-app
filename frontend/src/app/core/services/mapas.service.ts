import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MapasService {
  private apiUrl = environment.apiUrl + '/api';

  constructor(private http: HttpClient) {}

  resolveMapsLink(url: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/resolve-maps-link`, { url });
  }

  searchPlaces(query: string, sessionToken: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/places/autocomplete`, { query, sessionToken });
  }

  resolvePlace(placeId: string, sessionToken: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/places/resolve`, { placeId, sessionToken });
  }
}
