import { environment } from '../environments/environment';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, AfterViewInit, HostListener, ElementRef, ViewEncapsulation, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ToastService } from './core/services/toast.service';
import { HttpClient } from '@angular/common/http';
import { UbicacionesService } from './core/services/ubicaciones.service';
import { UserGeolocationService } from './core/services/user-geolocation.service';
import { MapPort, MapCoordinate } from './core/maps/map.port';
import { MapLibreMapAdapter } from './core/maps/maplibre-map.adapter';
import { createMapMarkerElement } from './core/maps/map-marker-element';
import { MapLifecycleManager } from './core/maps/map-lifecycle.manager';
import { MapCapabilityService } from './core/maps/map-capability.service';
import { PublicMapViewState, projectPublicMapViewState } from './features/home/public-map-view-state';
import { calculateDistanceKm } from './core/maps/geo-distance';
import { HomeComponent } from './features/home/home.component';
import { AdminComponent } from './features/admin/admin.component';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { PerfilComponent } from './features/perfil/perfil.component';

interface MapMarkerMetadata {
  source: unknown;
  destinationName: string;
  companyName: string;
  selected?: boolean;
}

const AUX_MARKER_KEYS = {
  USER: 'user',
  CUSTOM_DESTINO: 'custom_destino',
  PREVIEW: 'preview'
} as const;

@Component({
  selector: 'app-mobile-layout',
  imports: [CommonModule, FormsModule, HomeComponent, AdminComponent, BottomNavComponent, PerfilComponent],
  templateUrl: './mobile-app.component.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None
})
export class MobileAppComponent implements OnInit, AfterViewInit, OnDestroy {
  interactiveMapSupported = false;
  mapInitializationFailed = false;
  mapFallbackVisible = false;

  get mapAvailable(): boolean {
    return this.interactiveMapSupported && !this.mapInitializationFailed;
  }
  @ViewChild('adminRef') adminRef!: AdminComponent;
  locations: any[] = [];
  filteredLocations: any[] = [];

  selectedPin: any = null;
  
  // Navigation State
  activeMainTab: 'inicio' | 'puntos' | 'perfil' | 'registro' = 'inicio';
  isMapForcedVisible: boolean = false;
  isMapResourceMode: boolean = false;
  
  // Admin Panel State
  adminSubTab: 'empresas' | 'puntos' = 'puntos'; // Default to puntos
  adminEmpresasList: any[] = [];
  isEditingEmpresa: boolean = false;
  editingEmpresaData: any = { id: null, nombre: '', logoUrl: '', logoFile: null };
  activeEmpresaMenuId: number | null = null;
  registroEmpresaId: number | null = null;
  registroEmpresaNombre: string = '';
  
  fullScreenImage: string | null = null;
  
  adminFilteredLocations: any[] = [];
  adminCompanies: string[] = [];
  adminCompanyFilter: string = '';
  adminSearchTerm: string = '';
  editingLocation: any = null;
  editFormData: any = {};
  
  // Edit Location Modal State
  editLocationTab: 'datos' | 'horarios' = 'datos';
  editImageFile: File | null = null;
  editImageUrl: string | null = null;
  editHorarios: any[] = [];
  isPickingLocation: boolean = false;
  
  tempPickedLat: string = '';
  tempPickedLng: string = '';
  
  // Map Interactivity State
  private map: MapPort | null = null;
  private mapLifecycle: MapLifecycleManager<MapMarkerMetadata> | null = null;
  private destroyed = false;
  userLocation: MapCoordinate | null = null;
  userMunicipalityName: string | null = null;
  userDepartamento: string | null = null;
  mapResizeObserver: ResizeObserver | null = null;
  
  // Renderer-only cache; public search state remains owned by HomeComponent.
  private latestPublicMapViewState: PublicMapViewState = { markers: [] };

  navigationIntent: Record<string, string> = {};
  private routeParamsSubscription?: Subscription;
  private geoSub?: Subscription;
  private nomSub?: Subscription;

  constructor(
    private http: HttpClient,
    private ubicacionesService: UbicacionesService,
    private userGeolocationService: UserGeolocationService,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
    private sanitizer: DomSanitizer,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private router: Router,
    private mapCapability: MapCapabilityService
  ) {
    this.interactiveMapSupported = this.mapCapability.supportsInteractiveMap();
  }

