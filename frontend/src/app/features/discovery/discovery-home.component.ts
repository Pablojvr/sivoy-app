import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { Subject, Subscription, catchError, distinctUntilChanged, forkJoin, map, of, switchMap, timer } from 'rxjs';
import { CatalogFacet, CatalogPage, CatalogPoint } from '../../core/models/catalog.models';
import { CatalogService } from '../../core/services/catalog.service';

interface CompanySummary {
  name: string;
  pointCount: number;
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
export class DiscoveryHomeComponent implements OnInit, OnDestroy {
  @Output() mapExplore = new EventEmitter<void>();
  @Output() companySelected = new EventEmitter<string>();
  @Output() municipalitySelected = new EventEmitter<MunicipalitySummary>();
  @Output() pointSelected = new EventEmitter<CatalogPoint>();
  @Output() pointPreview = new EventEmitter<CatalogPoint>();
  @Output() pointMap = new EventEmitter<CatalogPoint>();

  companies: CompanySummary[] = [];
  municipalities: MunicipalitySummary[] = [];
  featuredPoints: CatalogPoint[] = [];
  totalMunicipalities = 0;
  totalPoints = 0;
  hasMoreCompanies = false;
  hasMoreMunicipalities = false;
  loading = true;
  destinationSearchQuery = '';
  isDestinationSearchActive = false;
  searching = false;
  filteredMunicipalities: MunicipalitySummary[] = [];
  filteredPoints: CatalogPoint[] = [];

  private readonly accents = ['#F45B78', '#B8EE4A', '#A9DDF5', '#FFD18A'];
  private readonly searchQueries = new Subject<string>();
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly catalog: CatalogService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadDiscoveryData();
    this.subscriptions.add(this.searchQueries.pipe(
      map(query => query.trim()),
      distinctUntilChanged(),
      switchMap(query => query.length >= 2
        ? timer(200).pipe(switchMap(() => forkJoin({
              municipalities: this.catalog.listFacets({ facet: 'municipality', q: query, limit: 5 }),
              points: this.catalog.listPoints({ q: query, limit: 5 })
            }).pipe(catchError(() => of(null)))))
        : of(null))
    ).subscribe(result => {
      this.searching = false;
      this.filteredMunicipalities = result
        ? result.municipalities.data.map(facet => this.toMunicipality(facet))
        : [];
      this.filteredPoints = result?.points.data || [];
      this.cdr.detectChanges();
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.searchQueries.complete();
  }

  get isLoading(): boolean {
    return this.loading;
  }

  get companyCount(): number {
    return this.companies.length;
  }

  get pointCount(): number {
    return this.totalPoints;
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
    this.searching = query.trim().length >= 2;
    if (query.trim().length < 2) {
      this.filteredMunicipalities = [];
      this.filteredPoints = [];
    }
    this.searchQueries.next(query);
  }

  onDestinationSearchInput(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) this.updateDestinationSearch(input.value);
  }

  clearDestinationSearch(input?: HTMLInputElement): void {
    this.destinationSearchQuery = '';
    this.isDestinationSearchActive = true;
    this.filteredMunicipalities = [];
    this.filteredPoints = [];
    this.searching = false;
    this.searchQueries.next('');
    input?.focus();
  }

  closeDestinationSearch(): void {
    this.isDestinationSearchActive = false;
  }

  selectMunicipalitySuggestion(municipality: MunicipalitySummary): void {
    this.resetDestinationSearch();
    this.municipalitySelected.emit(municipality);
  }

  selectPointSuggestion(point: CatalogPoint): void {
    this.resetDestinationSearch();
    this.pointPreview.emit(point);
  }

  pointName(point: CatalogPoint): string {
    return (point?.name || 'Punto de entrega')
      .replace(/^AGENCIA\s+/i, '');
  }

  locationLabel(point: CatalogPoint): string {
    return [point?.location?.municipality, point?.location?.department].filter(Boolean).join(', ');
  }

  trackCompany(_: number, company: CompanySummary): string {
    return company.name;
  }

  trackMunicipality(_: number, municipality: MunicipalitySummary): string {
    return `${municipality.municipio}-${municipality.departamento}`;
  }

  trackPoint(_: number, point: CatalogPoint): string {
    return point.pointId;
  }

  private loadDiscoveryData(): void {
    this.subscriptions.add(forkJoin({
      companies: this.catalog.listFacets({ facet: 'company', limit: 50 })
        .pipe(catchError(() => of(emptyPage<CatalogFacet>()))),
      municipalities: this.catalog.listFacets({ facet: 'municipality', limit: 5 })
        .pipe(catchError(() => of(emptyPage<CatalogFacet>()))),
      points: this.catalog.listPoints({ limit: 5 })
        .pipe(catchError(() => of(emptyPage<CatalogPoint>())))
    }).subscribe(result => {
      this.companies = result.companies.data.map((facet, index) => ({
        name: facet.label,
        pointCount: facet.count,
        monogram: facet.label.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase(),
        accent: this.accents[index % this.accents.length]
      }));
      this.municipalities = result.municipalities.data.map(facet => this.toMunicipality(facet));
      this.featuredPoints = result.points.data;
      this.totalPoints = this.companies.reduce((total, company) => total + company.pointCount, 0);
      this.totalMunicipalities = this.municipalities.length;
      this.hasMoreCompanies = result.companies.page.hasMore;
      this.hasMoreMunicipalities = result.municipalities.page.hasMore;
      this.loading = false;
      this.cdr.detectChanges();
    }));
  }

  private toMunicipality(facet: CatalogFacet): MunicipalitySummary {
    return {
      municipio: facet.label,
      departamento: facet.context?.department || '',
      pointCount: facet.count
    };
  }

  private resetDestinationSearch(): void {
    this.destinationSearchQuery = '';
    this.isDestinationSearchActive = false;
    this.searching = false;
    this.filteredMunicipalities = [];
    this.filteredPoints = [];
  }
}

function emptyPage<T>(): CatalogPage<T> {
  return {
    data: [],
    page: { limit: 0, hasMore: false, nextCursor: null },
    meta: { catalogRevision: 'unavailable' }
  };
}
