import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { Observable, Subject, Subscription, catchError, concat, distinctUntilChanged, forkJoin, map, of, switchMap, timer } from 'rxjs';
import { CatalogFacet, CatalogPage, CatalogPoint } from '../../core/models/catalog.models';
import { catalogPointToSavedSnapshot } from '../../core/saved-points/saved-point-snapshot.adapter';
import { SavedPointsService } from '../../core/saved-points/saved-points.service';
import { CatalogService } from '../../core/services/catalog.service';
import { MapasService } from '../../core/services/mapas.service';
import { ToastService } from '../../core/services/toast.service';
import {
  GeoCoordinate,
  classifyPlaceCatalogMatch,
  isValidGeoCoordinate,
  normalizePlaceSearchText
} from '../../core/maps/place-destination-fallback';

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

export interface ExternalPlaceSuggestion {
  placeId: string;
  text: string;
  mainText?: string;
  secondaryText?: string;
}

export interface PlaceDestinationContext extends GeoCoordinate {
  readonly reference: string;
  readonly municipio: string;
  readonly departamento: string;
}

type ExternalPlaceSearchState = 'idle' | 'loading' | 'ready' | 'error';
type ExternalPlaceResolutionState = 'idle' | 'loading' | 'resolved' | 'uncovered' | 'error';

interface ResolvedPlaceCandidate extends GeoCoordinate {
  reference: string;
  municipio: string;
  departamento: string;
}

type PlaceResolutionEmission =
  | { phase: 'reset' }
  | { phase: 'uncovered' }
  | { phase: 'error' }
  | { phase: 'resolved'; context: PlaceDestinationContext };

interface DestinationLocalResults {
  municipalities: CatalogPage<CatalogFacet>;
  points: CatalogPage<CatalogPoint>;
}