  ngOnInit() {
    this.routeParamsSubscription = this.route.queryParams.subscribe(params => {
      this.navigationIntent = { ...params };
      this.setMapResourceMode(params['vista'] === 'mapa');
      const requestedTab = params['tab'];
      this.activeMainTab = requestedTab === 'puntos' || requestedTab === 'perfil' ? requestedTab : 'inicio';
      this.cdr.detectChanges();
    });
    this.ubicacionesService.getLocations().subscribe(data => {
      this.locations = data;
      this.filteredLocations = [...this.locations];

      this.updateAgencyStatuses();
      // Update statuses every minute
      setInterval(() => this.updateAgencyStatuses(), 60000);

      if (this.userLocation) {
        this.sortLocationsByDistance();
      }

      this.updateMapMarkers();
      this.cdr.detectChanges();
    });
    
    this.loadAdminEmpresas();

    // Default to El Salvador immediately so marker renders even if GPS hangs
    this.userLocation = { lng: -89.21, lat: 13.69 };
    this.fetchMunicipalityName(13.69, -89.21);

    // Attempt to get user location
    this.geoSub?.unsubscribe();
    this.geoSub = this.userGeolocationService.getCurrentPosition().subscribe({
      next: (coords) => {
        if (this.destroyed) return;
        this.userLocation = { lng: coords.lng, lat: coords.lat };
        this.updateUserMarker();
        this.sortLocationsByDistance();
        this.fetchMunicipalityName(coords.lat, coords.lng);
      },
      error: () => {
        if (this.destroyed) return;
        // Mock user location somewhere in El Salvador if denied
        this.updateUserMarker();
        this.sortLocationsByDistance();
      }
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.routeParamsSubscription?.unsubscribe();
    this.geoSub?.unsubscribe();
    this.nomSub?.unsubscribe();
    if (this.mapResizeObserver) {
      this.mapResizeObserver.disconnect();
    }
    this.mapLifecycle?.destroy();
    this.map = null;
  }

  ngAfterViewInit() {
    this.initMap();
  }

  setMapResourceMode(enabled: boolean): boolean {
    if (enabled && !this.mapAvailable) {
      this.isMapResourceMode = false;
      this.mapFallbackVisible = true;
      this.toastService.showInfo('Mapa no compatible en este dispositivo.', 'Atención');
      return false;
    }

    this.isMapResourceMode = enabled;
    if (enabled) {
      setTimeout(() => this.map?.resize(), 40);
    }
    return true;
  }

  initMap() {
    if (!this.interactiveMapSupported) {
      this.mapInitializationFailed = true;
      this.isMapResourceMode = false;
      this.mapFallbackVisible = true;
      this.cdr.detectChanges();
      return;
    }

    setTimeout(() => {
      if (this.destroyed) return;
      if (this.map?.isInitialized()) return;
      const mapElement = (this.elRef.nativeElement as HTMLElement).querySelector<HTMLElement>('#map');
      if (!mapElement) return;

      try {
        const adapter = new MapLibreMapAdapter();
        adapter.initialize(mapElement, {
          center: { lng: -88.89, lat: 13.79 },
          zoom: 8.2,
          minZoom: 7,
          maxZoom: 19,
          attributionCompact: true,
          rotationEnabled: false,
          pitchEnabled: false,
          cooperativeGestures: false
        });
        this.map = adapter;
        this.mapLifecycle = new MapLifecycleManager<MapMarkerMetadata>(adapter);
      } catch {
        this.mapInitializationFailed = true;
        this.isMapResourceMode = false;
        this.mapFallbackVisible = true;
        this.cdr.detectChanges();
        return;
      }
  
      // UX: Handle map clicks for destination selection
      this.mapLifecycle?.trackMapEvent(this.map.onClick(() => {
        this.selectedPin = null;
        this.updateMarkerStyles();
        this.cdr.detectChanges();
      }));
      
      this.mapLifecycle?.trackMapEvent(this.map.onDragStart(() => {
        this.selectedPin = null;
        this.cdr.detectChanges();
      }));

      this.mapLifecycle?.trackMapEvent(this.map.onLoad(() => {
        mapElement.setAttribute('data-map-state', 'loaded');
        this.updateMapMarkers();
        this.updateUserMarker();
      }));
      this.mapLifecycle?.trackMapEvent(this.map.onError((message) => {
        mapElement.setAttribute('data-map-error', message);
      }));

      // Recalculate the WebGL canvas after layout transitions.
      setTimeout(() => {
        this.map?.resize();
      }, 200);

      // Add ResizeObserver to handle map container size changes permanently
      if (mapElement) {
        this.mapResizeObserver = new ResizeObserver(() => {
          this.map?.resize();
        });
        this.mapResizeObserver.observe(mapElement);
      }
      
      this.updateMapMarkers();
    }, 50);

    // In case location was fetched before map was ready
    if (this.userLocation) {
      this.updateUserMarker();
    }
  }

  fetchMunicipalityName(lat: number, lng: number) {
    this.nomSub?.unsubscribe();
    this.nomSub = this.userGeolocationService.reverseGeocode(lat, lng).subscribe({
      next: (data) => {
        if (this.destroyed) return;
        if (data && data.address) {
          const addr = data.address;
          const name = addr.suburb || addr.town || addr.village || addr.city_district || addr.municipality || addr.city || addr.county || addr.state_district;
          if (name) {
            this.userMunicipalityName = name;
            this.userDepartamento = addr.state || null;
            this.cdr.detectChanges();
          }
        }
      },
      error: () => {}
    });
  }


  updateUserMarker() {
    if (!this.map || !this.mapLifecycle || !this.userLocation) return;
    
    if (this.mapLifecycle.getAuxiliaryMarker(AUX_MARKER_KEYS.USER)) {
      this.mapLifecycle.updateAuxiliaryMarker(AUX_MARKER_KEYS.USER, this.userLocation);
    } else {
      const userElement = this.createMarkerElement(AUX_MARKER_KEYS.USER, 'Tu ubicación');
      this.mapLifecycle.setAuxiliaryMarker(AUX_MARKER_KEYS.USER, {
        coordinate: this.userLocation,
        options: { element: userElement, anchor: 'center' }
      });
      this.map.jumpTo(this.userLocation, { zoom: 13 });
    }
  }

  showNearbyPoints() {
    if (!this.mapAvailable || !this.map || !this.mapLifecycle) return;
    const mapLifecycle = this.mapLifecycle;
    if (!this.userLocation) {
      this.toastService.showError("Por favor, permite el acceso a tu ubicación para ver los puntos cercanos.", "Ubicación Requerida");
      return;
    }

    // Sort locations by distance
    this.sortLocationsByDistance();

    // Take top 5 closest or within 3km
    const nearby = this.locations.filter(l => (l.distance || 9999) <= 3).slice(0, 5);
    
    if (nearby.length === 0) {
      this.toastService.showInfo("No hay puntos cercanos a menos de 3 km de tu ubicación.", "Sin Resultados");
      return;
    }

    // Clear existing markers
    mapLifecycle.clearPrimaryMarkers();

    const coordinates: MapCoordinate[] = [{ ...this.userLocation }];

    nearby.forEach(loc => {
      if (loc.ubicacion && loc.ubicacion.lat && loc.ubicacion.lng) {
        const coordinate = this.toMapCoordinate(loc.ubicacion.lat, loc.ubicacion.lng);
        const element = this.createMarkerElement('nearby', loc.nombre_destino);
        const marker = mapLifecycle.addPrimaryMarker({
          coordinate,
          options: { element, anchor: 'center' },
          metadata: this.toMarkerMetadata(loc, loc.nombre_destino, loc.empresa),
          onClick: event => {
            event.stopPropagation();
            this.focusLocation(loc);
            this.selectedPin = loc;
            this.cdr.detectChanges();
          }
        });
        marker.setPopupContent({
          title: String(loc.empresa ?? ''),
          subtitle: String(loc._status?.mainText || loc.nombre_destino || '')
        });
        coordinates.push(coordinate);
      }
    });

    // Zoom map to fit the nearby points
    this.map.fitCoordinates(coordinates, { padding: 50, maxZoom: 15, duration: 850 });
  }

  updateMapMarkers(state?: PublicMapViewState) {
    if (state) {
      this.latestPublicMapViewState = state;
    }

    if (!this.map || !this.mapLifecycle) return;
    const mapLifecycle = this.mapLifecycle;
    
    this.removeRouteLine();

    const isInicio = this.activeMainTab === 'inicio';
    
    let viewState: PublicMapViewState;
    if (isInicio) {
      viewState = this.latestPublicMapViewState;
    } else {
      viewState = this.projectSinglePin(this.selectedPin);
    }

    mapLifecycle.clearPrimaryMarkers();

    if (viewState.markers.length === 0) {
      return;
    }

    const coordinates: MapCoordinate[] = [];

    viewState.markers.forEach(marker => {
      const element = this.createMarkerElement(
        marker.role,
        marker.label,
        marker.selected
      );

      const metadata: MapMarkerMetadata = {
        source: marker.source,
        destinationName: marker.label,
        companyName: marker.company,
        selected: marker.selected
      };

      mapLifecycle.addPrimaryMarker({
        coordinate: marker.coordinate,
        options: { element, anchor: 'bottom' },
        metadata,
        onClick: event => {
          event.stopPropagation();
          const loc = marker.source;
          if (typeof loc === 'object' && loc !== null) {
            const locRecord = loc as Record<string, unknown>;
            this.focusLocation(locRecord);

            const originalLoc = this.locations.find((l) =>
              (l.nombre_destino === locRecord['destino_nombre'] || l.nombre_destino === locRecord['nombre_destino']) &&
              (l.empresa === locRecord['empresa'])
            ) || locRecord;

            const markerType = marker.role;
            this.selectedPin = { ...originalLoc, markerType };
            this.updateMarkerStyles();
            this.cdr.detectChanges();
          }
        }
      });
      coordinates.push(marker.coordinate);
    });

    if (coordinates.length > 0) {
      this.map.fitCoordinates(coordinates, { padding: 50, maxZoom: 15, duration: 850 });
    }
    
    this.updateMarkerStyles();
  }

  private projectSinglePin(pin: unknown): PublicMapViewState {
    return projectPublicMapViewState({
      locations: [],
      selectedPin: pin,
      flightResults: [],
      displayedResults: [],
      origen: '',
      destino: '',
      origenMunicipio: '',
      destinoMunicipio: '',
      expandedResultCard: null,
      isOriginDiscoveryMode: false
    });
  }

  highlightedRoute: any = null;

  resetMapMarkers() {
    this.highlightedRoute = null;
    this.selectedPin = null;
    this.updateMarkerStyles();
    
    // Re-fit all bounds
    const entries = this.mapLifecycle?.getPrimaryEntries() ?? [];
    if (this.map && entries.length > 0) {
      this.map.fitCoordinates(entries.map(entry => entry.marker.getCoordinate()), { padding: 50, maxZoom: 15, duration: 700 });
    }
    this.cdr.detectChanges();
  }

  updateMarkerStyles() {
    const entries = this.mapLifecycle?.getPrimaryEntries() ?? [];
    entries.forEach(({ marker, metadata }) => {
      const el = marker.getElement();
      if (!el) return;

      let isDimmed = false;
      let isHighlighted = false;

      if (this.highlightedRoute) {
         // Is this marker part of the highlighted route?
         const r = this.highlightedRoute;
         const isOrigin = (metadata.destinationName === r.origen_nombre && metadata.companyName === r.empresa);
         const isDest = (metadata.destinationName === r.destino_nombre && metadata.companyName === r.empresa);
         if (isOrigin || isDest) {
            isHighlighted = true;
         } else {
            isDimmed = true;
         }
      }

      const isSelected = this.selectedPin
        ? this.selectedPin.nombre_destino === metadata.destinationName
        : Boolean(metadata.selected);

      if (isSelected) {
         el.classList.add('marker-selected');
      } else {
         el.classList.remove('marker-selected');
      }

      const hasSelectedMarker = Boolean(this.selectedPin) || entries.some(entry => entry.metadata.selected);
      if (!isSelected && hasSelectedMarker) {
         el.classList.add('marker-hidden');
      } else {
         el.classList.remove('marker-hidden');
      }

      if (isDimmed) {
         el.classList.add('marker-dimmed');
      } else {
         el.classList.remove('marker-dimmed');
      }

      if (isHighlighted) {
         el.classList.add('marker-highlighted');
      } else {
         el.classList.remove('marker-highlighted');
      }
    });
  }

  sortLocationsByDistance() {
    if (!this.userLocation || !this.locations || this.locations.length === 0) return;
    
    // Sort and calculate on the main locations array
    this.locations.forEach(loc => {
      if (loc.ubicacion && loc.ubicacion.lat && loc.ubicacion.lng) {
        loc.distance = calculateDistanceKm(
          { lat: this.userLocation!.lat, lng: this.userLocation!.lng },
          { lat: loc.ubicacion.lat, lng: loc.ubicacion.lng }
        );
      } else {
        loc.distance = 9999;
      }
    });

    this.filteredLocations.forEach(loc => {
      if (loc.ubicacion && loc.ubicacion.lat && loc.ubicacion.lng) {
        loc.distance = calculateDistanceKm(
          { lat: this.userLocation!.lat, lng: this.userLocation!.lng },
          { lat: loc.ubicacion.lat, lng: loc.ubicacion.lng }
        );
      } else {
        loc.distance = 9999;
      }
    });

    this.filteredLocations.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    this.locations.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    
    this.updateMapMarkers();
    this.cdr.detectChanges();
  }




  focusLocation(loc: any) {
    if (this.map && loc.ubicacion && loc.ubicacion.lat && loc.ubicacion.lng) {
      const lat = parseFloat(loc.ubicacion.lat);
      const lng = parseFloat(loc.ubicacion.lng);
      
      // Aplicar un offset para que el pin quede en la mitad superior de la pantalla
      // ya que la tarjeta de detalles cubre la mitad inferior en móviles.
      const latOffset = window.innerWidth < 768 ? 0.005 : 0.002;
      this.map.flyTo({ lng, lat: lat - latOffset }, { zoom: 15, duration: 800 });
    }
  }

  showOriginPinDetails(flight: any) {
    const originLoc = this.locations.find(l => l.nombre_destino === flight.origen_nombre && l.empresa === flight.empresa);
    if (originLoc) {
      this.selectedPin = { ...originLoc, markerType: 'origin' };
      this.focusLocation(originLoc);
      this.cdr.detectChanges();
    }
  }

  showDestinoPinDetails(flight: any) {
    const destinationName = flight.destino_nombre_destino || flight.destino_nombre;
    const destLoc = this.locations.find(l => l.nombre_destino === destinationName && l.empresa === flight.empresa);
    if (destLoc) {
      this.selectedPin = { ...destLoc, markerType: 'destination' };
      this.focusLocation(destLoc);
      this.cdr.detectChanges();
    }
  }



  updateAgencyStatuses() {
    this.locations.forEach(loc => {
      loc._status = this.calculateAgencyStatus(loc);
    });
  }

  calculateAgencyStatus(loc: any): { color: string, iconType: string, mainText: string, timeText: string } {
    if (!loc.horarios_operativos || loc.horarios_operativos.length === 0) {
      return { color: 'gray', iconType: 'close', mainText: 'Horario no disp.', timeText: '' };
    }
    
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const now = new Date();
    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    const getNextOpen = (startOffset: number) => {
      for (let i = startOffset; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dayName = days[d.getDay()];
        const schedule = loc.horarios_operativos.find((h: any) => normalize(h.dia_semana) === normalize(dayName));
        if (schedule && schedule.hora_apertura && schedule.hora_cierre) {
           return { dayOffset: i, schedule, dayName };
        }
      }
      return null;
    };

    const currentDay = days[now.getDay()]; 
    const todaySchedule = loc.horarios_operativos.find((h: any) => 
      normalize(h.dia_semana) === normalize(currentDay)
    );

    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentTotalMins = currentHour * 60 + currentMin;

    if (todaySchedule && todaySchedule.hora_apertura && todaySchedule.hora_cierre) {
      const [openH, openM] = todaySchedule.hora_apertura.split(':').map(Number);
      const [closeH, closeM] = todaySchedule.hora_cierre.split(':').map(Number);
      const openTotalMins = openH * 60 + openM;
      const closeTotalMins = closeH * 60 + closeM;

      if (currentTotalMins >= openTotalMins && currentTotalMins <= closeTotalMins) {
        if (closeTotalMins - currentTotalMins <= 60) {
          return { color: 'orange', iconType: 'clock', mainText: 'Cerrará pronto', timeText: `Cierra a las ${this.formatTime(todaySchedule.hora_cierre)}` };
        }
        return { 
          color: 'green', 
          iconType: 'clock', 
          mainText: 'Disponible ahora', 
          timeText: `Hasta las ${this.formatTime(todaySchedule.hora_cierre)}` 
        };
      } else if (currentTotalMins < openTotalMins) {
        return { 
          color: 'orange', 
          iconType: 'clock', 
          mainText: 'Disponible hoy', 
          timeText: `${this.formatTime(todaySchedule.hora_apertura)} - ${this.formatTime(todaySchedule.hora_cierre)}` 
        };
      }
    }

    // If we reach here, it's either closed entirely today, or already closed for the day
    const nextOpen = getNextOpen(1);
    if (nextOpen) {
      if (nextOpen.dayOffset === 1) {
        return { 
          color: 'orange', 
          iconType: 'calendar', 
          mainText: 'Disponible mañana', 
          timeText: `${this.formatTime(nextOpen.schedule.hora_apertura)} - ${this.formatTime(nextOpen.schedule.hora_cierre)}` 
        };
      } else {
        return { 
          color: 'orange', 
          iconType: 'calendar', 
          mainText: `Disponible el ${nextOpen.dayName.toLowerCase()}`, 
          timeText: `${this.formatTime(nextOpen.schedule.hora_apertura)} - ${this.formatTime(nextOpen.schedule.hora_cierre)}` 
        };
      }
    }

    return { color: 'red', iconType: 'close', mainText: 'No disponible', timeText: '' };
  }




  recenterMap() {
    if (!this.mapAvailable || !this.map) return;
    this.toastService.showInfo("Buscando tu ubicación...", "Ubicación");
    this.geoSub?.unsubscribe();
    this.geoSub = this.userGeolocationService.getCurrentPosition({ timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }).subscribe({
      next: (coords) => {
        if (this.destroyed) return;
        this.userLocation = { lng: coords.lng, lat: coords.lat };
        this.updateUserMarker();
        if (this.userLocation) this.map?.flyTo(this.userLocation, { zoom: 15, duration: 900 });
        this.fetchMunicipalityName(coords.lat, coords.lng);
        this.sortLocationsByDistance();
      },
      error: () => {
        if (this.destroyed) return;
        this.toastService.showError("Verifica los permisos de ubicación de tu navegador.", "Sin acceso");
        if (this.userLocation) {
          this.map?.flyTo(this.userLocation, { zoom: 15, duration: 900 });
        }
      }
    });
  }





  formatTime(timeStr: string): string {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; 
    return `${h < 10 ? '0'+h : h}:${m} ${ampm}`;
  }



  // --- Proximity Based Logic ---



  // --- ADMIN PANEL LOGIC ---
  switchToInicio() {
    this.activeMainTab = 'inicio';
    setTimeout(() => {
      if (this.map) {
        this.map.resize();
      }
    }, 50); // slight delay to allow display:block to take effect
  }

  openAdminPanel() {
    this.activeMainTab = 'puntos';
    this.adminCompanies = Array.from(new Set(this.locations.map(l => l.empresa))).filter(e => e) as string[];
    this.adminSearchTerm = '';
    // Limpiar variables de registro
    this.isPickingLocation = false;
    this.loadAdminEmpresas();
    this.applyAdminFilter();
  }

  async loadAdminEmpresas() {
    try {
      const res = await this.http.get<any>(environment.apiUrl + '/api/empresas').toPromise();
      if (res.success) {
        this.adminEmpresasList = res.empresas;
        this.adminCompanies = res.empresas.map((e: any) => e.nombre);
      }
    } catch (e) {
      console.error('Error loading empresas', e);
    }
  }

  // Empresas CRUD
  toggleEmpresaMenu(empId: number, event: Event) {
    event.stopPropagation();
    if (this.activeEmpresaMenuId === empId) {
      this.activeEmpresaMenuId = null;
    } else {
      this.activeEmpresaMenuId = empId;
    }
  }

  @HostListener('document:click')
  closeMenus() {
    this.activeEmpresaMenuId = null;
  }

  openNewEmpresaModal() {
    this.isEditingEmpresa = true;
    this.activeEmpresaMenuId = null;
    this.editingEmpresaData = { id: null, nombre: '', logoUrl: '', logoFile: null };
  }

  openEditEmpresaModal(empresa: any) {
    this.isEditingEmpresa = true;
    this.activeEmpresaMenuId = null;
    this.editingEmpresaData = { id: empresa.id, nombre: empresa.nombre, logoUrl: empresa.logo_url, logoFile: null };
  }

  viewEmpresaPuntos(empresa: any) {
    this.adminSubTab = 'puntos';
    this.adminCompanyFilter = empresa.nombre;
    this.applyAdminFilter();
    this.activeEmpresaMenuId = null;
  }

  addPuntoToEmpresa(empresa: any) {
    this.activeEmpresaMenuId = null;
    this.registroEmpresaId = empresa.id;
    this.registroEmpresaNombre = empresa.nombre;
    this.activeMainTab = 'registro';
  }

  openRegistroLibre() {
    this.registroEmpresaId = null;
    this.registroEmpresaNombre = '';
    this.activeMainTab = 'registro';
  }



  onEmpresaLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.editingEmpresaData.logoFile = file;
    }
  }

