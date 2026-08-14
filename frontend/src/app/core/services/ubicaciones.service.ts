import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UbicacionesService {
  private apiUrl = environment.apiUrl + '/api';

  constructor(private http: HttpClient) {}

  getLocations(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/locations`);
  }

  createLocation(payload: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/agencias`, payload);
  }

  updateLocation(id: number, payload: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/locations/${id}`, payload);
  }
}
