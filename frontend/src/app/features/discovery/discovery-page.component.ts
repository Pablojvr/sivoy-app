import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { DiscoveryHomeComponent } from '../home/discovery-home.component';

@Component({
  selector: 'app-discovery-page',
  standalone: true,
  imports: [CommonModule, DiscoveryHomeComponent],
  template: `
    <app-discovery-home
      [locations]="locations"
      (destinationSearch)="openDestinationSearch()"
      (mapExplore)="openMap()"
      (companySelected)="openCompany($event)"
      (municipalitySelected)="openMunicipality($event)"
      (pointSelected)="openPoint($event, 'select')"
      (pointPreview)="openPoint($event, 'preview')">
    </app-discovery-home>
  `,
  styles: [`
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100dvh;
      overflow: hidden;
    }
  `]
})
export class DiscoveryPageComponent {
  locations: any[] = [];

  constructor(private http: HttpClient, private router: Router, private cdr: ChangeDetectorRef) {
    this.http.get<any[]>(`${environment.apiUrl}/api/locations`).subscribe({
      next: locations => {
        this.locations = locations || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.locations = [];
        this.cdr.detectChanges();
      }
    });
  }

  openDestinationSearch() {
    this.router.navigate(['/enviar'], { queryParams: { buscar: 'destino' } });
  }

  openMap() {
    this.router.navigate(['/enviar']);
  }

  openCompany(company: string) {
    this.router.navigate(['/enviar'], { queryParams: { empresa: company } });
  }

  openMunicipality(municipality: any) {
    this.router.navigate(['/enviar'], {
      queryParams: {
        municipio: municipality.municipio,
        departamento: municipality.departamento
      }
    });
  }

  openPoint(point: any, action: 'select' | 'preview') {
    this.router.navigate(['/enviar'], {
      queryParams: {
        punto: point.id_destino || point.id,
        accion: action
      }
    });
  }
}