  async saveEmpresa() {
    if (!this.editingEmpresaData.nombre) return;
    
    const formData = new FormData();
    formData.append('nombre', this.editingEmpresaData.nombre);
    if (this.editingEmpresaData.logoFile) {
      formData.append('logo', this.editingEmpresaData.logoFile);
    }
    
    try {
      let res;
      if (this.editingEmpresaData.id) {
        res = await this.http.put<any>(`${environment.apiUrl}/api/empresas/${this.editingEmpresaData.id}`, formData).toPromise();
      } else {
        res = await this.http.post<any>(environment.apiUrl + '/api/empresas', formData).toPromise();
      }
      
      if (res.success) {
        this.isEditingEmpresa = false;
        await this.loadAdminEmpresas();
      }
    } catch (e) {
      console.error('Error guardando empresa', e);
    }
  }

  applyAdminFilter() {
    let filtered = this.locations;
    
    if (this.adminCompanyFilter) {
      filtered = filtered.filter(l => l.empresa === this.adminCompanyFilter);
    }
    
    if (this.adminSearchTerm && this.adminSearchTerm.trim() !== '') {
      const term = this.adminSearchTerm.toLowerCase().trim();
      const normalize = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
      const normTerm = normalize(term);
      
      filtered = filtered.filter(l => 
        normalize(l.nombre_destino).includes(normTerm) || 
        normalize(l.ubicacion?.municipio).includes(normTerm) ||
        normalize(l.ubicacion?.departamento).includes(normTerm)
      );
    }
    
    this.adminFilteredLocations = filtered;
  }

