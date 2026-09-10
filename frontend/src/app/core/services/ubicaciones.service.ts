import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LocationUbicacion {
  lat?: number | string;
  lng?: number | string;
  municipio?: string;
  departamento?: string;
  direccion?: string;
}

export interface LocationData {
  id?: string | number;
  nombre_destino?: string;
  empresa?: string;
  ubicacion?: LocationUbicacion;
  lat?: number | string;
  lng?: number | string;
  distance?: number;
  _status?: unknown;
  horarios_operativos?: unknown;
  maps_url?: string;
  imagen_url?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UbicacionesService {
  private apiUrl = environment.apiUrl + '/api';

  constructor(private http: HttpClient) {}

  getLocations(): Observable<LocationData[]> {
    return this.http.get<LocationData[]>(`${this.apiUrl}/locations`);
  }

  createLocation(payload: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/agencias`, payload);
  }

  updateLocation(id: string | number, payload: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/locations/${id}`, payload);
  }
}
