import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef, AfterViewInit, HostListener, ElementRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RutasService, RouteSearchParams } from '../../core/services/rutas.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html',
  encapsulation: ViewEncapsulation.None
})
export class HomeComponent implements OnInit {
  @Input() locations: any[] = [];
  @Input() userLocation: any = null;
  @Input() selectedPin: any = null;
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

  origen: string = '';
  destino: string = '';
  origenInputValue: string = '';
  destinoInputValue: string = '';
  dropoffDate: string = '';
  dropoffTime: string = '';
  activeInput: 'origen' | 'destino' | null = null;
  locationSearchQuery: string = '';
  isSearchExpanded: boolean = false;
  isDiscoveryMode: boolean = false;
  isOriginDiscoveryMode: boolean = false;
  bottomSheetState: 'collapsed' | 'half' | 'expanded' = 'collapsed';
  isSheetScrolled: boolean = false;
  loading: boolean = false;
  errorMsg: string = '';
  result: any = null;
  touchStartY: number = 0;
  selectingLocation: string | null = null;
  destinoMunicipio: string = '';
  activeEmpresa: string = '';
  showAdvanced: boolean = false;
  arrivalDate: string = '';
  selectedPinDayFilter: string = '';
  
  municipalityResults: any[] = [];
  flightResults: any[] = [];
  displayedResults: any[] = [];
  expandedResultCard: any = null;
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

  constructor(private rutasService: RutasService, private toastService: ToastService) {}

  ngOnInit() {
    const today = new Date();
    this.dropoffDate = today.toISOString().split('T')[0];
    this.dropoffTime = today.toTimeString().substring(0,5);
  }

  // UI Handlers
  openLocationSelector(type: 'origen' | 'destino') {
    this.activeInput = type;
    this.isSearchExpanded = true;
    this.locationSearchQuery = type === 'origen' ? this.origenInputValue : this.destinoInputValue;
  }

  closeLocationSelector() {
    this.activeInput = null;
    this.isSearchExpanded = false;
  }

  clearSearch() {
    this.origenInputValue = '';
    this.destinoInputValue = '';
    this.origen = '';
    this.destino = '';
    this.locationSearchQuery = '';
    this.bottomSheetState = 'collapsed';
    this.clearMap.emit();
  }

  onSearchLocation(query: string) {
    this.locationSearchQuery = query;
  }

  get filteredLocations() {
    if (!this.locationSearchQuery) return [];
    const query = this.locationSearchQuery.toLowerCase();
    const normalize = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const normQuery = normalize(query);
    
    return this.locations.filter(l => 
      normalize(l.nombre_destino).includes(normQuery) || 
      normalize(l.ubicacion?.municipio).includes(normQuery) ||
      normalize(l.ubicacion?.departamento).includes(normQuery)
    );
  }

  selectLocation(loc: any, type: 'origen' | 'destino') {
    if (type === 'origen') {
      this.origenInputValue = loc.nombre_destino;
      this.origen = loc.nombre_destino;
    } else {
      this.destinoInputValue = loc.nombre_destino;
      this.destino = loc.nombre_destino;
    }
    this.closeLocationSelector();
    this.executeSearch();
  }

  selectMunicipality(mun: string, type: 'origen' | 'destino') {
    if (type === 'origen') {
      this.origenInputValue = mun;
      this.origen = ''; // Not a specific point, but a municipality
      this.destinoMunicipio = mun;
    } else {
      this.destinoInputValue = mun;
      this.destino = '';
      this.destinoMunicipio = mun;
    }
    this.closeLocationSelector();
    this.executeSearch();
  }

  onOrigenInput(event: any) {
    this.origenInputValue = event.target.value;
    this.locationSearchQuery = this.origenInputValue;
    this.showAutocomplete = true;
    this.updateAutocompleteFilters();
  }

  onDestinoInput(event: any) {
    this.destinoInputValue = event.target.value;
    this.locationSearchQuery = this.destinoInputValue;
    this.showAutocomplete = true;
    this.updateAutocompleteFilters();
  }

  focusInput(type: 'origen' | 'destino') {
    this.activeInput = type;
    this.showAutocomplete = true;
    this.locationSearchQuery = type === 'origen' ? this.origenInputValue : this.destinoInputValue;
    this.updateAutocompleteFilters();
  }

