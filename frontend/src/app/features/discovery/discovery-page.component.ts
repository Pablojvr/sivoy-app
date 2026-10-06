import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { Router } from '@angular/router';
import { DeliveryPoint } from '../../core/models/location.models';
import { UbicacionesService } from '../../core/services/ubicaciones.service';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { DiscoveryHomeComponent, MunicipalitySummary } from './discovery-home.component';

@Component({
  selector: 'app-discovery-page',
  standalone: true,
  imports: [CommonModule, DiscoveryHomeComponent, BottomNavComponent],
  template: `
    <app-discovery-home
      [locations]="locations"
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
  locations: readonly DeliveryPoint[] = [];

  constructor(
    private ubicacionesService: UbicacionesService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.ubicacionesService.getLocations().subscribe({
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

  openPoint(point: DeliveryPoint, action: 'select' | 'preview' | 'map') {
    this.router.navigate(['/enviar'], {
      queryParams: {
        punto: point.id_destino || point.id,
        accion: action,
        vista: action === 'map' ? 'mapa' : null
      }
    });
  }

}
