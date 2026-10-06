import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { DeliveryPoint } from '../../core/models/location.models';
import { fuzzySearch } from '../../core/utils/fuzzy-search';

interface CompanySummary {
  name: string;
  pointCount: number;
  municipalityCount: number;
  monogram: string;
  accent: string;
}

export interface MunicipalitySummary {
  municipio: string;
  departamento: string;
  pointCount: number;
}

@Component({
  selector: 'app-discovery-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './discovery-home.component.html',
  styleUrl: './discovery-home.component.css'
})
export class DiscoveryHomeComponent implements OnChanges {
  @Input() locations: readonly DeliveryPoint[] = [];

  @Output() mapExplore = new EventEmitter<void>();
  @Output() companySelected = new EventEmitter<string>();
  @Output() municipalitySelected = new EventEmitter<MunicipalitySummary>();
  @Output() pointSelected = new EventEmitter<DeliveryPoint>();
  @Output() pointPreview = new EventEmitter<DeliveryPoint>();
  @Output() pointMap = new EventEmitter<DeliveryPoint>();

  companies: CompanySummary[] = [];
  municipalities: MunicipalitySummary[] = [];
  featuredPoints: DeliveryPoint[] = [];
  totalMunicipalities = 0;
  destinationSearchQuery = '';
  isDestinationSearchActive = false;
  filteredMunicipalities: MunicipalitySummary[] = [];
  filteredPoints: DeliveryPoint[] = [];

  private readonly accents = ['#F45B78', '#B8EE4A', '#A9DDF5', '#FFD18A'];
  private allMunicipalities: MunicipalitySummary[] = [];

  ngOnChanges(changes: SimpleChanges) {
    if (changes['locations']) this.buildDiscoveryData();
  }

  get isLoading(): boolean {
    return this.locations.length === 0;
  }

  get companyCount(): number {
    return this.companies.length;
  }

  get pointCount(): number {
    return this.locations.length;
  }

  get hasDestinationSearchResults(): boolean {
    return this.filteredMunicipalities.length > 0 || this.filteredPoints.length > 0;
  }

  activateDestinationSearch(): void {
    this.isDestinationSearchActive = true;
  }

  updateDestinationSearch(query: string): void {
    this.destinationSearchQuery = query;
    this.isDestinationSearchActive = true;
    this.refreshDestinationSearchResults();
  }

  onDestinationSearchInput(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) this.updateDestinationSearch(input.value);
  }

  clearDestinationSearch(input?: HTMLInputElement): void {
    this.destinationSearchQuery = '';
    this.isDestinationSearchActive = true;
    this.refreshDestinationSearchResults();
    input?.focus();
  }

  closeDestinationSearch(): void {
    this.isDestinationSearchActive = false;
  }

  selectMunicipalitySuggestion(municipality: MunicipalitySummary): void {
    this.resetDestinationSearch();
    this.municipalitySelected.emit(municipality);
  }

  selectPointSuggestion(point: DeliveryPoint): void {
    this.resetDestinationSearch();
    this.pointPreview.emit(point);
  }

  pointName(point: DeliveryPoint): string {
    return (point?.nombre_destino || 'Punto de entrega')
      .replace(/^AGENCIA\s+/i, '');
  }

  locationLabel(point: DeliveryPoint): string {
    return [point?.ubicacion?.municipio, point?.ubicacion?.departamento].filter(Boolean).join(', ');
  }

  trackCompany(_: number, company: CompanySummary): string {
    return company.name;
  }

  trackMunicipality(_: number, municipality: MunicipalitySummary): string {
    return `${municipality.municipio}-${municipality.departamento}`;
  }

  trackPoint(_: number, point: DeliveryPoint): string | number {
    return point?.id_destino || point?.id || point?.nombre_destino;
  }

  private buildDiscoveryData() {
    const companyMap = new Map<string, { points: number; municipalities: Set<string> }>();
    const municipalityMap = new Map<string, MunicipalitySummary>();

    this.locations.forEach(location => {
      const companyName = location.empresa || 'Empresa logística';
      const municipality = location.ubicacion?.municipio || '';
      const department = location.ubicacion?.departamento || '';
      const municipalityKey = `${municipality}|${department}`;

      if (!companyMap.has(companyName)) {
        companyMap.set(companyName, { points: 0, municipalities: new Set<string>() });
      }
      const company = companyMap.get(companyName)!;
      company.points += 1;
      if (municipality) company.municipalities.add(municipalityKey);

      if (municipality && !municipalityMap.has(municipalityKey)) {
        municipalityMap.set(municipalityKey, { municipio: municipality, departamento: department, pointCount: 0 });
      }
      if (municipality) municipalityMap.get(municipalityKey)!.pointCount += 1;
    });

    this.companies = Array.from(companyMap.entries())
      .map(([name, data], index) => ({
        name,
        pointCount: data.points,
        municipalityCount: data.municipalities.size,
        monogram: name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase(),
        accent: this.accents[index % this.accents.length]
      }))
      .sort((a, b) => b.pointCount - a.pointCount || a.name.localeCompare(b.name, 'es'));

    this.allMunicipalities = Array.from(municipalityMap.values())
      .sort((a, b) => b.pointCount - a.pointCount || a.municipio.localeCompare(b.municipio, 'es'));
    this.totalMunicipalities = this.allMunicipalities.length;
    this.municipalities = this.allMunicipalities
      .slice(0, 5);

    const seenMunicipalities = new Set<string>();
    this.featuredPoints = [...this.locations]
      .sort((a, b) => {
        const imagePriority = Number(Boolean(b.imagen_referencia)) - Number(Boolean(a.imagen_referencia));
        if (imagePriority !== 0) return imagePriority;
        const distanceA = typeof a.distance === 'number' ? a.distance : Number.MAX_SAFE_INTEGER;
        const distanceB = typeof b.distance === 'number' ? b.distance : Number.MAX_SAFE_INTEGER;
        return distanceA - distanceB || Number(b.id || 0) - Number(a.id || 0);
      })
      .filter(location => {
        const key = `${location.ubicacion?.municipio}|${location.ubicacion?.departamento}`;
        if (!location.ubicacion?.municipio || seenMunicipalities.has(key)) return false;
        seenMunicipalities.add(key);
        return true;
      })
      .slice(0, 5);

    this.refreshDestinationSearchResults();
  }

  private refreshDestinationSearchResults(): void {
    this.filteredMunicipalities = fuzzySearch(this.allMunicipalities, this.destinationSearchQuery, {
      fields: item => [item.municipio, item.departamento],
      limit: 5
    });
    this.filteredPoints = fuzzySearch(this.locations, this.destinationSearchQuery, {
      fields: point => [
        point.nombre_destino,
        point.empresa,
        point.ubicacion?.municipio,
        point.ubicacion?.departamento
      ],
      limit: 5
    });
  }

  private resetDestinationSearch(): void {
    this.destinationSearchQuery = '';
    this.isDestinationSearchActive = false;
    this.filteredMunicipalities = [];
    this.filteredPoints = [];
  }
}
