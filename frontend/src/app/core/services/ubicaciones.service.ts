import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { mapLocationResponse } from '../models/location.mapper';
import {
  DeliveryPoint,
  LocationCoordinatesDto,
  LocationDto
} from '../models/location.models';

/** @deprecated Import LocationCoordinatesDto from core/models instead. */
export type LocationUbicacion = LocationCoordinatesDto;
/** @deprecated Import LocationDto from core/models instead. */
export type LocationData = LocationDto;

@Injectable({
  providedIn: 'root'
})
export class UbicacionesService {
  private apiUrl = environment.apiUrl + '/api';

  constructor(private http: HttpClient) {}

  getLocations(): Observable<DeliveryPoint[]> {
    return this.http.get<unknown>(`${this.apiUrl}/locations`).pipe(
      map(response => [...mapLocationResponse(response)])
    );
  }

  createLocation(payload: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/agencias`, payload);
  }

  updateLocation(id: string | number, payload: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/locations/${id}`, payload);
  }
}
