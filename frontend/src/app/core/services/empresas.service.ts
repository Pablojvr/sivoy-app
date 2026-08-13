import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Empresa {
  id?: number;
  nombre: string;
  logoUrl?: string;
  logo_url?: string;
  logoFile?: File | null;
}

@Injectable({
  providedIn: 'root'
})
export class EmpresasService {
  private apiUrl = 'http://localhost:3000/api/empresas';

  constructor(private http: HttpClient) {}

  getEmpresas(): Observable<any> {
    return this.http.get<any>(this.apiUrl);
  }

  createEmpresa(formData: FormData): Observable<any> {
    return this.http.post<any>(this.apiUrl, formData);
  }

  updateEmpresa(id: number, formData: FormData): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, formData);
  }
}
