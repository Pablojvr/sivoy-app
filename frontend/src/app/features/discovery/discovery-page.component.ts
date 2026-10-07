import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CatalogPoint } from '../../core/models/catalog.models';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { DiscoveryHomeComponent, MunicipalitySummary } from './discovery-home.component';

@Component({
  selector: 'app-discovery-page',
  standalone: true,
  imports: [CommonModule, DiscoveryHomeComponent, BottomNavComponent],
  template: `
    <app-discovery-home
      (mapExplore)="openMap()"
      (companySelected)="openCompany($event)"
      (municipalitySelected)="openMunicipality($event)"
      (pointSelected)="openPoint($event, 'select')"
      (pointPreview)="openPoint($event, 'preview')"
      (pointMap)="openPoint($event, 'map')">
    </app-discovery-home>
    <app-bottom-nav activeTab="inicio"></app-bottom-nav>
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
  constructor(private router: Router) {}

  openMap() {
    this.router.navigate(['/enviar'], { queryParams: { vista: 'mapa' } });
  }

  openCompany(company: string) {
    this.router.navigate(['/enviar'], { queryParams: { empresa: company } });
  }

  openMunicipality(municipality: MunicipalitySummary) {
    this.router.navigate(['/enviar'], {
      queryParams: {
        municipio: municipality.municipio,
        departamento: municipality.departamento
      }
    });
  }

  openPoint(point: CatalogPoint, action: 'select' | 'preview' | 'map') {
    this.router.navigate(['/enviar'], {
      queryParams: {
        punto: point.pointId,
        accion: action,
        vista: action === 'map' ? 'mapa' : null
      }
    });
  }

}
