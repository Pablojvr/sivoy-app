import { environment } from '../../../environments/environment';
import { ChangeDetectorRef, Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, HostBinding, HostListener, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RutasService } from '../../core/services/rutas.service';
import { ToastService } from '../../core/services/toast.service';
import { MapasService } from '../../core/services/mapas.service';
import { SiCardDirective } from '../../shared/ui/ui-primitives';
import { DestinationSearchComponent, MunicipalityOption } from './destination-search/destination-search.component';
import { OriginSearchComponent } from './origin-search/origin-search.component';
import { ShipmentSearchFacade } from './shipment-search.facade';
import { formatScheduleTime, groupConsecutiveSchedules, GroupedSchedule } from './results/schedule-utils';
import { PointResultCardComponent } from './results/point-result-card.component';
import { PointShareService } from './results/point-share.service';
import { RouteResultCardComponent, RouteResultViewModel, RouteDeliveryDayChange, formatLocationName as rtFormatLoc, formatFriendlyDate as rtFormatDate } from './results/route-result-card.component';
import { PinDetailCardComponent } from './results/pin-detail-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, SiCardDirective, DestinationSearchComponent, OriginSearchComponent, PointResultCardComponent, RouteResultCardComponent, PinDetailCardComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  encapsulation: ViewEncapsulation.None
})
export class HomeComponent implements OnInit, OnChanges {
  apiUrl = environment.apiUrl;
  @Input() locations: any[] = [];
  @Input() userLocation: any = null;
  @Input() initialIntent: Record<string, string> = {};
  @Input() mapResourceMode = false;
  @HostBinding('class.map-resource-mode') get isMapResourceHost() { return this.mapResourceMode; }
  @HostBinding('class.list-first-mode') get isListFirstHost() { return !this.mapResourceMode; }
  private appliedIntentKey = '';
  private _selectedPin: any = null;
  activePinTab: 'info' | 'horarios' = 'info';
  isPinCardExpanded = true;
  private pinCardTouchStartY = 0;
  private suppressPinImagePreview = false;
  private pinCardStateLocked = false;

