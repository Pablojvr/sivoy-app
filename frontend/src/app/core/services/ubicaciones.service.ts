import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UbicacionesService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getLocations(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/locations`);
  }

  createLocation(formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/locations`, formData);
  }

  updateLocation(id: number, formData: FormData): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/locations/${id}`, formData);
  }
}
