import { environment } from '../../../environments/environment';
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
  apiUrl = environment.apiUrl;
  @Input() locations: any[] = [];
  @Input() userLocation: any = null;
  private _selectedPin: any = null;
  activePinTab: 'info' | 'horarios' = 'info';

  @Input() set selectedPin(value: any) {
    this._selectedPin = value;
    if (value) {
      this.activePinTab = 'info';
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
            
            // Calculate target scroll to center the element
            let targetScrollTop = absoluteElTop - (containerRect.height / 2) + (elRect.height / 2);
            
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
  bottomSheetState: 'hidden' | 'collapsed' | 'half' | 'expanded' = 'collapsed';
  isSheetScrolled: boolean = false;
  loading: boolean = false;
  errorMsg: string = '';
  result: any = null;
  touchStartY: number = 0;
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
    this.flightResults = [];
    this.municipalityResults = [];
    this.displayedResults = [];
    this.clearMap.emit();
    this.updateMapMarkers.emit();
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
      this.origenMunicipio = loc.ubicacion?.municipio;
      this.origenDepartamento = loc.ubicacion?.departamento;
    } else {
      this.destinoInputValue = loc.nombre_destino;
      this.destino = loc.nombre_destino;
      this.destinoMunicipio = loc.ubicacion?.municipio;
      this.destinoDepartamento = loc.ubicacion?.departamento;
    }
    this.handleSelectionHandoff(type);
  }

  selectMunicipality(mun: any, type: 'origen' | 'destino') {
    if (type === 'origen') {
      this.origenInputValue = mun.municipio;
      this.origen = mun.municipio;
      this.origenMunicipio = mun.municipio;
    } else {
      this.destinoInputValue = mun.municipio;
      this.destino = mun.municipio;
      this.destinoMunicipio = mun.municipio;
    }
    this.handleSelectionHandoff(type);
  }

  onOrigenInput(event: any) {
    const val = typeof event === 'string' ? event : event?.target?.value || '';
    this.origenInputValue = val;
    this.locationSearchQuery = this.origenInputValue;
    this.showAutocomplete = true;
    this.updateAutocompleteFilters();
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
    
    const muns = new Map();
    this.locations.forEach(loc => {
      if (loc.ubicacion && loc.ubicacion.municipio) {
        const dep = loc.ubicacion.departamento || '';
        const key = `${loc.ubicacion.municipio}${dep ? ', ' + dep : ''}`;
        if (!muns.has(key)) {
          muns.set(key, {
            nombre_display: loc.ubicacion.municipio,
            municipio: loc.ubicacion.municipio,
            departamento: dep
          });
        }
      }
    });

    this.uniqueMunicipalities = Array.from(muns.values());
    this.filteredMunicipalities = this.uniqueMunicipalities.filter(m => normalize(m.municipio).includes(normQuery));
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
    this.handleSelectionHandoff('destino');
  }

  toggleSearchPanel() {
    this.isSearchExpanded = !this.isSearchExpanded;
  }

  onPanelClick(event: Event) {
    this.showAutocomplete = false;
    event.stopPropagation();
  }

  selectUserLocationAsOrigin() {
    this.origenInputValue = 'Mi Ubicación';
    this.origen = 'Mi Ubicación';
    this.handleSelectionHandoff('origen');
  }

  onRadiusChange() {
    this.updateAutocompleteFilters();
  }

  selectOriginMunicipality(mun: any) {
    this.origen = mun.nombre_display;
    this.origenInputValue = mun.nombre_display;
    this.origenMunicipio = mun.municipio;
    this.origenDepartamento = mun.departamento;
    this.handleSelectionHandoff('origen');
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

  handleSelectionHandoff(type: 'origen' | 'destino') {
    this.showAutocomplete = false;
    this.activeInput = null;
  }

  executeSearch() {
    this.closeLocationSelector();
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
        origen_municipio: this.origen.split(',')[0]?.trim(),
        origen_departamento: this.origen.split(',')[1]?.trim() || '',
        destino_municipio: this.destino.split(',')[0]?.trim(),
        destino_departamento: this.destino.split(',')[1]?.trim() || '',
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

  onDeliveryDayChange(flight: any, event: any) {
    flight.selected_opcion_idx = parseInt(event.target.value);
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
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h < 10 ? '0' + h : h}:${minutes} ${ampm}`;
  }

  getGroupedSchedules(horarios: any[]): { dias: string, apertura: string, cierre: string }[] {
    if (!horarios || horarios.length === 0) return [];
    
    const dayOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    
    // 1. Group by time
    const timeGroups: { [key: string]: { apertura: string, cierre: string, days: number[] } } = {};
    
    for (const h of horarios) {
      if (!h.hora_apertura || !h.hora_cierre) continue;
      const key = `${h.hora_apertura}-${h.hora_cierre}`;
      const dayIndex = dayOrder.indexOf(h.dia_semana);
      if (dayIndex === -1) continue;
      
      if (!timeGroups[key]) {
        timeGroups[key] = { apertura: h.hora_apertura, cierre: h.hora_cierre, days: [] };
      }
      timeGroups[key].days.push(dayIndex);
    }
    
    const result: { dias: string, apertura: string, cierre: string }[] = [];
    
    // 2. For each time group, find consecutive ranges
    for (const key in timeGroups) {
      const group = timeGroups[key];
      // Sort days
      group.days.sort((a, b) => a - b);
      
      const ranges: string[] = [];
      let rangeStart = group.days[0];
      let rangeEnd = group.days[0];
      
      for (let i = 1; i < group.days.length; i++) {
        if (group.days[i] === rangeEnd + 1) {
          rangeEnd = group.days[i];
        } else {
          if (rangeStart === rangeEnd) {
            ranges.push(dayOrder[rangeStart]);
          } else if (rangeEnd === rangeStart + 1) {
            ranges.push(`${dayOrder[rangeStart]} y ${dayOrder[rangeEnd]}`);
          } else {
            ranges.push(`${dayOrder[rangeStart]} a ${dayOrder[rangeEnd]}`);
          }
          rangeStart = group.days[i];
          rangeEnd = group.days[i];
        }
      }
      
      if (rangeStart === rangeEnd) {
        ranges.push(dayOrder[rangeStart]);
      } else if (rangeEnd === rangeStart + 1) {
        ranges.push(`${dayOrder[rangeStart]} y ${dayOrder[rangeEnd]}`);
      } else {
        ranges.push(`${dayOrder[rangeStart]} a ${dayOrder[rangeEnd]}`);
      }
      
      // Join ranges with commas
      let diasLabel = ranges.join(', ');
      
      result.push({ dias: diasLabel, apertura: group.apertura, cierre: group.cierre });
    }
    
    // Sort result by the first day of the group (optional, but good for UX)
    result.sort((a, b) => {
       const getFirstDay = (label: string) => {
          for (let i=0; i<dayOrder.length; i++) {
            if (label.includes(dayOrder[i])) return i;
          }
          return 99;
       };
       return getFirstDay(a.dias) - getFirstDay(b.dias);
    });
    
    return result;
  }

  formatLocationName(name: string, type?: string): string {
    if (!name) return '';
    const upperName = name.toUpperCase();
    
    // Check if it's already an agency or defined as an agency
    if (type === 'Agencia' || upperName.includes('AGENCIA')) {
      return upperName.includes('AGENCIA') ? upperName : `AGENCIA ${upperName}`;
    }
    
    // Check if it's a Domicilio
    if (type === 'Cobertura Domicilio' || upperName.includes('DOMICILIO')) {
      return upperName.includes('DOMICILIO') ? upperName : `DOMICILIO ${upperName}`;
    }
    
    // Default fallback: if it's not an agency and doesn't explicitly have a prefix, treat it as a Punto Fijo
    if (!upperName.includes('PUNTO FIJO') && !upperName.includes('PUNTO')) {
      return `PUNTO FIJO ${upperName}`;
    }
    
    return upperName;
  }

  formatFriendlyDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    let date = new Date(dateStr);
    if (parts.length === 3) {
      date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaNombre = dias[date.getDay()];
    
    const today = new Date();
    const isToday = today.getDate() === date.getDate() && today.getMonth() === date.getMonth() && today.getFullYear() === date.getFullYear();
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = tomorrow.getDate() === date.getDate() && tomorrow.getMonth() === date.getMonth() && tomorrow.getFullYear() === date.getFullYear();
    
    let suffix = '';
    if (isToday) suffix = ' (Hoy)';
    else if (isTomorrow) suffix = ' (Mañana)';
    
    return `${diaNombre} ${date.getDate()}${suffix}`;
  }

  recenterMap() {
    this.recenterMapEvent.emit();
  }

  previewImage(url: string | null) {
    if (!url) return;
    this.previewImageEvent.emit(environment.apiUrl + url);
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
       this.destinoInputValue = this.selectedPin.nombre_destino || this.selectedPin.destino_nombre;
       this.destino = this.destinoInputValue;
       if (this.origen) {
          this.selectedPin = null;
          this.triggerDynamicSearch();
       } else {
          this.openLocationSelector('origen');
       }
    }
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