  @Input() set selectedPin(value: any) {
    const previousPinIdentity = this._selectedPin
      ? String(this._selectedPin.id_destino || this._selectedPin.id_origen || this._selectedPin.id || this.getLocationName(this._selectedPin))
      : '';
    const nextPinIdentity = value
      ? String(value.id_destino || value.id_origen || value.id || this.getLocationName(value))
      : '';
    this._selectedPin = value;
    if (value) {
      if (nextPinIdentity !== previousPinIdentity && !this.pinCardStateLocked) {
        this.activePinTab = 'info';
        this.isPinCardExpanded = !window.matchMedia('(max-width: 640px)').matches;
      }
      this.bottomSheetState = 'hidden';
      this.lastSelectedLocationId = value.id_destino || value.id_origen || value.id;
      
      // Auto-scroll the list to the selected card
      setTimeout(() => {
        const cardId = 'card-' + this.lastSelectedLocationId;
        const el = document.getElementById(cardId);
        if (el) {
          const container = el.closest('.sheet-content');
          if (container) {
            const elRect = el.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            // Calculate element's absolute top relative to the container's scroll content
            const absoluteElTop = container.scrollTop + (elRect.top - containerRect.top);
            
            // Buscar el header sticky si existe, para restar su altura del area visible
            const stickyHeader = container.querySelector('.sheet-header-sticky') as HTMLElement;
            const stickyHeight = stickyHeader ? stickyHeader.offsetHeight : 0;
            const visibleHeight = containerRect.height - stickyHeight;
            
            // Calculate target scroll to center the element within the VISIBLE area
            let targetScrollTop = absoluteElTop - stickyHeight - (visibleHeight / 2) + (elRect.height / 2);
            
            // Prevent the top of the card from hiding under the sticky header
            // If centering pushes the top too far up, clamp it so the top is visible
            const minSafeScroll = absoluteElTop - stickyHeight - 16; // 16px de margen
            if (targetScrollTop > minSafeScroll) {
              targetScrollTop = minSafeScroll;
            }
            
            // Clamp the scroll value to prevent scrolling past bounds (prevents white gaps)
            const maxScroll = container.scrollHeight - container.clientHeight;
            if (targetScrollTop < 0) targetScrollTop = 0;
            if (targetScrollTop > maxScroll) targetScrollTop = maxScroll;
            
            container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
          } else {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }, 150);
    } else {
      this.pinCardStateLocked = false;
      if (this.bottomSheetState === 'hidden') {
         this.bottomSheetState = 'collapsed'; // Restaura a estado contraido como esperaba el usuario
      }
    }
  }
  get selectedPin(): any {
    return this._selectedPin;
  }
  @Output() viewOnMapEvent = new EventEmitter<any>();
  @Input() isPickingLocation: boolean = false;
  @Input() highlightedRoute: any = null;
  
  @Output() updateMapMarkers = new EventEmitter<void>();
  @Output() mapHighlightRoute = new EventEmitter<any>();
  @Output() focusLocation = new EventEmitter<any>();
  @Output() showPinDetails = new EventEmitter<{location: any, type: string}>();
  @Output() clearMap = new EventEmitter<void>();
  @Output() recenterMapEvent = new EventEmitter<void>();
  @Output() resetMapMarkersEvent = new EventEmitter<void>();
  @Output() showNearbyPointsEvent = new EventEmitter<void>();
  @Output() previewImageEvent = new EventEmitter<string>();
  @Output() mapResourceModeChange = new EventEmitter<boolean>();

  origen: string = '';
  destino: string = '';
  origenInputValue: string = '';
  destinoInputValue: string = '';
  dropoffDate: string = '';
  minDate: string = '';
  dropoffTime: string = '';
  activeInput: 'origen' | 'destino' | null = null;
  locationSearchQuery: string = '';
  isSearchExpanded: boolean = false;
  isDiscoveryMode: boolean = false;
  isOriginDiscoveryMode: boolean = false;
  isOriginChoiceMode: boolean = false;
  selectedOriginPoint: any = null;
  selectedDestinationPoint: any = null;
  originPointQuery: string = '';
  originPointPage: number = 1;
  readonly originPointPageSize: number = 8;
  showPlaceSearchHelper: boolean = false;
  placeSearchQuery: string = '';
  placeSuggestions: any[] = [];
  placeSearchLoading: boolean = false;
  placeSearchError: string = '';
  private placeSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private placeSearchSessionToken: string = '';
  bottomSheetState: 'hidden' | 'collapsed' | 'half' | 'expanded' = 'collapsed';
  isSheetScrolled: boolean = false;
  loading: boolean = false;
  errorMsg: string = '';
  result: any = null;
  sheetDragOffset: number = 0;
  isSheetDragging: boolean = false;
  private activeSheetPointerId: number | null = null;
  private sheetDragStartY: number = 0;
  private sheetDragStartedAt: number = 0;
  private didSheetDrag: boolean = false;
  selectingLocation: string | null = null;
  origenMunicipio: string = '';
  destinoMunicipio: string = '';
  activeEmpresa: string = '';
  showAdvanced: boolean = false;
  arrivalDate: string = '';
  selectedPinDayFilter: string = '';
  lastSelectedLocationId: any = null;
  
  municipalityResults: any[] = [];
  flightResults: any[] = [];
  displayedResults: any[] = [];
  expandedResultCard: any = null;
  activeDetailedCard: any = null;
  private unavailablePointImages = new Set<string>();
  private groupedScheduleCache = new WeakMap<any[], GroupedSchedule[]>();
  searchRadius: number = 1.0;
  
  // Autocomplete logic properties
  showAutocomplete: boolean = false;
  filteredModalLocations: any[] = [];
  filteredOriginMunicipalities: any[] = [];
  filteredMunicipalities: any[] = [];
  uniqueMunicipalities: any[] = [];
  origenDepartamento: string = '';
  destinoDepartamento: string = '';
  userMunicipalityName: string = '';
  editFormData: any = {};
  tempPickedLat: string = '';
  tempPickedLng: string = '';
  cancelPickingLocation() { this.isPickingLocation = false; }
  confirmPickedLocation() { this.isPickingLocation = false; }

  constructor(
    private rutasService: RutasService,
    private toastService: ToastService,
    private mapasService: MapasService,
    private cdr: ChangeDetectorRef,
    private readonly facade: ShipmentSearchFacade,
    private pointShareService: PointShareService
  ) {}

  get hasListContent(): boolean {
    return this.isOriginChoiceMode || this.loading || Boolean(this.errorMsg) ||
      this.municipalityResults.length > 0 || this.flightResults.length > 0;
  }

  exitMapResource() {
    if (this.hasListContent) {
      if (this.selectedPin) this.closePinDetails();
      this.bottomSheetState = 'half';
      this.mapResourceMode = false;
      this.mapResourceModeChange.emit(false);
      return;
    }
    this.returnToHome();
  }

  ngOnInit() {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISODate = new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
    this.dropoffDate = localISODate;
    this.minDate = localISODate;
    
    const hours = String(today.getHours()).padStart(2, '0');
    const minutes = String(today.getMinutes()).padStart(2, '0');
    this.dropoffTime = `${hours}:${minutes}`;
  }

  // UI Handlers
  openLocationSelector(type: 'origen' | 'destino') {
    if (this.activeInput === type && this.isSearchExpanded) {
      this.closeLocationSelector();
      return;
    }
    this.activeInput = type;
    this.isSearchExpanded = true;
    this.showAutocomplete = true;
    this.locationSearchQuery = type === 'origen' ? this.origenInputValue : this.destinoInputValue;
    this.updateAutocompleteFilters();
  }

  closeLocationSelector() {
    this.activeInput = null;
    this.isSearchExpanded = false;
    this.showAutocomplete = false;
  }

  @HostListener('document:click', ['$event'])
  clickout(event: any) {
    const clickedInsideSearchBox = event.target.closest('.search-box');
    const clickedInsideList = event.target.closest('.autocomplete-list');
    
    if (!clickedInsideSearchBox && !clickedInsideList) {
      this.showAutocomplete = false;
      this.activeInput = null;
    }
  }

  clearSearch() {
    this.origenInputValue = '';
    this.destinoInputValue = '';
    this.origen = '';
    this.destino = '';
    this.origenMunicipio = '';
    this.destinoMunicipio = '';
    this.locationSearchQuery = '';
    this.bottomSheetState = 'collapsed';
    this.isDiscoveryMode = false;
    this.isOriginDiscoveryMode = false;
    this.isOriginChoiceMode = false;
    this.selectedOriginPoint = null;
    this.selectedDestinationPoint = null;
    this.originPointQuery = '';
    this.originPointPage = 1;
    this.flightResults = [];
    this.municipalityResults = [];
    this.displayedResults = [];
    this.clearMap.emit();
    this.updateMapMarkers.emit();
  }

  returnToHome() {
    this.closeLocationSelector();
    window.location.hash = '/';
  }

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['locations'] || changes['initialIntent']) && this.locations.length > 0) {
      this.applyInitialIntent();
    }
  }

  private applyInitialIntent() {
    if (Object.keys(this.initialIntent || {}).length === 0) return;
    const intentKey = JSON.stringify(this.initialIntent);
    if (intentKey === this.appliedIntentKey) return;
    this.appliedIntentKey = intentKey;
    const intent = this.initialIntent;

    setTimeout(() => {
      if (intent['buscar'] === 'destino') {
        this.openLocationSelector('destino');
      } else if (intent['empresa']) {
        this.exploreCompanyFromDiscovery(intent['empresa']);
      } else if (intent['municipio']) {
        this.selectMunicipalityFromDiscovery({
          municipio: intent['municipio'],
          departamento: intent['departamento'] || ''
        });
      } else if (intent['punto']) {
        const point = this.locations.find(location =>
          String(location.id_destino || location.id) === String(intent['punto'])
        );
        if (point) {
          if (intent['accion'] === 'select') this.selectPointFromDiscovery(point);
          else if (intent['accion'] === 'map') this.viewPointOnMap(point);
          else this.previewPointFromDiscovery(point);
        }
      }
      this.cdr.detectChanges();
    });
  }

  exploreMapFromDiscovery() {
    this.mapResourceMode = true;
    this.mapResourceModeChange.emit(true);
    this.bottomSheetState = 'collapsed';
    this.resetMapMarkersEvent.emit();
  }

  selectMunicipalityFromDiscovery(municipality: any) {
    this.selectMunicipality(municipality, 'destino');
  }

  exploreCompanyFromDiscovery(empresa: string) {
    const companyLocations = this.locations.filter(location => location.empresa === empresa);
    if (companyLocations.length === 0) return;

    this.isDiscoveryMode = true;
    this.isOriginDiscoveryMode = false;
    this.isOriginChoiceMode = false;
    this.activeEmpresa = empresa;
    this.destino = '';
    this.destinoInputValue = '';
    this.destinoMunicipio = '';
    this.flightResults = [];
    this.municipalityResults = companyLocations.map(location => ({
      ...location,
      destino_nombre: location.nombre_destino
    }));
    this.displayedResults = [...this.municipalityResults];
    this.bottomSheetState = 'half';
    this.updateMapMarkers.emit();
  }

  selectPointFromDiscovery(point: any) {
    this.selectPointFromList(point);
  }

  previewPointFromDiscovery(point: any) {
    this.isDiscoveryMode = true;
    this.isOriginDiscoveryMode = false;
    this.isOriginChoiceMode = false;
    this.activeEmpresa = point.empresa || '';
    this.municipalityResults = [{ ...point, destino_nombre: point.nombre_destino }];
    this.displayedResults = [...this.municipalityResults];
    this.expandedResultCard = this.municipalityResults[0];
    this.destinoMunicipio = point.ubicacion?.municipio || '';
    this.destinoDepartamento = point.ubicacion?.departamento || '';
    this.destino = this.destinoMunicipio || this.getLocationName(point);
    this.destinoInputValue = this.getLocationName(point);
    this.bottomSheetState = 'half';
  }

  onSearchLocation(query: string) {
    this.locationSearchQuery = query;
  }

  get filteredLocations() {
    if (!this.locationSearchQuery) return [];
    const query = this.locationSearchQuery.toLowerCase();
    const normalize = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const normQuery = normalize(query);
    
    const matchingLocations = this.locations.filter(l =>
      normalize(l.nombre_destino).includes(normQuery) || 
      normalize(l.ubicacion?.municipio).includes(normQuery) ||
      normalize(l.ubicacion?.departamento).includes(normQuery)
    );

    if (this.activeInput === 'origen' && this.selectedDestinationPoint?.empresa) {
      const destinationId = this.getLocationIdentity(this.selectedDestinationPoint);
      return matchingLocations.filter(location =>
        location.empresa === this.selectedDestinationPoint.empresa &&
        this.getLocationIdentity(location) !== destinationId
      );
    }

    return matchingLocations;
  }

  selectLocation(loc: any, type: 'origen' | 'destino') {
    const locationName = this.getLocationName(loc);
    if (type === 'origen') {
      this.selectedOriginPoint = loc;
      this.origenInputValue = locationName;
      this.origen = locationName;
      this.origenMunicipio = loc.ubicacion?.municipio;
      this.origenDepartamento = loc.ubicacion?.departamento;

      const rawLat = loc.ubicacion?.lat;
      const rawLng = loc.ubicacion?.lng;
      const lat = rawLat != null && rawLat !== '' ? parseFloat(String(rawLat)) : NaN;
      const lng = rawLng != null && rawLng !== '' ? parseFloat(String(rawLng)) : NaN;
      const validCoords = !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng) ? { lat, lng } : null;

      this.facade.setOrigin({
        point: {
          id: this.getLocationIdentity(loc),
          name: locationName,
          company: loc.empresa,
          type: loc.tipo,
          coordinates: validCoords,
          municipality: {
            municipio: loc.ubicacion?.municipio || '',
            departamento: loc.ubicacion?.departamento || ''
          }
        },
        inputValue: locationName,
        municipality: loc.ubicacion?.municipio || '',
        department: loc.ubicacion?.departamento || ''
      });
    } else {
      this.selectedDestinationPoint = loc;
      this.destinoInputValue = locationName;
      this.destino = locationName;
      this.destinoMunicipio = loc.ubicacion?.municipio;
      this.destinoDepartamento = loc.ubicacion?.departamento;
    }
    this.handleSelectionHandoff(type);
    if (type === 'origen' && this.destino) {
      this.executeSearch();
    }
  }

  selectMunicipality(mun: any, type: 'origen' | 'destino') {
    if (type === 'origen') {
      this.selectedOriginPoint = null;
      this.origenInputValue = mun.municipio;
      this.origen = mun.municipio;
      this.origenMunicipio = mun.municipio;
      this.origenDepartamento = mun.departamento || '';
    } else {
      this.selectedDestinationPoint = null;
      this.destinoInputValue = mun.municipio;
      this.destino = mun.municipio;
      this.destinoMunicipio = mun.municipio;
      this.destinoDepartamento = mun.departamento || '';
    }
    this.handleSelectionHandoff(type);
    if (type === 'destino') {
      this.executeSearch();
    }
  }

  onDestinationMunicipalitySelected(mun: MunicipalityOption) {
    this.facade.setDestination({
      point: null,
      inputValue: mun.municipio,
      municipality: mun.municipio,
      department: mun.departamento || ''
    });

    this.selectMunicipality(mun, 'destino');
  }

  onDestinationClear() {
    this.clearInput('destino');
    this.facade.setDestination({
      point: null,
      inputValue: '',
      municipality: '',
      department: ''
    });
  }

  onOrigenInput(event: any) {
    const val = typeof event === 'string' ? event : event?.target?.value || '';
    this.origenInputValue = val;
    this.locationSearchQuery = this.origenInputValue;
    this.showAutocomplete = true;
    this.updateAutocompleteFilters();
  }

  togglePlaceSearchHelper() {
    this.showPlaceSearchHelper = !this.showPlaceSearchHelper;
    this.showAutocomplete = !this.showPlaceSearchHelper;
    this.placeSearchError = '';
    if (this.showPlaceSearchHelper && !this.placeSearchSessionToken) {
      this.placeSearchSessionToken = this.createPlaceSessionToken();
    }
  }

  onPlaceSearchInput(value: string) {
    this.placeSearchQuery = value;
    this.placeSuggestions = [];
    this.placeSearchError = '';
    if (this.placeSearchTimer) clearTimeout(this.placeSearchTimer);

    if (value.trim().length < 3) {
      this.placeSearchLoading = false;
      return;
    }

    this.placeSearchTimer = setTimeout(() => this.searchPlaces(value.trim()), 350);
  }

  clearPlaceSearch() {
    if (this.placeSearchTimer) clearTimeout(this.placeSearchTimer);
    this.placeSearchQuery = '';
    this.placeSuggestions = [];
    this.placeSearchError = '';
    this.placeSearchLoading = false;
    this.placeSearchSessionToken = this.createPlaceSessionToken();
  }

  selectPlaceSuggestion(suggestion: any) {
    if (!suggestion?.placeId || this.placeSearchLoading) return;
    this.placeSearchLoading = true;
    this.placeSearchError = '';

    this.mapasService.resolvePlace(suggestion.placeId, this.placeSearchSessionToken).subscribe({
      next: response => {
        const municipality = this.matchRegisteredMunicipality(response?.place);
        this.placeSearchLoading = false;

        if (!municipality) {
          this.placeSearchError = 'Reconocimos el lugar, pero todavía no tenemos puntos en ese municipio.';
          return;
        }

        const placeName = response?.place?.name || suggestion.mainText || suggestion.text;
        this.clearPlaceSearch();
        this.showPlaceSearchHelper = false;
        this.toastService.showInfo(
          `${placeName} corresponde a ${municipality.municipio}. Buscaremos desde ese municipio.`,
          'Municipio identificado'
        );
        this.selectOriginMunicipality(municipality);
      },
      error: error => {
        this.placeSearchLoading = false;
        this.placeSearchError = error?.error?.error || 'No pudimos identificar el municipio de este lugar.';
      }
    });
  }

  private searchPlaces(query: string) {
    if (!this.placeSearchSessionToken) this.placeSearchSessionToken = this.createPlaceSessionToken();
    this.placeSearchLoading = true;

    this.mapasService.searchPlaces(query, this.placeSearchSessionToken).subscribe({
      next: response => {
        this.placeSuggestions = response?.suggestions || [];
        this.placeSearchLoading = false;
        if (this.placeSuggestions.length === 0) {
          this.placeSearchError = 'No encontramos lugares con ese nombre en El Salvador.';
        }
      },
      error: error => {
        this.placeSearchLoading = false;
        this.placeSuggestions = [];
        this.placeSearchError = error?.error?.code === 'GOOGLE_PLACES_NOT_CONFIGURED'
          ? 'Esta ayuda requiere configurar Google Places en el servidor.'
          : (error?.error?.error || 'No pudimos buscar lugares en este momento.');
      }
    });
  }

  private matchRegisteredMunicipality(place: any): any | null {
    const components = Array.isArray(place?.addressComponents) ? place.addressComponents : [];
    const preferredTypes = ['locality', 'postal_town', 'administrative_area_level_2', 'sublocality_level_1'];
    const candidates = components
      .map((component: any) => ({
        value: component.longText || component.shortText || '',
        priority: preferredTypes.findIndex(type => component.types?.includes(type))
      }))
      .filter((candidate: any) => candidate.value)
      .sort((a: any, b: any) => {
        const aPriority = a.priority < 0 ? 99 : a.priority;
        const bPriority = b.priority < 0 ? 99 : b.priority;
        return aPriority - bPriority;
      });

    for (const candidate of candidates) {
      const normalizedCandidate = this.normalizeSearchText(candidate.value);
      const exactMatch = this.uniqueMunicipalities.find(municipality =>
        this.normalizeSearchText(municipality.municipio) === normalizedCandidate
      );
      if (exactMatch) return exactMatch;
    }

    const fullAddress = this.normalizeSearchText([
      place?.formattedAddress,
      ...candidates.map((candidate: any) => candidate.value)
    ].filter(Boolean).join(' '));

    return [...this.uniqueMunicipalities]
      .sort((a, b) => b.municipio.length - a.municipio.length)
      .find(municipality => fullAddress.includes(this.normalizeSearchText(municipality.municipio))) || null;
  }

  private createPlaceSessionToken(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `sivoy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  onDestinoInput(event: any) {
    const val = typeof event === 'string' ? event : event?.target?.value || '';
    this.destinoInputValue = val;
    this.locationSearchQuery = this.destinoInputValue;
    this.showAutocomplete = true;
    this.updateAutocompleteFilters();
  }

  private lastFocusTime = 0;

  focusInput(type: 'origen' | 'destino') {
    this.lastFocusTime = Date.now();
    this.activeInput = type;
    this.showAutocomplete = true;
    this.locationSearchQuery = type === 'origen' ? this.origenInputValue : this.destinoInputValue;
    this.updateAutocompleteFilters();
  }

  onSearchBoxClick(type: 'origen' | 'destino', event: MouseEvent) {
    event.stopPropagation();
    if (Date.now() - this.lastFocusTime > 200) {
      if (this.activeInput === type && this.showAutocomplete) {
        this.showAutocomplete = false;
      } else {
        this.activeInput = type;
        this.showAutocomplete = true;
        this.locationSearchQuery = type === 'origen' ? this.origenInputValue : this.destinoInputValue;
        this.updateAutocompleteFilters();
      }
    }
  }

  toggleAutocomplete(type: 'origen' | 'destino') {
    if (this.activeInput === type && this.showAutocomplete) {
      this.showAutocomplete = false;
      this.activeInput = null;
    } else {
      this.focusInput(type);
    }
    this.updateAutocompleteFilters();
  }

  clearInput(type: 'origen' | 'destino') {
    if (type === 'origen') {
      this.selectedOriginPoint = null;
      this.origenInputValue = '';
      this.origen = '';
      this.origenMunicipio = '';
      this.origenDepartamento = '';
      this.facade.setOrigin({ point: null, inputValue: '', municipality: '', department: '' });
    } else {
      this.selectedDestinationPoint = null;
      this.destinoInputValue = '';
      this.destino = '';
      this.destinoMunicipio = '';
      this.destinoDepartamento = '';
    }
    this.locationSearchQuery = '';
    this.updateAutocompleteFilters();
  }

  updateAutocompleteFilters() {
    this.filteredModalLocations = this.filteredLocations;
    // Basic filter for municipalities
    const query = this.locationSearchQuery ? this.locationSearchQuery.toLowerCase() : '';
    const normalize = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const normQuery = normalize(query);
    
    const muns = new Map<string, any>();
    this.locations.forEach(loc => {
      if (loc.ubicacion && loc.ubicacion.municipio) {
        const dep = loc.ubicacion.departamento || '';
        const key = `${loc.ubicacion.municipio}${dep ? ', ' + dep : ''}`;
        if (!muns.has(key)) {
          muns.set(key, {
            nombre_display: loc.ubicacion.municipio,
            municipio: loc.ubicacion.municipio,
            departamento: dep,
            pointCount: 0
          });
        }
        muns.get(key).pointCount += 1;
      }
    });

    this.uniqueMunicipalities = Array.from(muns.values()).sort((a, b) =>
      a.municipio.localeCompare(b.municipio, 'es', { sensitivity: 'base' })
    );
    this.filteredMunicipalities = this.uniqueMunicipalities.filter(m =>
      normalize(`${m.municipio} ${m.departamento}`).includes(normQuery)
    );
    this.filteredOriginMunicipalities = [...this.filteredMunicipalities];
  }

  selectFirstDestinationMunicipality() {
    if (this.filteredMunicipalities.length > 0) {
      this.selectMunicipality(this.filteredMunicipalities[0], 'destino');
    }
  }

  selectMyPosition() {
    if (this.activeInput === 'origen') {
      this.origenInputValue = 'Mi Ubicación';
      this.origen = 'Mi Ubicación';
    } else {
      this.destinoInputValue = 'Mi Ubicación';
      this.destino = 'Mi Ubicación';
    }
    this.handleSelectionHandoff('destino');
  }

  toggleSearchPanel() {
    if (this.isSearchExpanded) {
      this.closeLocationSelector();
    } else {
      this.openLocationSelector('destino');
    }
  }

  onPanelClick(event: Event) {
    this.showAutocomplete = false;
    event.stopPropagation();
  }

  selectUserLocationAsOrigin() {
    this.selectedOriginPoint = null;
    this.origenInputValue = 'Mi Ubicación';
    this.origen = 'Mi Ubicación';
    this.origenMunicipio = this.userMunicipalityName || '';
    this.facade.setOrigin({
      point: null,
      inputValue: 'Mi Ubicación',
      municipality: this.userMunicipalityName || '',
      department: ''
    });
    this.handleSelectionHandoff('origen');
    if (this.destino) {
      this.executeSearch();
    }
  }

  onRadiusChange() {
    this.updateAutocompleteFilters();
  }

  selectOriginMunicipality(mun: any) {
    this.selectedOriginPoint = null;
    this.origen = mun.nombre_display || mun.municipio;
    this.origenInputValue = mun.nombre_display || mun.municipio;
    this.origenMunicipio = mun.municipio;
    this.origenDepartamento = mun.departamento;
    this.facade.setOrigin({
      point: null,
      inputValue: mun.nombre_display || mun.municipio,
      municipality: mun.municipio,
      department: mun.departamento || ''
    });
    this.handleSelectionHandoff('origen');
    if (this.destino) {
      this.executeSearch();
    }
  }

  swapLocations() {
    const tempIn = this.origenInputValue;
    this.origenInputValue = this.destinoInputValue;
    this.destinoInputValue = tempIn;
    
    const temp = this.origen;
    this.origen = this.destino;
    this.destino = temp;

    const tempMunicipio = this.origenMunicipio;
    this.origenMunicipio = this.destinoMunicipio;
    this.destinoMunicipio = tempMunicipio;

    const tempDepartamento = this.origenDepartamento;
    this.origenDepartamento = this.destinoDepartamento;
    this.destinoDepartamento = tempDepartamento;

    const tempPoint = this.selectedOriginPoint;
    this.selectedOriginPoint = this.selectedDestinationPoint;
    this.selectedDestinationPoint = tempPoint;
    
    this.executeSearch();
  }

  handleSelectionHandoff(type: 'origen' | 'destino') {
    this.showAutocomplete = false;
    this.activeInput = null;
  }

  executeSearch() {
    this.isOriginChoiceMode = false;
    this.closeLocationSelector();
    this.triggerDynamicSearch();
  }

  onDateChanged() {
    this.triggerDynamicSearch();
  }

  triggerDynamicSearch() {
    if (this.origen && this.destino) {
      if (this.selectedOriginPoint || this.selectedDestinationPoint) {
        this.searchRoutesWithPointConstraints();
        return;
      }

      this.loading = true;
      this.bottomSheetState = 'half';
      this.errorMsg = '';
      this.flightResults = [];
      this.activeDetailedCard = null;
      
      this.isOriginDiscoveryMode = false;
      this.isDiscoveryMode = false;
      this.municipalityResults = [];
      this.displayedResults = [];
      
      const params: any = {
        origen: this.origen,
        destino: this.destino,
        origenIsPin: this.origen.includes('(Pin en Mapa)'),
        dropoffDate: this.dropoffDate,
        dropoffTime: this.dropoffTime,
        // Parámetros específicos para searchFlights
        origen_municipio: this.origenMunicipio || this.origen.split(',')[0]?.trim(),
        origen_departamento: this.origenDepartamento || this.origen.split(',')[1]?.trim() || '',
        destino_municipio: this.destinoMunicipio || this.destino.split(',')[0]?.trim(),
        destino_departamento: this.destinoDepartamento || this.destino.split(',')[1]?.trim() || '',
        dropoff_date: this.dropoffDate,
        dropoff_time: this.dropoffTime
      };

      this.rutasService.searchFlights(params).subscribe({
        next: (res: any) => {
          this.loading = false;
          this.result = res;
          if (res.success) {
            let vuelos = res.flights || res.results || [];
            
            // Filtrar agencias cerradas por hora hoy
            const now = new Date();
            const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();

            vuelos.forEach((vuelo: any) => {
              if (vuelo.opciones_entrega && vuelo.opciones_entrega.length > 0) {
                 vuelo.opciones_entrega = vuelo.opciones_entrega.filter((op: any) => {
                    if (op.dropoff_date === todayStr && op.dropoff_msg) {
                       const match = op.dropoff_msg.match(/a\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                       if (match) {
                          let endHour = parseInt(match[1], 10);
                          const endMinute = parseInt(match[2], 10);
                          const ampm = match[3].toUpperCase();
                          if (ampm === 'PM' && endHour < 12) endHour += 12;
                          if (ampm === 'AM' && endHour === 12) endHour = 0;
                          
                          if (currentHour > endHour || (currentHour === endHour && currentMinute > endMinute)) {
                             vuelo.hasClosedAlert = true;
                             return false; 
                          }
                       }
                    }
                    return true;
                 });
                 if (vuelo.opciones_entrega.length > 0) {
                    vuelo.selectedOption = vuelo.opciones_entrega[0];
                    if (vuelo.selected_opcion_idx === undefined || vuelo.selected_opcion_idx >= vuelo.opciones_entrega.length) {
                       vuelo.selected_opcion_idx = 0;
                    }
                 }
              }
            });

            this.flightResults = vuelos;
            this.bottomSheetState = 'expanded';
            this.updateMapMarkers.emit();
          } else {
            this.errorMsg = res.message || 'No se encontraron rutas.';
          }
        },
        error: (err: any) => {
          this.loading = false;
          this.errorMsg = 'Error de conexión al buscar rutas.';
        }
      });
    } else if (this.origenMunicipio && !this.destinoInputValue) {
      this.discoveryModeForOriginMunicipality(this.origenMunicipio, this.origenDepartamento);
    } else if (this.destinoMunicipio && !this.origenInputValue) {
      this.discoveryModeForMunicipality(this.destinoMunicipio, this.destinoDepartamento);
    }
  }

  discoveryModeForOriginMunicipality(municipio: string, departamento: string) {
    this.loading = true;
    this.result = null;
    this.errorMsg = '';
    this.flightResults = [];
    this.flightResults = [];
    this.municipalityResults = [];
    this.activeDetailedCard = null;
    this.expandedResultCard = null;
    this.bottomSheetState = 'half';
    this.isOriginDiscoveryMode = true; 
    this.isDiscoveryMode = false;

    const targets = this.locations.filter(l => 
      l.ubicacion?.municipio === municipio && 
      l.ubicacion?.departamento === departamento
    );

    if (targets.length === 0) {
      this.errorMsg = `No hay agencias de origen registradas en este municipio.`;
      this.loading = false;
      return;
    }

    this.municipalityResults = targets.map(loc => ({
      ...loc,
      destino_nombre: loc.nombre_destino,
      distance: loc.distance || 9999
    })).sort((a: any, b: any) => a.distance - b.distance);

    if (this.activeEmpresa) {
      this.setEmpresaFilter(this.activeEmpresa);
    } else {
      this.displayedResults = [...this.municipalityResults];
    }

    this.loading = false;
    this.updateMapMarkers.emit();
  }

  discoveryModeForMunicipality(municipio: string, departamento: string) {
    this.loading = true;
    this.result = null;
    this.errorMsg = '';
    this.flightResults = [];
    this.municipalityResults = [];
    this.activeDetailedCard = null;
    this.expandedResultCard = null;
    this.bottomSheetState = 'half';
    this.isDiscoveryMode = true;
    this.isOriginDiscoveryMode = false;

    const targets = this.locations.filter(l => 
      l.ubicacion?.municipio === municipio && 
      l.ubicacion?.departamento === departamento
    );

    if (targets.length === 0) {
      this.errorMsg = `No hay agencias registradas en este municipio.`;
      this.loading = false;
      return;
    }

    this.municipalityResults = targets.map(loc => ({
      ...loc,
      destino_nombre: loc.nombre_destino,
      distance: loc.distance || 9999
    })).sort((a: any, b: any) => a.distance - b.distance);

    if (this.activeEmpresa) {
      this.setEmpresaFilter(this.activeEmpresa);
    } else {
      this.displayedResults = [...this.municipalityResults];
    }

    this.loading = false;
    this.updateMapMarkers.emit();
  }

  toggleExpandFlight(flight: any) {
    if (this.expandedResultCard === flight) {
      this.expandedResultCard = null;
    } else {
      this.expandedResultCard = flight;
    }
  }

  toggleRouteCard(flight: RouteResultViewModel) {
    flight.isExpanded = !flight.isExpanded;
  }

  onDeliveryDayChange(payload: RouteDeliveryDayChange) {
    payload.route.selected_opcion_idx = payload.index;
  }

  highlightRouteOnMap(flight: any) {
    this.mapHighlightRoute.emit(flight);
    this.expandedResultCard = null;
    this.bottomSheetState = 'collapsed';
  }

  showOriginPinDetails(flight: any) {
    this.showPinDetails.emit({ location: flight, type: 'origen' });
  }

  showDestinoPinDetails(flight: any) {
    this.showPinDetails.emit({ location: flight, type: 'destino' });
  }

  onSheetScroll(event: Event) {
    const el = event.target as HTMLElement;
    this.isSheetScrolled = el.scrollTop > 10;
  }

  toggleResultCard(flight: any) {
    this.lastSelectedLocationId = flight.id_destino || flight.id_origen || flight.id;
    if (this.isDiscoveryMode || this.isOriginDiscoveryMode) {
      this.showPinDetails.emit({ location: flight, type: this.isDiscoveryMode ? 'destino' : 'origen' });
    } else {
      this.toggleExpandFlight(flight);
    }
  }

  countResultsByEmpresa(empresa: string): number {
    return this.displayedResults.filter(r => r.empresa === empresa).length;
  }

  startRouteForCompany(empresa: string) {
    // Basic fallback to trigger search logic
    if (this.isOriginDiscoveryMode) {
      this.origenInputValue = 'Mi Ubicación';
      this.origen = 'Mi Ubicación';
      this.destino = this.locationSearchQuery; // Or the municipality name
    } else {
      this.origenInputValue = 'Mi Ubicación';
      this.origen = 'Mi Ubicación';
      this.destino = this.locationSearchQuery;
    }
  }

  formatTime(timeStr: string): string {
    return formatScheduleTime(timeStr);
  }

  getGroupedSchedules(horarios: any[]): GroupedSchedule[] {
    if (!horarios || horarios.length === 0) return [];
    const cachedGroups = this.groupedScheduleCache.get(horarios);
    if (cachedGroups) return cachedGroups;
    
    const result = groupConsecutiveSchedules(horarios);
    
    this.groupedScheduleCache.set(horarios, result);
    return result;
  }

  formatLocationName(name: string, type?: string): string {
    return rtFormatLoc(name, type);
  }

  formatFriendlyDate(dateStr: string): string {
    return rtFormatDate(dateStr);
  }

  recenterMap() {
    this.recenterMapEvent.emit();
  }

  previewImage(url: string | null) {
    if (!url) return;
    this.previewImageEvent.emit(this.resolveImageUrl(url));
  }

  isPointCardExpanded(point: any): boolean {
    return this.expandedResultCard === point;
  }

  togglePointCard(point: any) {
    this.expandedResultCard = this.isPointCardExpanded(point) ? null : point;
  }

  resolveImageUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    return `${environment.apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  hasPointImage(point: any): boolean {
    const url = this.resolveImageUrl(point?.imagen_referencia);
    return Boolean(url) && !this.unavailablePointImages.has(url);
  }

  markPointImageUnavailable(point: any) {
    const url = this.resolveImageUrl(point?.imagen_referencia);
    if (url) this.unavailablePointImages.add(url);
  }

  async shareLocation(loc: any) {
    await this.sharePointResource(loc);
  }

  async sharePointResource(loc: any) {
    const imageUrl = this.hasPointImage(loc) ? this.resolveImageUrl(loc?.imagen_referencia) : undefined;
    await this.pointShareService.sharePoint(loc, imageUrl);
  }

  async copyPointResource(loc: any) {
    const imageUrl = this.resolveImageUrl(loc?.imagen_referencia);
    await this.pointShareService.copyPoint(loc, imageUrl || undefined);
  }

  resetMapMarkers() {
    this.resetMapMarkersEvent.emit();
  }

  showNearbyPoints() {
    this.showNearbyPointsEvent.emit();
  }

  onPinCardTouchStart(event: TouchEvent) {
    this.pinCardTouchStartY = event.touches[0]?.clientY || 0;
    this.suppressPinImagePreview = false;
  }

  onPinCardTouchEnd(event: TouchEvent) {
    const offset = (event.changedTouches[0]?.clientY || this.pinCardTouchStartY) - this.pinCardTouchStartY;
    if (Math.abs(offset) >= 34) {
      this.isPinCardExpanded = offset < 0;
      this.pinCardStateLocked = true;
      this.suppressPinImagePreview = true;
      event.preventDefault();
    }
  }

  togglePinCard() {
    this.isPinCardExpanded = !this.isPinCardExpanded;
    this.pinCardStateLocked = true;
  }

  openPinImagePreview(url: string) {
    if (this.suppressPinImagePreview) {
      this.suppressPinImagePreview = false;
      return;
    }
    this.previewImage(url);
  }

  onSheetPointerDown(event: PointerEvent) {
    if (this.bottomSheetState === 'hidden' || (event.pointerType === 'mouse' && event.button !== 0)) return;

    this.activeSheetPointerId = event.pointerId;
    this.sheetDragStartY = event.clientY;
    this.sheetDragStartedAt = performance.now();
    this.sheetDragOffset = 0;
    this.isSheetDragging = true;
    this.didSheetDrag = false;

    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onSheetPointerMove(event: PointerEvent) {
    if (!this.isSheetDragging || event.pointerId !== this.activeSheetPointerId) return;

    const rawOffset = event.clientY - this.sheetDragStartY;
    const viewportLimit = Math.max(180, window.innerHeight * 0.58);
    const upwardLimit = this.bottomSheetState === 'expanded' ? 24 : viewportLimit;
    const downwardLimit = this.bottomSheetState === 'collapsed' ? 24 : viewportLimit;

    this.sheetDragOffset = Math.max(-upwardLimit, Math.min(downwardLimit, rawOffset));
    this.didSheetDrag = this.didSheetDrag || Math.abs(rawOffset) > 5;

    if (this.didSheetDrag) event.preventDefault();
  }

  onSheetPointerEnd(event: PointerEvent) {
    if (!this.isSheetDragging || event.pointerId !== this.activeSheetPointerId) return;

    const elapsed = Math.max(1, performance.now() - this.sheetDragStartedAt);
    const velocity = this.sheetDragOffset / elapsed;
    const shouldSnap = Math.abs(this.sheetDragOffset) >= 44 || Math.abs(velocity) >= 0.35;

    if (shouldSnap) {
      this.stepSheet(this.sheetDragOffset < 0 ? 'up' : 'down');
    }

    const captureTarget = event.currentTarget as HTMLElement;
    if (captureTarget.hasPointerCapture?.(event.pointerId)) {
      captureTarget.releasePointerCapture(event.pointerId);
    }
    this.activeSheetPointerId = null;
    this.isSheetDragging = false;
    this.sheetDragOffset = 0;

    setTimeout(() => {
      this.didSheetDrag = false;
    });
  }

  onSheetHeaderClick() {
    if (!this.didSheetDrag) this.expandSheetIfNeeded();
  }

  onSheetHandleClick(event: MouseEvent) {
    event.stopPropagation();
    if (!this.didSheetDrag) this.toggleSheet();
  }

  private stepSheet(direction: 'up' | 'down') {
    if (direction === 'up') {
      if (this.bottomSheetState === 'collapsed') this.bottomSheetState = 'half';
      else if (this.bottomSheetState === 'half') this.bottomSheetState = 'expanded';
      return;
    }

    if (this.bottomSheetState === 'expanded') this.bottomSheetState = 'half';
    else if (this.bottomSheetState === 'half') this.bottomSheetState = 'collapsed';
  }

  toggleSheet() {
    if (this.bottomSheetState === 'collapsed') this.bottomSheetState = 'half';
    else if (this.bottomSheetState === 'half') this.bottomSheetState = 'expanded';
    else this.bottomSheetState = 'collapsed';
  }

  expandSheetIfNeeded() {
    if (this.bottomSheetState === 'collapsed') this.bottomSheetState = 'half';
  }

  setPinAsOriginAndPromptDestination() {
    if (this.selectedPin) {
       this.selectedOriginPoint = this.selectedPin;
       this.origenInputValue = this.selectedPin.nombre_destino || this.selectedPin.destino_nombre;
       this.origen = this.origenInputValue;
       this.origenMunicipio = this.selectedPin.ubicacion?.municipio || '';
       this.origenDepartamento = this.selectedPin.ubicacion?.departamento || '';
       if (this.destino) {
          this.selectedPin = null;
          this.triggerDynamicSearch();
       } else {
          this.openLocationSelector('destino');
       }
    }
  }

  setEmpresaFilter(empresa: string) {
    this.activeEmpresa = empresa;
    if (!empresa) {
      this.displayedResults = [...this.municipalityResults];
    } else {
      this.displayedResults = this.municipalityResults.filter(r => r.empresa === empresa);
    }
  }

  setPinAsDestinationAndPromptOrigin() {
    if (this.selectedPin) {
       this.selectedDestinationPoint = this.selectedPin;
       this.destinoInputValue = this.selectedPin.nombre_destino || this.selectedPin.destino_nombre;
       this.destino = this.destinoInputValue;
       this.destinoMunicipio = this.selectedPin.ubicacion?.municipio || '';
       this.destinoDepartamento = this.selectedPin.ubicacion?.departamento || '';
       if (this.origen) {
          this.selectedPin = null;
          this.triggerDynamicSearch();
       } else {
          this.selectedPin = null;
          this.isOriginChoiceMode = true;
          this.originPointQuery = '';
          this.originPointPage = 1;
          this.bottomSheetState = 'half';
       }
    }
  }

  viewPointOnMap(point: any) {
    this.lastSelectedLocationId = point.id_destino || point.id_origen || point.id;
    this.mapResourceMode = true;
    this.mapResourceModeChange.emit(true);
    this.showPinDetails.emit({
      location: point,
      type: this.isOriginDiscoveryMode ? 'origen' : 'destino'
    });
  }

  selectPointFromList(point: any) {
    const locationName = this.getLocationName(point);
    this.lastSelectedLocationId = point.id_destino || point.id_origen || point.id;
    this.expandedResultCard = null;
    this.result = null;
    this.errorMsg = '';

    if (this.isOriginDiscoveryMode) {
      this.selectedOriginPoint = point;
      this.origen = locationName;
      this.origenInputValue = locationName;
      this.origenMunicipio = point.ubicacion?.municipio || '';
      this.origenDepartamento = point.ubicacion?.departamento || '';
      this.isOriginDiscoveryMode = false;
      this.municipalityResults = [];
      this.displayedResults = [];

      if (this.destino) {
        this.executeSearch();
      } else {
        this.openLocationSelector('destino');
      }
      return;
    }

    this.selectedDestinationPoint = point;
    this.destino = locationName;
    this.destinoInputValue = locationName;
    this.destinoMunicipio = point.ubicacion?.municipio || '';
    this.destinoDepartamento = point.ubicacion?.departamento || '';
    this.isDiscoveryMode = false;
    this.municipalityResults = [];
    this.displayedResults = [];

    if (this.origen) {
      this.executeSearch();
      return;
    }

    this.isOriginChoiceMode = true;
    this.originPointQuery = '';
    this.originPointPage = 1;
    this.bottomSheetState = 'half';
  }

  get compatibleOriginPoints(): any[] {
    if (!this.selectedDestinationPoint?.empresa) return [];

    const destinationId = this.getLocationIdentity(this.selectedDestinationPoint);
    return this.locations
      .filter(location =>
        location.empresa === this.selectedDestinationPoint.empresa &&
        this.getLocationIdentity(location) !== destinationId
      )
      .sort((a, b) => {
        const municipalityComparison = (a.ubicacion?.municipio || '').localeCompare(
          b.ubicacion?.municipio || '',
          'es',
          { sensitivity: 'base' }
        );
        return municipalityComparison || this.getLocationName(a).localeCompare(this.getLocationName(b), 'es');
      });
  }

  get filteredCompatibleOriginPoints(): any[] {
    const normalizedQuery = this.normalizeSearchText(this.originPointQuery);
    if (!normalizedQuery) return this.compatibleOriginPoints;

    return this.compatibleOriginPoints.filter(point =>
      this.normalizeSearchText([
        this.getLocationName(point),
        point.ubicacion?.municipio,
        point.ubicacion?.departamento
      ].filter(Boolean).join(' ')).includes(normalizedQuery)
    );
  }

  get visibleCompatibleOriginPoints(): any[] {
    const start = (this.originPointPage - 1) * this.originPointPageSize;
    return this.filteredCompatibleOriginPoints.slice(start, start + this.originPointPageSize);
  }

  get originPointPageCount(): number {
    return Math.max(1, Math.ceil(this.filteredCompatibleOriginPoints.length / this.originPointPageSize));
  }

  onOriginPointQueryChange() {
    this.originPointPage = 1;
  }

  changeOriginPointPage(direction: -1 | 1) {
    this.originPointPage = Math.min(
      this.originPointPageCount,
      Math.max(1, this.originPointPage + direction)
    );
  }

  restartOriginSelection() {
    this.origenInputValue = '';
    this.origen = '';
    this.origenMunicipio = '';
    this.origenDepartamento = '';
    this.selectedOriginPoint = null;
    this.originPointQuery = '';
    this.originPointPage = 1;
    this.result = null;
    this.errorMsg = '';
    this.flightResults = [];
    this.expandedResultCard = null;
    this.activeDetailedCard = null;
    this.isOriginDiscoveryMode = false;
    this.isDiscoveryMode = false;
    this.resetMapMarkersEvent.emit();

    if (this.selectedDestinationPoint) {
      this.isOriginChoiceMode = true;
      this.bottomSheetState = 'half';
      return;
    }

    this.isOriginChoiceMode = false;
    this.openLocationSelector('origen');
  }

  openOriginMunicipalitySelector() {
    this.origenInputValue = '';
    this.origen = '';
    this.origenMunicipio = '';
    this.origenDepartamento = '';
    this.selectedOriginPoint = null;
    this.openLocationSelector('origen');
  }

  selectCompatibleOriginPoint(location: any) {
    this.selectLocation(location, 'origen');
  }

  changeDestinationFromOriginChoice() {
    this.isOriginChoiceMode = false;
    this.selectedDestinationPoint = null;
    this.originPointQuery = '';
    this.originPointPage = 1;
    this.destinoInputValue = '';
    this.destino = '';
    this.destinoMunicipio = '';
    this.destinoDepartamento = '';
    this.openLocationSelector('destino');
  }

  private getLocationIdentity(location: any): string {
    return String(location?.id_destino || location?.id_origen || location?.id || this.getLocationName(location));
  }

  private getLocationName(location: any): string {
    return location?.nombre_destino || location?.destino_nombre || location?.destino_nombre_destino || '';
  }

  private normalizeSearchText(value: string): string {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private getMunicipalityLocations(municipio: string, departamento: string): any[] {
    if (!municipio) return [];
    return this.locations.filter(location =>
      location.ubicacion?.municipio === municipio &&
      (!departamento || location.ubicacion?.departamento === departamento)
    );
  }

  private searchRoutesWithPointConstraints() {
    this.loading = true;
    this.bottomSheetState = 'half';
    this.errorMsg = '';
    this.result = null;
    this.flightResults = [];
    this.municipalityResults = [];
    this.displayedResults = [];
    this.isOriginChoiceMode = false;
    this.isOriginDiscoveryMode = false;
    this.isDiscoveryMode = false;

    const originLocations = this.selectedOriginPoint
      ? [this.selectedOriginPoint]
      : this.getMunicipalityLocations(this.origenMunicipio, this.origenDepartamento);
    const destinationLocations = this.selectedDestinationPoint
      ? [this.selectedDestinationPoint]
      : this.getMunicipalityLocations(this.destinoMunicipio, this.destinoDepartamento);

    const originNames = [...new Set<string>(originLocations.map(location => this.getLocationName(location)).filter(Boolean))];
    const destinationNames = [...new Set<string>(destinationLocations.map(location => this.getLocationName(location)).filter(Boolean))];

    if (originNames.length === 0 || destinationNames.length === 0) {
      this.loading = false;
      this.errorMsg = 'No encontramos puntos operativos para completar esta combinación.';
      return;
    }

    this.rutasService.getUpcomingRoutes({
      origen: originNames,
      destino: destinationNames,
      dropoff_date: this.dropoffDate,
      dropoff_time: this.dropoffTime
    }).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.result = response;

        const routes = response.results || [];
        this.flightResults = routes.map((route: any) => {
          const originLocation = originLocations.find(location => this.getLocationName(location) === route.origen_nombre);
          const destinationLocation = destinationLocations.find(location => this.getLocationName(location) === route.destino_nombre);
          const firstOption = route.opciones_entrega?.[0] || route.opciones?.[0] || null;

          return {
            ...route,
            origen_tipo: originLocation?.tipo,
            origen_lat: originLocation?.ubicacion?.lat,
            origen_lng: originLocation?.ubicacion?.lng,
            destino_nombre_destino: route.destino_nombre,
            destino_tipo: destinationLocation?.tipo,
            destino_lat: destinationLocation?.ubicacion?.lat,
            destino_lng: destinationLocation?.ubicacion?.lng,
            fecha_llegada: route.fecha_llegada || firstOption?.fecha_llegada,
            horario_recoleccion: route.horario_recoleccion || firstOption?.horario_recoleccion,
            selectedOption: firstOption,
            selected_opcion_idx: 0,
            distance: 0
          };
        });

        if (this.flightResults.length === 0) {
          this.errorMsg = response.origen_msg || 'No hay rutas disponibles para esta combinación.';
          this.bottomSheetState = 'half';
          return;
        }

        this.bottomSheetState = 'expanded';
        this.updateMapMarkers.emit();
      },
      error: () => {
        this.loading = false;
        this.errorMsg = 'Error de conexión al buscar la ruta punto a punto.';
      }
    });
  }

  closePinDetails() {
    this.selectedPin = null; // Esto triggerea el setter que restaurará el bottomSheetState a 'half'
    this.clearMap.emit();
  }

  copyPinDetails() {
    if (!this.selectedPin) return;
    const textToShare = `📍 ${this.selectedPin.nombre_destino || this.selectedPin.destino_nombre}\n🏢 Empresa: ${this.selectedPin.empresa || 'Agencia'}\n🗺️ Ubicación: ${this.selectedPin.ubicacion?.municipio || 'N/A'}, ${this.selectedPin.ubicacion?.departamento || 'N/A'}\n🛣️ Dirección: ${this.selectedPin.direccion_referencia || 'N/A'}\n📍 Maps: ${this.selectedPin.maps_url || 'N/A'}`;
    navigator.clipboard.writeText(textToShare).then(() => {
        this.toastService.showSuccess('¡Información del punto copiada al portapapeles!', 'Copiado');
    });
  }

  openInGoogleMaps() {
    if (!this.selectedPin) return;
    
    if (this.selectedPin.maps_url && this.selectedPin.maps_url.trim() !== '') {
      window.open(this.selectedPin.maps_url, '_blank');
      return;
    }

    if (this.selectedPin.ubicacion && this.selectedPin.ubicacion.lat && this.selectedPin.ubicacion.lng) {
      const url = `https://www.google.com/maps/search/?api=1&query=${this.selectedPin.ubicacion.lat},${this.selectedPin.ubicacion.lng}`;
      window.open(url, '_blank');
      return;
    }

    const query = `${this.selectedPin.nombre_destino || ''} ${this.selectedPin.ubicacion?.municipio || ''} El Salvador`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
  }

  onDayFilterChange() {
    // Handled by ngModel
  }

  getDisplayedSchedules(pin: any): any[] {
    if (!pin || !pin.horarios_operativos) return [];
    if (!this.selectedPinDayFilter) return pin.horarios_operativos;
    return pin.horarios_operativos.filter((h: any) => h.dia_semana === this.selectedPinDayFilter);
  }

  viewCardDetails(card: any) {
    this.activeDetailedCard = card;
    this.focusLocation.emit(card);
    card.isExpanded = true;
  }

  backToList() {
    this.activeDetailedCard = null;
    this.resetMapMarkersEvent.emit();
  }
}