  editLocation(loc: any) {
    this.editingLocation = loc;
    this.editFormData = JSON.parse(JSON.stringify(loc)); // Deep copy
    this.editLocationTab = 'datos';
    this.editImageFile = null;
    this.editImageUrl = loc.imagen_referencia ? `${environment.apiUrl}${loc.imagen_referencia}` : null;
    
    // Initialize horarios grid based on backend data
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    this.editHorarios = dias.map(dia => {
      const existing = (loc.horarios_operativos || []).find((h: any) => h.dia_semana === dia);
      return {
        selected: !!existing,
        dia: dia,
        horaApertura: existing ? existing.hora_apertura : '08:00',
        horaCierre: existing ? existing.hora_cierre : '17:00'
      };
    });
  }

  onEditImageSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.editImageFile = file;
      const reader = new FileReader();
      reader.onload = e => this.editImageUrl = e.target?.result as string;
      reader.readAsDataURL(file);
    }
  }

  viewOnMap(loc: any, pointRole?: string) {
    if (!this.setMapResourceMode(true)) return;
    this.activeMainTab = 'inicio';
    
    // Select the pin to open its detail modal
    const markerType = pointRole === 'origen'
      ? 'origin'
      : pointRole === 'destino'
        ? 'destination'
        : loc.markerType;
    this.selectedPin = markerType ? { ...loc, markerType } : loc;
    this.updateMapMarkers(this.projectSinglePin(this.selectedPin)); // Asegurarnos de pintar el marcador antes de hacer focus
    
    setTimeout(() => {
      this.focusLocation(loc);
    }, 300); // Wait for the tab to render and the map to be fully visible
  }


  private removeRouteLine() {
    this.map?.removeRouteLine();
  }

  private drawRouteLine(coordinates: MapCoordinate[]) {
    if (!this.map || coordinates.length < 2) return;
    this.map.drawRouteLine(coordinates, {
      color: '#F45B78',
      width: 4,
      opacity: 0.9,
      dashArray: [1.2, 1.4]
    });
  }

  private createMarkerElement(
    type: 'origin' | 'destination' | 'nearby' | 'user' | 'preview',
    label = '',
    selected = false
  ): HTMLButtonElement {
    const ownerDocument = (this.elRef.nativeElement as HTMLElement).ownerDocument;
    return createMapMarkerElement(ownerDocument, type, label, selected);
  }

  private toMapCoordinate(lat: number | string, lng: number | string): MapCoordinate {
    return { lat: Number(lat), lng: Number(lng) };
  }

  private toMarkerMetadata(
    source: unknown,
    destinationName: unknown,
    companyName: unknown
  ): MapMarkerMetadata {
    return {
      source,
      destinationName: typeof destinationName === 'string' ? destinationName : '',
      companyName: typeof companyName === 'string' ? companyName : ''
    };
  }

  onMapHighlightRoute(flight: any) {
    if (this.map && this.mapLifecycle && flight) {
      // Limpiar mapa primero para no dejar punteros fantasma
      this.removeRouteLine();
      this.mapLifecycle.clearPrimaryMarkers();

      this.resetMapMarkers();
      this.highlightedRoute = flight;
      
      const routeCoordinates: MapCoordinate[] = [];
      
      // Añadir origen
      if (flight.origen_lat && flight.origen_lng) {
        const oLat = parseFloat(flight.origen_lat);
        const oLng = parseFloat(flight.origen_lng);
        const coordinate = { lng: oLng, lat: oLat };
        const element = this.createMarkerElement('origin', flight.origen_nombre || 'Origen');
        this.mapLifecycle.addPrimaryMarker({
          coordinate,
          options: { element, anchor: 'bottom' },
          metadata: this.toMarkerMetadata(flight, flight.origen_nombre, flight.empresa),
          onClick: event => {
            event.stopPropagation();
            this.showOriginPinDetails(flight);
          }
        });
        routeCoordinates.push(coordinate);
      }
      
      // Añadir destino
      if (flight.destino_lat && flight.destino_lng) {
        const dLat = parseFloat(flight.destino_lat);
        const dLng = parseFloat(flight.destino_lng);
        const coordinate = { lng: dLng, lat: dLat };
        const element = this.createMarkerElement('destination', flight.destino_nombre || 'Destino');
        this.mapLifecycle.addPrimaryMarker({
          coordinate,
          options: { element, anchor: 'bottom' },
          metadata: this.toMarkerMetadata(flight, flight.destino_nombre, flight.empresa),
          onClick: event => {
            event.stopPropagation();
            this.showDestinoPinDetails(flight);
          }
        });
        routeCoordinates.push(coordinate);
      }
      
      this.drawRouteLine(routeCoordinates);
      
      if (routeCoordinates.length > 0) {
        setTimeout(() => {
          this.map?.fitCoordinates(routeCoordinates, { padding: 50, maxZoom: 15, duration: 850 });
        }, 100);
      }
    }
  }

  previewMap(coords: {lat: number, lng: number}) {
    if (this.map && coords && coords.lat && coords.lng) {
      setTimeout(() => {
        if (!this.map) return;
        this.map.flyTo(coords, { zoom: 18, duration: 750 });
        
        const element = this.createMarkerElement(AUX_MARKER_KEYS.PREVIEW, 'Ubicación de vista previa');
        this.mapLifecycle?.setAuxiliaryMarker(AUX_MARKER_KEYS.PREVIEW, {
          coordinate: coords,
          options: { element, draggable: true, anchor: 'bottom' },
          onDragEnd: (pos) => {
            if (this.adminRef) {
               this.adminRef.updatePickedLocation(pos.lat.toFixed(6), pos.lng.toFixed(6));
            }
          }
        });
        
      }, 300);
    }
  }

  startPickingLocation() {
    this.isPickingLocation = true;
    setTimeout(() => {
      if (this.map) {
        this.map.resize();
        if (this.map && this.editFormData.lat && this.editFormData.lng) {
          this.map.jumpTo(this.toMapCoordinate(this.editFormData.lat, this.editFormData.lng), { zoom: 16 });
        }
        
        const center = this.map.getCenter();
        this.tempPickedLat = center.lat.toFixed(5);
        this.tempPickedLng = center.lng.toFixed(5);
        this.cdr.detectChanges();

        this.mapLifecycle?.replaceScopedDisposer('picker', this.map.onMove((c) => {
          this.tempPickedLat = c.lat.toFixed(5);
          this.tempPickedLng = c.lng.toFixed(5);
          this.cdr.detectChanges();
        }));
      }
    }, 50);
  }

  confirmPickedLocation() {
    if (this.map) {
      this.mapLifecycle?.clearScopedDisposer('picker');
      const center = this.map.getCenter();
      this.editFormData.lat = center.lat.toFixed(7);
      this.editFormData.lng = center.lng.toFixed(7);
    }
    this.isPickingLocation = false;
  }
  
  cancelPickingLocation() {
    this.mapLifecycle?.clearScopedDisposer('picker');
    this.isPickingLocation = false;
  }

  googleLinkLoading = false;
  googleLinkError = '';

  async onGoogleLinkPaste(event: ClipboardEvent) {
    const paste = event.clipboardData?.getData('text')?.trim();
    if (!paste) return;
    
    this.googleLinkError = '';
    
    // Always save the URL itself regardless of coord extraction
    if (paste.startsWith('http')) {
      this.editFormData.maps_url = paste;
    }
    
    // Quick local extraction (works for full Google Maps URLs with @lat,lng)
    const directMatch =
      paste.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      paste.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
      paste.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      paste.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    
    if (directMatch) {
      if (!this.editFormData.ubicacion) this.editFormData.ubicacion = {};
      this.editFormData.ubicacion.lat = parseFloat(directMatch[1]).toFixed(7);
      this.editFormData.ubicacion.lng = parseFloat(directMatch[2]).toFixed(7);
      this.cdr.detectChanges();
      return;
    }
    
    // For short URLs (maps.app.goo.gl), try backend but don't fail if can't extract
    if (paste.startsWith('http') && !paste.includes('google.com/maps')) {
      this.googleLinkLoading = true;
      this.cdr.detectChanges();
      try {
        const res: any = await this.http.post('/api/resolve-maps-link', { url: paste }).toPromise();
        if (res?.success) {
          if (!this.editFormData.ubicacion) this.editFormData.ubicacion = {};
          this.editFormData.ubicacion.lat = parseFloat(res.lat).toFixed(7);
          this.editFormData.ubicacion.lng = parseFloat(res.lng).toFixed(7);
        } else {
          // URL saved but coords couldn't be auto-extracted — guide user
          this.googleLinkError = '✅ URL guardada. Para extraer coordenadas automáticamente, abre Google Maps en escritorio, haz clic derecho en el punto y copia el link completo (contiene @lat,lng).';
        }
      } catch (e) {
        this.googleLinkError = '✅ URL guardada. No se pudo conectar al servidor para resolver las coordenadas.';
      } finally {
        this.googleLinkLoading = false;
        this.cdr.detectChanges();
      }
    } else if (paste.startsWith('http')) {
      // Full google.com/maps URL but no coords found in it
      this.googleLinkError = 'URL guardada, pero no se encontraron coordenadas. Verifica que el link tenga @lat,lng en la barra de direcciones.';
      this.cdr.detectChanges();
    }
  }

  cancelEdit() {
    this.editingLocation = null;
  }

  saveLocation() {
    if (!this.editingLocation) return;
    
    const formData = new FormData();
    formData.append('nombre_destino', this.editFormData.nombre_destino);
    formData.append('empresa', this.editFormData.empresa);
    if (this.editFormData.maps_url) {
      formData.append('maps_url', this.editFormData.maps_url);
    } else {
      formData.append('maps_url', ''); // clear it
    }

    const ubicacion = {
      lat: parseFloat(this.editFormData.ubicacion?.lat),
      lng: parseFloat(this.editFormData.ubicacion?.lng),
      municipio: this.editFormData.ubicacion?.municipio,
      departamento: this.editFormData.ubicacion?.departamento
    };
    formData.append('ubicacion', JSON.stringify(ubicacion));
    
    // Convert editHorarios back to array of { dia_semana, hora_apertura, hora_cierre }
    const activeHorarios = this.editHorarios
      .filter(h => h.selected)
      .map(h => ({
        dia_semana: h.dia,
        hora_apertura: h.horaApertura,
        hora_cierre: h.horaCierre
      }));
    formData.append('horarios', JSON.stringify(activeHorarios));

    if (this.editImageFile) {
      formData.append('imagen_referencia', this.editImageFile);
    }

    this.http.put(`${environment.apiUrl}/api/locations/${this.editingLocation.id}`, formData).subscribe({
      next: (res: any) => {
        // Fetch fresh list from server to get image and horarios updated properly, 
        // or just update what we know. For simplicity, we can do a full reload of locations
        // or update memory:
        this.editingLocation.nombre_destino = this.editFormData.nombre_destino;
        this.editingLocation.empresa = this.editFormData.empresa;
        if (!this.editingLocation.ubicacion) this.editingLocation.ubicacion = {};
        this.editingLocation.ubicacion.lat = ubicacion.lat;
        this.editingLocation.ubicacion.lng = ubicacion.lng;
        this.editingLocation.ubicacion.municipio = ubicacion.municipio;
        this.editingLocation.ubicacion.departamento = ubicacion.departamento;
        if (res.updated && res.updated.imagen_referencia) {
          this.editingLocation.imagen_referencia = res.updated.imagen_referencia;
        }
        this.editingLocation.horarios_operativos = activeHorarios;
        
        this.editingLocation = null;
        this.applyAdminFilter();
        this.updateMapMarkers(); // Reflect changes on map
        this.cdr.detectChanges();
        this.toastService.showSuccess("El punto ha sido actualizado exitosamente", "Guardado");
      },
      error: (err) => {
        console.error("Save error", err);
        this.toastService.showError("Error al guardar el punto. Revisa la consola.", "Error");
      }
    });
  }
}