  clearInput(type: 'origen' | 'destino') {
    if (type === 'origen') {
      this.origenInputValue = '';
      this.origen = '';
    } else {
      this.destinoInputValue = '';
      this.destino = '';
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
    
    // In a real app this would extract distinct municipalities from this.locations
    this.uniqueMunicipalities = Array.from(new Set(this.locations.map(l => l.ubicacion?.municipio).filter(m => m))) as string[];
    this.filteredMunicipalities = this.uniqueMunicipalities.filter(m => normalize(m).includes(normQuery));
    this.filteredOriginMunicipalities = [...this.filteredMunicipalities];
  }

  selectMyPosition() {
    if (this.activeInput === 'origen') {
      this.origenInputValue = 'Mi Ubicación';
      this.origen = 'Mi Ubicación';
    } else {
      this.destinoInputValue = 'Mi Ubicación';
      this.destino = 'Mi Ubicación';
    }
    this.closeLocationSelector();
    this.executeSearch();
  }

  toggleSearchPanel() {
    this.isSearchExpanded = !this.isSearchExpanded;
  }

  onPanelClick(event: Event) {
    event.stopPropagation();
  }

  selectUserLocationAsOrigin() {
    this.origenInputValue = 'Mi Ubicación';
    this.origen = 'Mi Ubicación';
    this.closeLocationSelector();
    this.executeSearch();
  }

  onRadiusChange() {
    this.updateAutocompleteFilters();
  }

  selectOriginMunicipality(mun: any) {
    this.origenInputValue = mun.nombre_display || mun.municipio;
    this.origen = '';
    this.origenDepartamento = mun.departamento;
    this.closeLocationSelector();
    this.executeSearch();
  }

  swapLocations() {
    const tempIn = this.origenInputValue;
    this.origenInputValue = this.destinoInputValue;
    this.destinoInputValue = tempIn;
    
    const temp = this.origen;
    this.origen = this.destino;
    this.destino = temp;
    
    this.executeSearch();
  }

  executeSearch() {
    this.triggerDynamicSearch();
  }

  onDateChanged() {
    this.triggerDynamicSearch();
  }

  triggerDynamicSearch() {
    if (this.origen && this.destino) {
      this.loading = true;
      this.bottomSheetState = 'half';
      this.errorMsg = '';
      this.flightResults = [];
      
      const params: RouteSearchParams = {
        origen: this.origen,
        destino: this.destino,
        origenIsPin: this.origen.includes('(Pin en Mapa)'),
        dropoffDate: this.dropoffDate,
        dropoffTime: this.dropoffTime
      };

      this.rutasService.searchFlights(params).subscribe({
        next: (res: any) => {
          this.loading = false;
          this.result = res;
          if (res.success) {
            this.flightResults = res.flights;
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
    }
  }

  toggleExpandFlight(flight: any) {
    if (this.expandedResultCard === flight) {
      this.expandedResultCard = null;
    } else {
      this.expandedResultCard = flight;
    }
  }

  onDeliveryDayChange(flight: any, event: any) {
    flight.selected_opcion_idx = parseInt(event.target.value);
  }

  highlightRouteOnMap(flight: any) {
    this.mapHighlightRoute.emit(flight);
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
    this.toggleExpandFlight(flight);
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
    this.executeSearch();
  }

  formatTime(timeStr: string): string {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${minutes} ${ampm}`;
  }

  formatFriendlyDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${dias[date.getDay()]} ${date.getDate()}`;
  }

  recenterMap() {
    this.recenterMapEvent.emit();
  }

  previewImage(url: string | null) {
    if (!url) return;
    this.previewImageEvent.emit('http://localhost:3000' + url);
  }

  shareLocation(loc: any) {
    if (navigator.share) {
      navigator.share({
        title: loc.nombre_destino,
        text: `📍 *${loc.nombre_destino}*\n🏢 ${loc.empresa}\n🗺️ ${loc.ubicacion?.municipio || 'SV'}\nConsulta más detalles en SiVoy.`,
        url: window.location.href,
      }).catch((error) => console.log('Error sharing', error));
    } else {
      const text = `📍 *${loc.nombre_destino}*\n🏢 ${loc.empresa}\n🗺️ ${loc.ubicacion?.municipio || 'SV'}`;
      navigator.clipboard.writeText(text).then(() => {
        alert('Información copiada al portapapeles');
      });
    }
  }

  resetMapMarkers() {
    this.resetMapMarkersEvent.emit();
  }

  showNearbyPoints() {
    this.showNearbyPointsEvent.emit();
  }

  onTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0].clientY;
  }
  
  onTouchEnd(event: TouchEvent) {
    const touchEndY = event.changedTouches[0].clientY;
    const diff = touchEndY - this.touchStartY;
    
    if (diff > 50) {
      if (this.bottomSheetState === 'expanded') {
        this.bottomSheetState = 'half';
      } else if (this.bottomSheetState === 'half') {
        this.bottomSheetState = 'collapsed';
      }
    } else if (diff < -50) {
      if (this.bottomSheetState === 'collapsed') {
        this.bottomSheetState = 'half';
      } else if (this.bottomSheetState === 'half') {
        this.bottomSheetState = 'expanded';
      }
    }
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
       this.origenInputValue = this.selectedPin.nombre_destino || this.selectedPin.destino_nombre;
       this.origen = this.origenInputValue;
       this.openLocationSelector('destino');
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
       this.destinoInputValue = this.selectedPin.nombre_destino || this.selectedPin.destino_nombre;
       this.destino = this.destinoInputValue;
       this.openLocationSelector('origen');
    }
  }

  closePinDetails() {
    this.selectedPin = null;
    this.clearMap.emit();
  }

  copyPinDetails() {
    if (!this.selectedPin) return;
    const textToShare = `📍 ${this.selectedPin.nombre_destino || this.selectedPin.destino_nombre}\n🏢 Empresa: ${this.selectedPin.empresa || 'Agencia'}\n🗺️ Ubicación: ${this.selectedPin.ubicacion?.municipio || 'N/A'}, ${this.selectedPin.ubicacion?.departamento || 'N/A'}\n📍 Dirección: ${this.selectedPin.direccion_referencia || 'N/A'}\n🔗 Maps: ${this.selectedPin.maps_url || 'N/A'}`;
    navigator.clipboard.writeText(textToShare).then(() => {
        this.toastService.showSuccess('¡Información del punto copiada al portapapeles!', 'Copiado');
    });
  }

  onDayFilterChange() {
    // Handled by ngModel
  }

  getDisplayedSchedules(pin: any): any[] {
    if (!pin || !pin.horarios_operativos) return [];
    if (!this.selectedPinDayFilter) return pin.horarios_operativos;
    return pin.horarios_operativos.filter((h: any) => h.dia_semana === this.selectedPinDayFilter);
  }
}