type DestinationSearchEmission =
  | { phase: 'reset'; query: string }
  | {
      phase: 'local';
      query: string;
      local: DestinationLocalResults | null;
      externalPending: boolean;
    }
  | {
      phase: 'external-ready';
      query: string;
      local: DestinationLocalResults;
      providerAvailable: boolean;
      suggestions: ExternalPlaceSuggestion[];
    }
  | {
      phase: 'external-error';
      query: string;
      local: DestinationLocalResults;
    };

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
  @Output() placeDestinationSelected = new EventEmitter<PlaceDestinationContext>();

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
  externalPlaceSuggestions: ExternalPlaceSuggestion[] = [];
  externalPlaceSearchState: ExternalPlaceSearchState = 'idle';
  externalPlaceProviderAvailable: boolean | null = null;
  externalPlaceSearchError = '';
  externalPlaceResolutionState: ExternalPlaceResolutionState = 'idle';
  externalPlaceResolutionError = '';
  resolvedPlaceContext: Readonly<PlaceDestinationContext> | null = null;
  readonly savedFeedbackPointId = signal<string | null>(null);

  private readonly accents = ['#F45B78', '#B8EE4A', '#A9DDF5', '#FFD18A'];
  private readonly searchQueries = new Subject<string>();
  private readonly placeSelections = new Subject<ExternalPlaceSuggestion | null>();
  private readonly subscriptions = new Subscription();
  private saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private placeSearchSessionToken = '';
  private placeSearchSessionSequence = 0;
  private currentNormalizedSearchQuery = '';

  constructor(
    private readonly catalog: CatalogService,
    private readonly mapas: MapasService,
    private readonly cdr: ChangeDetectorRef,
    readonly savedPoints: SavedPointsService,
    private readonly toast: ToastService
  ) {}

  toggleSavedPoint(point: CatalogPoint, event: Event): void {
    event.stopPropagation();
    if (this.savedPoints.isSaved(point.pointId)) {
      if (!this.savedPoints.remove(point.pointId)) {
        this.toast.showError('No pudimos quitar este punto. Intenta de nuevo.', 'No se pudo actualizar');
      }
      this.clearSaveFeedback();
      return;
    }
    const outcome = this.savedPoints.save(catalogPointToSavedSnapshot(point));
    if (outcome === 'saved') {
      this.showSaveFeedback(point.pointId, this.pointName(point));
    } else if (outcome === 'limit-reached') {
      this.toast.showError('Puedes guardar hasta 50 puntos en este dispositivo.', 'Límite alcanzado');
    } else if (outcome === 'storage-unavailable') {
      this.toast.showError('El navegador no permitió guardar el punto en este dispositivo.', 'No se pudo guardar');
    } else if (outcome === 'invalid-point') {
      this.toast.showError('La información de este punto no se puede guardar.', 'Punto no disponible');
    }
  }

  ngOnInit(): void {
    this.loadDiscoveryData();
    this.subscriptions.add(this.searchQueries.pipe(
      map(query => normalizePlaceSearchText(query)),
      distinctUntilChanged(),
      switchMap(query => this.searchDestination(query))
    ).subscribe(emission => this.applyDestinationSearchEmission(emission)));
    this.subscriptions.add(this.placeSelections.pipe(
      switchMap(suggestion => suggestion
        ? this.resolvePlaceDestination(suggestion)
        : of<PlaceResolutionEmission>({ phase: 'reset' }))
    ).subscribe(emission => this.applyPlaceResolutionEmission(emission)));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.searchQueries.complete();
    this.placeSelections.complete();
    this.clearSaveFeedback();
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
    const normalizedQuery = normalizePlaceSearchText(query);
    this.destinationSearchQuery = query;
    this.isDestinationSearchActive = true;
    if (!normalizedQuery) {
      this.currentNormalizedSearchQuery = '';
      this.searching = false;
      this.filteredMunicipalities = [];
      this.filteredPoints = [];
      this.resetExternalPlaceState(true);
      this.cancelPlaceResolution(false);
      this.searchQueries.next('');
      return;
    }
    if (normalizedQuery === this.currentNormalizedSearchQuery) {
      this.searching = false;
      return;
    }
    this.currentNormalizedSearchQuery = normalizedQuery;
    this.searching = normalizedQuery.length >= 1;
    this.resetExternalPlaceState(false);
    this.cancelPlaceResolution(false);
    this.searchQueries.next(normalizedQuery);
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
    this.currentNormalizedSearchQuery = '';
    this.resetExternalPlaceState(true);
    this.cancelPlaceResolution(false);
    this.searchQueries.next('');
    input?.focus();
  }

  closeDestinationSearch(): void {
    this.isDestinationSearchActive = false;
    this.searching = false;
    this.cancelPlaceResolution(false);
  }

  selectMunicipalitySuggestion(municipality: MunicipalitySummary): void {
    this.resetDestinationSearch();
    this.municipalitySelected.emit(municipality);
  }

  selectPointSuggestion(point: CatalogPoint): void {
    this.resetDestinationSearch();
    this.pointPreview.emit(point);
  }

  selectExternalPlaceSuggestion(suggestion: ExternalPlaceSuggestion): void {
    if (!suggestion?.placeId) return;
    this.resolvedPlaceContext = null;
    this.externalPlaceResolutionState = 'loading';
    this.externalPlaceResolutionError = '';
    this.placeSelections.next(suggestion);
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
      municipalities: this.catalog.listFacets({ facet: 'municipality', limit: 50 })
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
    this.currentNormalizedSearchQuery = '';
    this.resetExternalPlaceState(true);
    this.cancelPlaceResolution(false);
    this.searchQueries.next('');
  }

  private searchDestination(query: string): Observable<DestinationSearchEmission> {
    if (!query) return of({ phase: 'reset', query });

    return timer(200).pipe(
      switchMap(() => this.searchLocalDestination(query)),
      switchMap(local => {
        const externalPending = this.shouldSearchExternalPlaces(query, local);
        const localEmission: DestinationSearchEmission = {
          phase: 'local',
          query,
          local,
          externalPending
        };
        if (!externalPending || !local) return of(localEmission);

        return concat(
          of(localEmission),
          timer(150).pipe(
            switchMap(() => this.mapas.searchPlaces(query, this.getOrCreatePlaceSessionToken()).pipe(
              map(response => ({
                phase: 'external-ready' as const,
                query,
                local,
                providerAvailable: !isRecord(response) || response['providerAvailable'] !== false,
                suggestions: this.readExternalPlaceSuggestions(response)
              })),
              catchError(() => of({
                phase: 'external-error' as const,
                query,
                local
              }))
            ))
          )
        );
      })
    );
  }

  private searchLocalDestination(query: string): Observable<DestinationLocalResults | null> {
    if (query.length === 1) {
      const municipalities = this.municipalities
        .filter(item => classifyPlaceCatalogMatch(item.municipio, query) !== 'none')
        .slice(0, 5)
        .map(item => ({
          value: item.municipio,
          label: item.municipio,
          count: item.pointCount,
          context: { department: item.departamento }
        } satisfies CatalogFacet));
      const points = this.featuredPoints
        .filter(point => [point.name, point.location.municipality].some(candidate =>
          classifyPlaceCatalogMatch(candidate, query) !== 'none'
        ))
        .slice(0, 5);
      return of({ municipalities: pageOf(municipalities), points: pageOf(points) });
    }

    if (query.length > 80) {
      return of({ municipalities: emptyPage<CatalogFacet>(), points: emptyPage<CatalogPoint>() });
    }

    return forkJoin({
      municipalities: this.catalog.listFacets({ facet: 'municipality', q: query, limit: 5 }),
      points: this.catalog.listPoints({ q: query, limit: 5 })
    }).pipe(catchError(() => of(null)));
  }

  private applyDestinationSearchEmission(emission: DestinationSearchEmission): void {
    if (emission.phase === 'reset') {
      this.searching = false;
      this.filteredMunicipalities = [];
      this.filteredPoints = [];
      this.resetExternalPlaceState(false);
      this.resolvedPlaceContext = null;
      this.cdr.markForCheck();
      return;
    }

    this.searching = false;
    this.filteredMunicipalities = emission.local
      ? emission.local.municipalities.data.map(facet => this.toMunicipality(facet))
      : [];
    this.filteredPoints = emission.local?.points.data || [];

    if (emission.phase === 'local') {
      this.externalPlaceSuggestions = [];
      this.externalPlaceSearchError = '';
      this.externalPlaceSearchState = emission.externalPending ? 'loading' : 'idle';
    } else if (emission.phase === 'external-ready') {
      this.externalPlaceSuggestions = emission.suggestions;
      this.externalPlaceSearchError = '';
      this.externalPlaceProviderAvailable = emission.providerAvailable;
      this.externalPlaceSearchState = emission.providerAvailable ? 'ready' : 'idle';
      if (!emission.providerAvailable) this.placeSearchSessionToken = '';
    } else {
      this.externalPlaceSuggestions = [];
      this.externalPlaceSearchError = 'No pudimos buscar lugares en este momento.';
      this.externalPlaceSearchState = 'error';
      this.placeSearchSessionToken = '';
    }

    this.cdr.markForCheck();
  }

  private shouldSearchExternalPlaces(
    query: string,
    local: DestinationLocalResults | null
  ): local is DestinationLocalResults {
    if (
      !local
      || this.externalPlaceProviderAvailable === false
      || query.length < 3
      || query.length > 128
    ) return false;

    const candidateNames = [
      ...local.municipalities.data.map(facet => facet.label),
      ...local.points.data.flatMap(point => [point.name, point.location.municipality])
    ];
    return !candidateNames.some(candidate =>
      classifyPlaceCatalogMatch(candidate, query) !== 'none'
    );
  }

  private readExternalPlaceSuggestions(response: unknown): ExternalPlaceSuggestion[] {
    if (!isRecord(response) || !Array.isArray(response['suggestions'])) return [];

    return response['suggestions'].slice(0, 5).flatMap(value => {
      if (!isRecord(value)) return [];
      const placeId = typeof value['placeId'] === 'string' ? value['placeId'].trim() : '';
      const mainText = typeof value['mainText'] === 'string' ? value['mainText'].slice(0, 256) : '';
      const text = typeof value['text'] === 'string'
        ? value['text'].slice(0, 512)
        : mainText;
      if (!placeId || !text) return [];

      const suggestion: ExternalPlaceSuggestion = { placeId, text };
      if (mainText) suggestion.mainText = mainText;
      if (typeof value['secondaryText'] === 'string') {
        suggestion.secondaryText = value['secondaryText'].slice(0, 256);
      }
      return [suggestion];
    });
  }

  private getOrCreatePlaceSessionToken(): string {
    if (!this.placeSearchSessionToken) {
      this.placeSearchSessionToken = this.createPlaceSessionToken();
    }
    return this.placeSearchSessionToken;
  }

  private createPlaceSessionToken(): string {
    this.placeSearchSessionSequence += 1;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `sivoy-${Date.now()}-${this.placeSearchSessionSequence}`;
  }

  private resetExternalPlaceState(clearToken: boolean): void {
    this.externalPlaceSuggestions = [];
    this.externalPlaceSearchState = 'idle';
    this.externalPlaceSearchError = '';
    if (clearToken) this.placeSearchSessionToken = '';
  }

  private resolvePlaceDestination(
    suggestion: ExternalPlaceSuggestion
  ): Observable<PlaceResolutionEmission> {
    const token = this.getOrCreatePlaceSessionToken();
    return this.mapas.resolvePlace(suggestion.placeId, token).pipe(
      switchMap(response => {
        const candidate = readResolvedPlaceCandidate(response, suggestion);
        if (!candidate) return of<PlaceResolutionEmission>({ phase: 'uncovered' });

        return this.catalog.listFacets({
          facet: 'municipality',
          q: candidate.municipio,
          limit: 50
        }).pipe(
          map(page => {
            const municipality = page.data.find(facet =>
              normalizePlaceSearchText(facet.label) === normalizePlaceSearchText(candidate.municipio)
              && normalizePlaceSearchText(facet.context?.department) === normalizePlaceSearchText(candidate.departamento)
            );
            if (!municipality) return { phase: 'uncovered' } as const;

            return {
              phase: 'resolved' as const,
              context: Object.freeze({
                reference: candidate.reference,
                municipio: municipality.label,
                departamento: municipality.context?.department || candidate.departamento,
                lat: candidate.lat,
                lng: candidate.lng
              })
            };
          }),
          catchError(() => of<PlaceResolutionEmission>({ phase: 'error' }))
        );
      }),
      catchError(() => of<PlaceResolutionEmission>({ phase: 'error' }))
    );
  }

  private applyPlaceResolutionEmission(emission: PlaceResolutionEmission): void {
    if (emission.phase === 'reset') {
      this.externalPlaceResolutionState = 'idle';
      this.externalPlaceResolutionError = '';
      this.resolvedPlaceContext = null;
    } else if (emission.phase === 'uncovered') {
      this.externalPlaceResolutionState = 'uncovered';
      this.externalPlaceResolutionError = 'No existe cobertura cercana o similar';
      this.resolvedPlaceContext = null;
      this.placeSearchSessionToken = '';
    } else if (emission.phase === 'error') {
      this.externalPlaceResolutionState = 'error';
      this.externalPlaceResolutionError = 'No pudimos identificar este lugar en este momento.';
      this.resolvedPlaceContext = null;
      this.placeSearchSessionToken = '';
    } else {
      this.externalPlaceResolutionState = 'resolved';
      this.externalPlaceResolutionError = '';
      this.placeSearchSessionToken = '';
      this.resolvedPlaceContext = emission.context;
    }
    this.cdr.markForCheck();
  }

  confirmResolvedPlaceDestination(): void {
    if (!this.resolvedPlaceContext) return;
    this.placeDestinationSelected.emit(this.resolvedPlaceContext);
  }

  private cancelPlaceResolution(clearToken: boolean): void {
    this.placeSelections.next(null);
    this.resolvedPlaceContext = null;
    if (clearToken) this.placeSearchSessionToken = '';
  }

  private showSaveFeedback(pointId: string, pointName: string): void {
    this.clearSaveFeedback();
    this.savedFeedbackPointId.set(pointId);
    this.toast.showSuccess(`${pointName} ya está disponible en Guardados.`, 'Punto guardado');
    this.saveFeedbackTimer = setTimeout(() => {
      this.savedFeedbackPointId.set(null);
      this.saveFeedbackTimer = null;
    }, 520);
  }

  private clearSaveFeedback(): void {
    if (this.saveFeedbackTimer !== null) clearTimeout(this.saveFeedbackTimer);
    this.saveFeedbackTimer = null;
    this.savedFeedbackPointId.set(null);
  }
}

