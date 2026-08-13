import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MapasService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  resolveMapsLink(url: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/resolve-maps-link`, { url });
  }
}
