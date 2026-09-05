import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

interface CompanySummary {
  name: string;
  pointCount: number;
  municipalityCount: number;
  monogram: string;
  accent: string;
}

interface MunicipalitySummary {
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
  @Input() locations: any[] = [];

  @Output() destinationSearch = new EventEmitter<void>();
  @Output() mapExplore = new EventEmitter<void>();
  @Output() companySelected = new EventEmitter<string>();
  @Output() municipalitySelected = new EventEmitter<MunicipalitySummary>();
  @Output() pointSelected = new EventEmitter<any>();
  @Output() pointPreview = new EventEmitter<any>();

  companies: CompanySummary[] = [];
  municipalities: MunicipalitySummary[] = [];
  featuredPoints: any[] = [];
  totalMunicipalities = 0;

  private readonly accents = ['#F45B78', '#B8EE4A', '#A9DDF5', '#FFD18A'];

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

  pointName(point: any): string {
    return (point?.nombre_destino || point?.destino_nombre || 'Punto de entrega')
      .replace(/^AGENCIA\s+/i, '');
  }

  locationLabel(point: any): string {
    return [point?.ubicacion?.municipio, point?.ubicacion?.departamento].filter(Boolean).join(', ');
  }

  trackCompany(_: number, company: CompanySummary): string {
    return company.name;
  }

  trackMunicipality(_: number, municipality: MunicipalitySummary): string {
    return `${municipality.municipio}-${municipality.departamento}`;
  }

  trackPoint(_: number, point: any): string | number {
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

    const allMunicipalities = Array.from(municipalityMap.values());
    this.totalMunicipalities = allMunicipalities.length;
    this.municipalities = allMunicipalities
      .sort((a, b) => b.pointCount - a.pointCount || a.municipio.localeCompare(b.municipio, 'es'))
      .slice(0, 5);

    const seenMunicipalities = new Set<string>();
    this.featuredPoints = [...this.locations]
      .sort((a, b) => {
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
  }
}