function emptyPage<T>(): CatalogPage<T> {
  return {
    data: [],
    page: { limit: 0, hasMore: false, nextCursor: null },
    meta: { catalogRevision: 'unavailable' }
  };
}

function pageOf<T>(data: T[]): CatalogPage<T> {
  return {
    data,
    page: { limit: data.length, hasMore: false, nextCursor: null },
    meta: { catalogRevision: 'local-discovery' }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readResolvedPlaceCandidate(
  response: unknown,
  suggestion: ExternalPlaceSuggestion
): ResolvedPlaceCandidate | null {
  if (!isRecord(response) || response['success'] !== true || !isRecord(response['place'])) return null;
  const place = response['place'];
  const components = Array.isArray(place['addressComponents'])
    ? place['addressComponents'].filter(isRecord)
    : [];
  const country = readAddressComponent(components, ['country']);
  if (country?.shortText.toUpperCase() !== 'SV') return null;

  const municipality = readAddressComponent(components, [
    'locality',
    'postal_town',
    'administrative_area_level_2'
  ]);
  const department = readAddressComponent(components, ['administrative_area_level_1']);
  const reference = readBoundedText(place['name'], 128)
    || readBoundedText(suggestion.mainText, 128)
    || readBoundedText(suggestion.text, 128);
  const location = isRecord(place['location']) ? place['location'] : null;
  const coordinates = location ? {
    lat: location['latitude'] ?? location['lat'],
    lng: location['longitude'] ?? location['lng']
  } : null;

  if (!reference || !municipality?.longText || !department?.longText || !isValidGeoCoordinate(coordinates)) {
    return null;
  }
  return {
    reference,
    municipio: municipality.longText,
    departamento: department.longText,
    lat: coordinates.lat,
    lng: coordinates.lng
  };
}

function readAddressComponent(
  components: Record<string, unknown>[],
  acceptedTypes: readonly string[]
): { longText: string; shortText: string } | null {
  for (const type of acceptedTypes) {
    const component = components.find(candidate =>
      Array.isArray(candidate['types']) && candidate['types'].includes(type)
    );
    if (!component) continue;
    const longText = readBoundedText(component['longText'], 128);
    const shortText = readBoundedText(component['shortText'], 32);
    if (longText && shortText) return { longText, shortText };
  }
  return null;
}

function readBoundedText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length >= 1 && text.length <= maxLength ? text : '';
}
