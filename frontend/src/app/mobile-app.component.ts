import { Component, OnInit, ChangeDetectorRef, AfterViewInit, HostListener, ElementRef, ViewEncapsulation, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ToastService } from './core/services/toast.service';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';
import { RegistroPuntoComponent } from './components/registro-punto/registro-punto.component';
import { HomeComponent } from './features/home/home.component';
import { AdminComponent } from './features/admin/admin.component';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { MapComponent } from './shared/components/map/map.component';
import { PerfilComponent } from './features/perfil/perfil.component';

// Fix Leaflet marker icons not loading in Angular
const iconRetinaUrl = 'assets/marker-icon-2x.png';
const iconUrl = 'assets/marker-icon.png';
const shadowUrl = 'assets/marker-shadow.png';
const iconDefault = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = iconDefault;

L.Icon.Default.imagePath = 'assets/';

const defaultIcon = L.Icon.Default.prototype as any;
if (defaultIcon._getIconUrl) {
  delete defaultIcon._getIconUrl;
}

L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

@Component({
  selector: 'app-mobile-layout',
  imports: [CommonModule, FormsModule, RegistroPuntoComponent, HomeComponent, AdminComponent, BottomNavComponent, MapComponent, PerfilComponent],
  templateUrl: './mobile-app.component.html',
  styleUrl: './app.css',
  encapsulation: ViewEncapsulation.None
})
export class MobileAppComponent implements OnInit, AfterViewInit {
  @ViewChild('adminRef') adminRef!: AdminComponent;
  locations: any[] = [];
  filteredLocations: any[] = [];
  origen: string = '';
  destino: string = '';
  dropoffDate: string = '';
  dropoffTime: string = '';
  
  result: any = null;
  displayedResults: any[] = [];
  loading: boolean = false;
  errorMsg: string = '';

  bottomSheetState: 'collapsed' | 'half' | 'expanded' = 'collapsed';
  isSheetScrolled: boolean = false;
  activeEmpresa: string = '';
  isProgrammaticMove: boolean = false;
  isDiscoveryMode: boolean = false;
  companyFilter: string | null = null;
  selectedPin: any = null;
  
  // Navigation State
  activeMainTab: 'inicio' | 'puntos' | 'perfil' | 'registro' = 'inicio';
  isMapForcedVisible: boolean = false;
  
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
  isOriginDiscoveryMode: boolean = false;
  isPickingLocation: boolean = false;
  selectedPinDayFilter: string = '';
  
  uniqueMunicipalities: any[] = [];
  tempPickedLat: string = '';
  tempPickedLng: string = '';
  mapMoveListener: any;
  
  // Location Selector Modal State
  selectingLocation: 'origen' | 'destino' | null = null;
  activeFilterTab: 'lugar' | 'fecha' | 'destino' = 'lugar'; // Wizard phases
  locationSearchQuery: string = '';
  showAdvanced: boolean = false;
  filteredModalLocations: any[] = [];
  
  timeSlots: string[] = [];
  validationError: string = '';
  
  filteredMunicipalities: any[] = [];
  filteredOriginMunicipalities: any[] = [];
  origenMunicipio: string | null = null;
  origenDepartamento: string | null = null;
  flightResults: any[] = [];
  
  // Radius for Pin origin
  searchRadius: number = 1.0;
  
  // Map Interactivity State
  mapCenterLat: number = 0;
  mapCenterLng: number = 0;
  
  map!: L.Map;
  markers: L.Marker[] = [];
  userLocation: L.LatLng | null = null;
  userMunicipalityName: string | null = null;
  userDepartamento: string | null = null;
  userMarker: L.Marker | null = null;
  mapResizeObserver!: ResizeObserver;
  
  first: number = 0; // Required by design rules for pagination reset

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef, private elRef: ElementRef, private sanitizer: DomSanitizer, private toastService: ToastService) {}

  // onDocumentClick removido para evitar conflictos con los botones que abren el panel.

  onPanelClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.search-box') && !target.closest('.autocomplete-list')) {
      this.showAutocomplete = false;
    }
  }

  ngOnInit() {
    const today = new Date();
    this.dropoffDate = today.toISOString().split('T')[0];
    this.generateTimeSlots();
    if (this.timeSlots.length > 0) {
      this.dropoffTime = this.timeSlots[0];
    } else {
      this.dropoffTime = '';
    }

    this.http.get<any[]>('http://localhost:3000/api/locations').subscribe(data => {
      this.locations = data;
      this.filteredLocations = [...this.locations];
      
      // Extract unique municipalities for the Destination phase
      const muns = new Map();
      this.locations.forEach(loc => {
        if (loc.ubicacion && loc.ubicacion.municipio && loc.ubicacion.departamento) {
          const key = `${loc.ubicacion.municipio}, ${loc.ubicacion.departamento}`;
          if (!muns.has(key)) {
            muns.set(key, { 
              municipio: loc.ubicacion.municipio, 
              departamento: loc.ubicacion.departamento,
              nombre_display: key
            });
          }
        }
      });
      this.uniqueMunicipalities = Array.from(muns.values()).sort((a,b) => a.municipio.localeCompare(b.municipio));
      this.filteredMunicipalities = [...this.uniqueMunicipalities];

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
    this.userLocation = L.latLng(13.69, -89.21);
    this.fetchMunicipalityName(13.69, -89.21);

    // Attempt to get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        this.userLocation = L.latLng(pos.coords.latitude, pos.coords.longitude);
        this.updateUserMarker();
        this.sortLocationsByDistance();
        this.fetchMunicipalityName(pos.coords.latitude, pos.coords.longitude);
      }, () => {
        // Mock user location somewhere in El Salvador if denied
        this.updateUserMarker();
        this.sortLocationsByDistance();
      }, { timeout: 5000, maximumAge: 60000 });
    } else {
      this.updateUserMarker();
      this.sortLocationsByDistance();
    }
  }

  ngOnDestroy() {
    if (this.mapResizeObserver) {
      this.mapResizeObserver.disconnect();
    }
  }

  ngAfterViewInit() {
    this.initMap();
  }

  initMap() {
    setTimeout(() => {
      const mapElement = document.getElementById('map');
      if (!mapElement) return;

      this.map = L.map('map', { zoomControl: false }).setView([13.79, -88.89], 8); // Centered on El Salvador
  
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors, © CARTO'
      }).addTo(this.map);
  
      // UX: Handle map clicks for destination selection or collapse bottom sheet
      this.map.on('click', (e: any) => {
        if (this.selectingLocation === 'destino' || this.activeInput === 'destino') {
          const { lat, lng } = e.latlng;
          this.setCustomDestination(lat, lng);
          return;
        }
        this.selectedPin = null;
        if (this.bottomSheetState === 'expanded' || this.bottomSheetState === 'half') {
          this.bottomSheetState = 'collapsed';
        }
        this.expandedResultCard = null;
        this.cdr.detectChanges();
      });
      
      this.map.on('dragstart', () => {
        this.selectedPin = null;
        if (this.bottomSheetState === 'expanded' || this.bottomSheetState === 'half') {
          this.bottomSheetState = 'collapsed';
        }
        this.expandedResultCard = null;
        this.cdr.detectChanges();
      });
      
      this.map.on('movestart', () => {
        if (!this.isProgrammaticMove && (this.bottomSheetState === 'expanded' || this.bottomSheetState === 'half')) {
          this.bottomSheetState = 'collapsed';
          this.cdr.detectChanges();
        }
      });
      this.map.on('moveend', () => {
        this.isProgrammaticMove = false;
      });

      // Track map center
      this.map.on('move', () => {
        const center = this.map.getCenter();
        this.mapCenterLat = center.lat;
        this.mapCenterLng = center.lng;
      });

      // Update map center on load if not set
      const initCenter = this.map.getCenter();
      this.mapCenterLat = initCenter.lat;
      this.mapCenterLng = initCenter.lng;

      // Force map to recalculate its size after a short delay (fixes gray boxes issue)
      setTimeout(() => {
        this.map.invalidateSize();
      }, 200);

      // Add ResizeObserver to handle map container size changes permanently
      if (mapElement) {
        this.mapResizeObserver = new ResizeObserver(() => {
          this.map.invalidateSize();
        });
        this.mapResizeObserver.observe(mapElement);
      }
      
      // Initialize map markers after the map is fully ready
      this.updateMapMarkers();
    }, 50);

    // In case location was fetched before map was ready
    if (this.userLocation) {
      this.updateUserMarker();
    }
  }

  fetchMunicipalityName(lat: number, lng: number, isDestino: boolean = false) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    this.http.get<any>(url).subscribe({
      next: (data) => {
        if (data && data.address) {
          const name = data.address.suburb || data.address.town || data.address.village || data.address.city_district || data.address.municipality || data.address.city || data.address.county || data.address.state_district;
          if (name) {
            if (isDestino) {
              this.destinoInputValue = `${name} (Pin en Mapa)`;
              this.destino = this.destinoInputValue;
              this.destinoMunicipio = name;
              this.destinoDepartamento = data.address.state || null;
              this.closeLocationSelector();
              this.checkRoute();
            } else {
              this.userMunicipalityName = name;
              this.userDepartamento = data.address.state || null;
            }
            this.cdr.detectChanges();
          }
        }
      },
      error: (err) => {
        console.error('Error in reverse geocoding:', err);
      }
    });
  }

  customDestinoMarker: any = null;

  setCustomDestination(lat: number, lng: number) {
    if (this.customDestinoMarker) {
      this.map.removeLayer(this.customDestinoMarker);
    }
    const pinIcon = L.divIcon({
      className: 'modern-pin-container',
      html: `<div class="modern-pin" style="background: #ef4444;"></div>`, // Red pin
      iconSize: [32, 42],
      iconAnchor: [16, 42]
    });
    this.customDestinoMarker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(this.map);
    
    this.customDestinoMarker.on('dragend', (e: any) => {
      const pos = e.target.getLatLng();
      this.fetchMunicipalityName(pos.lat, pos.lng, true);
    });

    this.fetchMunicipalityName(lat, lng, true);
  }

  updateUserMarker() {
    if (!this.map || !this.userLocation) return;
    
    if (this.userMarker) {
      this.userMarker.setLatLng(this.userLocation);
    } else {
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: '<div class="brand-dot"></div><div class="brand-dot-pulse"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      this.userMarker = L.marker(this.userLocation, { icon: userIcon, zIndexOffset: 1000 }).addTo(this.map);
      this.map.setView(this.userLocation, 13);
    }
  }

  showNearbyPoints() {
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
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];

    // Add pulsing markers
    const pulseIcon = L.divIcon({
      className: 'pulse-marker',
      html: `<div class="pulse-marker-container"><div class="pulse-circle"></div></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    const bounds = L.latLngBounds([this.userLocation]);

    nearby.forEach(loc => {
      if (loc.ubicacion && loc.ubicacion.lat && loc.ubicacion.lng) {
        const marker = L.marker([loc.ubicacion.lat, loc.ubicacion.lng], { icon: pulseIcon }).addTo(this.map);
        bounds.extend([loc.ubicacion.lat, loc.ubicacion.lng]);
        
        // Add a tooltip to show the status quickly on the map
        const statusText = loc._status ? `${loc._status.mainText}` : loc.nombre_destino;
        marker.bindTooltip(`<b>${loc.empresa}</b><br>${statusText}`, { direction: 'top', offset: [0, -10] });

        marker.on('click', (e: any) => {
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          this.focusLocation(loc);
          this.selectedPin = loc;
          this.selectedPinDayFilter = '';
          this.cdr.detectChanges();
        });
        this.markers.push(marker);
      }
    });

    // Zoom map to fit the nearby points
    this.isProgrammaticMove = true;
    this.map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }

  onDeliveryDayChange(res: any, event: any) {
    const selectedIdx = event.target.value;
    if (res.opciones_entrega && res.opciones_entrega[selectedIdx]) {
      const opt = res.opciones_entrega[selectedIdx];
      res.fecha_llegada = opt.fecha_llegada;
      res.horario_recoleccion = opt.horario_recoleccion;
      res.origen_msg = opt.dropoff_msg;
      res.selected_opcion_idx = selectedIdx;
      this.cdr.detectChanges();
    }
  }

  updateMapMarkers() {
    if (!this.map) return;
    
    // Clear old markers
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];

    let pointsToPlot: any[] = [];
    
    if (this.selectedPin) {
      // Si hay un pin individual seleccionado para ver, SOLO pintar ese pin
      pointsToPlot = [this.selectedPin];
    } else if (this.flightResults && this.flightResults.length > 0 && this.displayedResults.length > 0 && this.displayedResults[0].origen_nombre) {
      // Si estamos mostrando rutas, mapeamos tanto el origen como el destino
      this.displayedResults.forEach((r: any) => {
        const originLoc = this.locations.find(l => l.nombre_destino === r.origen_nombre);
        const destLoc = this.locations.find(l => l.nombre_destino === r.destino_nombre);
        if (originLoc && !pointsToPlot.find(p => p.nombre_destino === originLoc.nombre_destino)) {
          pointsToPlot.push({ ...originLoc, markerType: 'origin', locData: r });
        }
        if (destLoc && !pointsToPlot.find(p => p.nombre_destino === destLoc.nombre_destino)) {
          pointsToPlot.push({ ...destLoc, markerType: 'destination', locData: r });
        }
      });
    } else if (this.displayedResults && this.displayedResults.length > 0) {
      pointsToPlot = [...this.displayedResults]; // Use displayedResults so map respects filters!
      
      // Asegurar de pintar también el destino específico si existe
      if (this.destino && !this.destinoMunicipio) {
         const destLoc = this.locations.find(l => l.id === this.destino || l.nombre_destino === this.destino);
         if (destLoc && !pointsToPlot.find(p => p.nombre_destino === destLoc.nombre_destino)) {
            pointsToPlot.push(destLoc);
         }
      }
    } else {
      // Estado base: sin resultados de búsqueda, pero podríamos tener origen o destino seleccionados
      pointsToPlot = [];
      if (this.destino && !this.destinoMunicipio) {
        const destLoc = this.locations.find(l => l.id === this.destino || l.nombre_destino === this.destino);
        if (destLoc) pointsToPlot.push(destLoc);
      }
      if (this.origen && !this.origenMunicipio) {
        const origLoc = this.locations.find(l => l.id === this.origen || l.nombre_destino === this.origen);
        if (origLoc) pointsToPlot.push(origLoc);
      }
    }
    
    if (pointsToPlot.length === 0) return;

    const bounds = L.latLngBounds([]);

    pointsToPlot.forEach(loc => {
      const lat = loc.lat || loc.ubicacion?.lat;
      const lng = loc.lng || loc.ubicacion?.lng;

      if (lat && lng) {
        bounds.extend([lat, lng]);

        const isSelected = this.expandedResultCard === loc || (this.selectedPin && this.selectedPin.nombre_destino === loc.nombre_destino);
        
        let markerType = loc.markerType || '';
        
        // Inferir markerType si no viene forzado
        if (!markerType) {
          if (this.origen && (loc.id === this.origen || loc.nombre_destino === this.origen)) markerType = 'origin';
          else if (this.destino && (loc.id === this.destino || loc.nombre_destino === this.destino)) markerType = 'destination';
          else if (this.isOriginDiscoveryMode) markerType = 'origin';
          else markerType = 'destination'; // Si es descubrimiento o click al azar, asumimos destination
        }

        let customIcon;
        if (markerType === 'origin') {
          const classes = isSelected ? 'custom-map-marker origin-marker marker-selected' : 'custom-map-marker origin-marker';
          customIcon = L.divIcon({
            className: 'custom-map-marker-container',
            html: `<div class="${classes}"><span>O</span></div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 40]
          });
        } else if (markerType === 'destination') {
          const classes = isSelected ? 'custom-map-marker destination-marker marker-selected' : 'custom-map-marker destination-marker';
          customIcon = L.divIcon({
            className: 'custom-map-marker-container',
            html: `<div class="${classes}"><span>D</span></div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 40]
          });
        } else {
          customIcon = L.divIcon({
            className: 'custom-map-marker-container',
            html: `<div class="custom-map-marker destination-marker"><span>D</span></div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 40]
          });
        }

        const marker = L.marker([lat, lng], { icon: customIcon }).addTo(this.map);
        
        // Save the location object reference to update its class later
        (marker as any).locData = loc;

        marker.on('click', (e: any) => {
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          
          this.focusLocation(loc);
          
          // Find original location object to get full details like schedule and status
          const originalLoc = this.locations.find((l: any) => 
             (l.nombre_destino === loc.destino_nombre || l.nombre_destino === loc.nombre_destino) && 
             (l.empresa === loc.empresa)
          ) || loc;
          
          this.selectedPin = { ...originalLoc, markerType: markerType };
          this.selectedPinDayFilter = '';
          this.expandedResultCard = null; // Collapse list card if open
          this.cdr.detectChanges();
        });
        this.markers.push(marker);
      }
    });

    if (bounds.isValid()) {
      // Avoid zooming in too much if there's only 1 point
      this.isProgrammaticMove = true;
      this.map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
    
    // Ensure styles (like highlight/dim) are applied to the newly created markers
    this.updateMarkerStyles();
  }

  highlightedRoute: any = null;

  highlightRouteOnMap(route: any) {
    this.highlightedRoute = route;
    this.updateMarkerStyles();
    
    // Fit bounds to just these two markers
    if (this.map && route) {
      const p1 = this.locations.find((l:any) => l.nombre_destino === route.origen_nombre && l.empresa === route.empresa);
      const p2 = this.locations.find((l:any) => l.nombre_destino === route.destino_nombre && l.empresa === route.empresa);
      const b = L.latLngBounds([]);
      if (p1 && (p1.ubicacion?.lat || p1.lat)) b.extend([(p1.ubicacion?.lat || p1.lat), (p1.ubicacion?.lng || p1.lng)]);
      if (p2 && (p2.ubicacion?.lat || p2.lat)) b.extend([(p2.ubicacion?.lat || p2.lat), (p2.ubicacion?.lng || p2.lng)]);
      
      if (b.isValid()) {
        this.isProgrammaticMove = true;
        this.map.flyToBounds(b, { padding: [50, 50], maxZoom: 15 });
      }
      this.bottomSheetState = 'collapsed';
      this.cdr.detectChanges();
    }
  }

  resetMapMarkers() {
    this.highlightedRoute = null;
    this.updateMarkerStyles();
    
    // Re-fit all bounds
    if (this.map && this.markers.length > 0) {
      const group = L.featureGroup(this.markers);
      this.isProgrammaticMove = true;
      this.map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 15 });
    }
    this.bottomSheetState = 'expanded';
    this.cdr.detectChanges();
  }

  updateMarkerStyles() {
    this.markers.forEach((marker: any) => {
      const el = marker.getElement();
      if (!el) return;

      let isDimmed = false;
      let isHighlighted = false;

      if (this.highlightedRoute) {
         // Is this marker part of the highlighted route?
         const r = this.highlightedRoute;
         const isOrigin = (marker.locData.nombre_destino === r.origen_nombre && marker.locData.empresa === r.empresa);
         const isDest = (marker.locData.nombre_destino === r.destino_nombre && marker.locData.empresa === r.empresa);
         if (isOrigin || isDest) {
            isHighlighted = true;
         } else {
            isDimmed = true;
         }
      }

      const isSelected = this.expandedResultCard === marker.locData || 
                         (this.selectedPin && this.selectedPin.nombre_destino === marker.locData.nombre_destino);

      if (isSelected) {
         el.classList.add('marker-selected');
      } else {
         el.classList.remove('marker-selected');
      }

      if (this.expandedResultCard && !isSelected) {
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
        const locLatLng = L.latLng(loc.ubicacion.lat, loc.ubicacion.lng);
        loc.distance = (this.userLocation!.distanceTo(locLatLng) / 1000); // km
      } else {
        loc.distance = 9999;
      }
    });

    this.filteredLocations.forEach(loc => {
      if (loc.ubicacion && loc.ubicacion.lat && loc.ubicacion.lng) {
        const locLatLng = L.latLng(loc.ubicacion.lat, loc.ubicacion.lng);
        loc.distance = (this.userLocation!.distanceTo(locLatLng) / 1000); // km
      } else {
        loc.distance = 9999;
      }
    });

    this.filteredLocations.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    this.locations.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    
    this.updateMapMarkers();
    this.cdr.detectChanges();
  }

  onFilterChange() {
    this.checkRoute();
  }

  clearSearch() {
    this.origen = '';
    this.origenMunicipio = null;
    this.origenDepartamento = null;
    this.origenInputValue = '';
    this.destino = '';
    this.destinoMunicipio = null;
    this.destinoDepartamento = null;
    this.destinoInputValue = '';
    this.flightResults = [];
    this.municipalityResults = [];
    this.isDiscoveryMode = false;
    this.isOriginDiscoveryMode = false;
    this.selectedPin = null;
    
    // Default to show all items (filtered by company if any)
    if (this.companyFilter) {
      this.filteredLocations = this.locations.filter(loc => loc.empresa === this.companyFilter);
    } else {
      this.filteredLocations = [...this.locations];
    }

    this.updateMapMarkers();
    
    // Reset map view to user location if available, otherwise fit all markers
    if (this.map) {
      if (this.userLocation) {
        this.isProgrammaticMove = true;
        this.map.setView(this.userLocation, 13);
      } else if (this.markers.length > 0) {
        const group = L.featureGroup(this.markers);
        this.isProgrammaticMove = true;
        this.map.fitBounds(group.getBounds(), { padding: [50, 50] });
      }
    }
    
    this.expandSheetIfNeeded();
  }

  onDayFilterChange() {
    this.cdr.detectChanges();
  }

  toggleFilter(type: string) {
    // Mock opening date/time pickers
    // In a real app, this would open a calendar/time bottom sheet
    if (type === 'date') {
      const today = new Date();
      this.dropoffDate = today.toISOString().split('T')[0];
    }
    this.checkRoute();
  }

  toggleSheet() {
    if (this.bottomSheetState === 'collapsed') {
      this.bottomSheetState = 'half';
      if (this.highlightedRoute) this.resetMapMarkers();
    }
    else if (this.bottomSheetState === 'half') this.bottomSheetState = 'expanded';
    else this.bottomSheetState = 'collapsed';
  }

  expandSheetIfNeeded() {
    if (this.bottomSheetState === 'collapsed') {
      this.bottomSheetState = 'half';
      if (this.highlightedRoute) this.resetMapMarkers();
    }
  }

  collapseSheet() {
    if (this.bottomSheetState === 'expanded' || this.bottomSheetState === 'half') {
      this.bottomSheetState = 'collapsed';
    }
  }

  // --- Touch dragging logic for Bottom Sheet ---
  private touchStartY: number = 0;

  onTouchStart(e: TouchEvent) {
    this.touchStartY = e.touches[0].clientY;
  }

  onTouchEnd(e: TouchEvent) {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchEndY - this.touchStartY;
    
    const sheetContent = document.querySelector('.sheet-content');
    const isAtTop = sheetContent ? sheetContent.scrollTop <= 1 : true;
    
    const target = e.target as HTMLElement;
    const isHeaderTouch = target.closest('.persistent-sheet-header') !== null;

    if (diff > 40 && (isAtTop || isHeaderTouch)) {
      // Swiped down
      if (this.bottomSheetState === 'expanded') this.bottomSheetState = 'half';
      else if (this.bottomSheetState === 'half') this.bottomSheetState = 'collapsed';
    } else if (diff < -40 && (isAtTop || isHeaderTouch)) {
      // Swiped up
      if (this.bottomSheetState === 'collapsed') {
        this.bottomSheetState = 'half';
        if (this.highlightedRoute) this.resetMapMarkers();
      }
      else if (this.bottomSheetState === 'half') this.bottomSheetState = 'expanded';
    }
  }

  focusLocation(loc: any) {
    if (loc.ubicacion && loc.ubicacion.lat && loc.ubicacion.lng) {
      this.isProgrammaticMove = true;
      this.map.flyTo([loc.ubicacion.lat, loc.ubicacion.lng], 15);
      
      // Auto collapse bottom sheet on mobile to show map
      if (window.innerWidth < 768) {
        this.bottomSheetState = 'collapsed';
      }
    }
  }

  showOriginPinDetails(flight: any) {
    const originLoc = this.locations.find(l => l.nombre_destino === flight.origen_nombre && l.empresa === flight.empresa);
    if (originLoc) {
      this.selectedPin = { ...originLoc, markerType: 'origin' };
      this.selectedPinDayFilter = '';
      this.expandedResultCard = null;
      this.focusLocation(originLoc);
      
      // Set bottom sheet state to min or half so the map is visible
      if (window.innerWidth < 768) {
        this.bottomSheetState = 'collapsed';
      }
      
      this.cdr.detectChanges();
    }
  }

  showDestinoPinDetails(flight: any) {
    const destLoc = this.locations.find(l => l.nombre_destino === (flight.destino_nombre || this.destinoInputValue) && l.empresa === flight.empresa);
    if (destLoc) {
      this.selectedPin = { ...destLoc, markerType: 'destination' };
      this.selectedPinDayFilter = '';
      this.expandedResultCard = null;
      this.focusLocation(destLoc);
      
      if (window.innerWidth < 768) {
        this.bottomSheetState = 'collapsed';
      }
      
      this.cdr.detectChanges();
    }
  }

  closePinDetails() {
    this.selectedPin = null;
    this.selectedPinDayFilter = '';
    this.updateMapMarkers(); // Actualizar para que el pin desaparezca si no es parte de una búsqueda activa
  }

  copyPinDetails() {
    if (!this.selectedPin) return;

    let text = `${this.selectedPin.nombre_destino}\n${this.selectedPin.empresa}\n${this.selectedPin.ubicacion?.municipio || ''}, ${this.selectedPin.ubicacion?.departamento || ''}\n\n`;
    
    if (this.origen) {
      const displayed = this.getDisplayedSchedules(this.selectedPin);
      if (displayed.length > 0) {
        text += `Horario Próximo / Seleccionado:\n`;
        displayed.forEach((h: any) => {
          text += `- ${h.dia_semana}: ${this.formatTime(h.hora_apertura)} - ${this.formatTime(h.hora_cierre)}\n`;
        });
      } else {
        text += `Horario Próximo: No definido\n`;
      }
    } else {
      text += `Horarios de Atención:\n`;
      if (this.selectedPin.horarios_operativos && this.selectedPin.horarios_operativos.length > 0) {
        this.selectedPin.horarios_operativos.forEach((h: any) => {
          text += `- ${h.dia_semana}: ${this.formatTime(h.hora_apertura)} - ${this.formatTime(h.hora_cierre)}\n`;
        });
      } else {
        text += `No definidos\n`;
      }
    }

    // Append Google Maps link if available
    if (this.selectedPin.maps_url) {
      text += `\n📍 Ubicación en Google Maps:\n${this.selectedPin.maps_url}\n`;
    } else if (this.selectedPin.ubicacion?.lat && this.selectedPin.ubicacion?.lng) {
      text += `\n📍 Coordenadas: ${this.selectedPin.ubicacion.lat}, ${this.selectedPin.ubicacion.lng}\n`;
    }

    navigator.clipboard.writeText(text).then(() => {
      console.log('Copiado al portapapeles');
    }).catch(err => console.error('Error al copiar', err));
  }


  getDisplayedSchedules(loc: any): any[] {
    if (!loc || !loc.horarios_operativos) return [];

    // If an origin is defined, we show only the selected day or the closest day
    if (this.origen) {
      if (this.selectedPinDayFilter) {
        const found = loc.horarios_operativos.find((h: any) => h.dia_semana === this.selectedPinDayFilter);
        return found ? [found] : [];
      } else {
        // Return the closest schedule (today or next open day)
        // Similar to calculateAgencyStatus logic
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const now = new Date();
        // If there's a dropoffDate, we could use that, but simple next open is fine
        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        
        for (let i = 0; i < 7; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() + i);
          const dayName = days[d.getDay()];
          const schedule = loc.horarios_operativos.find((h: any) => normalize(h.dia_semana) === normalize(dayName));
          if (schedule) {
            return [schedule]; // return closest
          }
        }
        return [];
      }
    }

    // Otherwise, show all schedules
    return loc.horarios_operativos;
  }

  // --- Location Selector Logic ---
  isSearchExpanded: boolean = false;
  activeInput: 'origen' | 'destino' | null = null;
  showAutocomplete: boolean = false;
  origenInputValue: string = '';
  destinoInputValue: string = '';
  arrivalDate: string = '';
  
  destinoMunicipio: string | null = null;
  destinoDepartamento: string | null = null;

  toggleSearchPanel() {
    this.isSearchExpanded = !this.isSearchExpanded;
    if (this.isSearchExpanded) {
      this.activeInput = 'origen';
      this.showAutocomplete = false;
      this.activeFilterTab = 'lugar';
      this.locationSearchQuery = this.origenInputValue;
      this.filterModalLocations();
    } else {
      this.activeInput = null;
      this.showAutocomplete = false;
    }
  }

  setPinAsDestinationAndPromptOrigin() {
    if (!this.selectedPin) return;
    
    // Set destination to the selected pin
    this.destino = this.selectedPin.id || this.selectedPin.nombre_destino;
    this.destinoInputValue = this.selectedPin.nombre_destino;
    this.destinoMunicipio = null;
    this.destinoDepartamento = null;
    
    this.selectedPin = null;
    this.isSearchExpanded = true;
    this.handleSelectionHandoff('destino');
    this.cdr.detectChanges();
  }

  setPinAsOriginAndPromptDestination() {
    if (!this.selectedPin) return;
    
    // Set origin to the selected pin
    this.origen = this.selectedPin.id || this.selectedPin.nombre_destino;
    this.origenInputValue = this.selectedPin.nombre_destino;
    this.origenMunicipio = null;
    this.origenDepartamento = null;
    
    this.selectedPin = null;
    this.isSearchExpanded = true;
    this.handleSelectionHandoff('origen');
    this.updateMapMarkers();
    this.cdr.detectChanges();
  }

  openLocationSelector(type: 'origen' | 'destino', company: string | null = null) {
    this.validationError = '';
    this.companyFilter = company;
    this.isSearchExpanded = true;
    this.activeInput = type;
    this.showAutocomplete = false;
    this.activeFilterTab = type === 'origen' ? 'lugar' : 'destino';
    this.locationSearchQuery = type === 'origen' ? this.origenInputValue : this.destinoInputValue;
    this.filterModalLocations();
  }

  focusInput(type: 'origen' | 'destino') {
    this.activeInput = type;
    this.activeFilterTab = type === 'origen' ? 'lugar' : 'destino';
    this.locationSearchQuery = type === 'origen' ? this.origenInputValue : this.destinoInputValue;
    this.filterModalLocations();
  }

  clearInput(type: 'origen' | 'destino') {
    if (type === 'origen') {
      this.origenInputValue = '';
      this.origen = '';
      this.origenMunicipio = null;
      this.origenDepartamento = null;
      this.onOrigenInput({ target: { value: '' } } as any);
    } else {
      this.destinoInputValue = '';
      this.destino = '';
      this.destinoMunicipio = null;
      this.destinoDepartamento = null;
      this.onDestinoInput({ target: { value: '' } } as any);
    }
    this.focusInput(type);
  }

  onOrigenInput(event: any) {
    this.origenInputValue = event.target.value;
    this.locationSearchQuery = this.origenInputValue;
    this.showAutocomplete = true;
    this.filterModalLocations();
  }

  onDestinoInput(event: any) {
    this.destinoInputValue = event.target.value;
    this.locationSearchQuery = this.destinoInputValue;
    this.showAutocomplete = true;
    this.filterModalLocations();
  }

  closeLocationSelector() {
    this.isSearchExpanded = false;
    this.activeInput = null;
    this.showAutocomplete = false;
    this.validationError = '';
    this.clearSearch(); // Clear all inputs when closing modal
  }

  onSearchLocation(event: any) {
    const query = event.target.value.toLowerCase();
    this.locationSearchQuery = query;
    this.filterModalLocations();
  }

  filterModalLocations() {
    if (this.activeFilterTab === 'lugar') {
      let filtered = [...this.locations];
      
      // Filtrar por la empresa del destino si ya hay uno seleccionado y es específico
      let destCompany = this.companyFilter;
      if (!destCompany && this.destino && !this.destinoMunicipio) {
        const destLoc = this.locations.find(l => l.id === this.destino || l.nombre_destino === this.destino);
        if (destLoc) destCompany = destLoc.empresa;
      }
      
      if (destCompany) {
        filtered = filtered.filter(l => l.empresa === destCompany);
      }
      
      const lowerQuery = this.locationSearchQuery ? this.locationSearchQuery.toLowerCase() : '';
      const isMyLoc = lowerQuery === 'mi ubicación' || lowerQuery === 'mi ubicacion';
      const effectiveQuery = isMyLoc ? '' : lowerQuery;

      if (effectiveQuery) {
        // Búsqueda a nivel nacional por texto
        filtered = filtered.filter(l => 
          l.nombre_destino.toLowerCase().includes(effectiveQuery) || 
          (l.ubicacion?.municipio || '').toLowerCase().includes(effectiveQuery) ||
          (l.ubicacion?.departamento || '').toLowerCase().includes(effectiveQuery) ||
          (l.empresa || '').toLowerCase().includes(effectiveQuery)
        );
        if (this.userLocation) {
          filtered.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
        }
        this.filteredModalLocations = filtered.slice(0, 15);
      } else {
        // Si no hay query, mostrar pocas agencias cercanas primero y no agobiar
        if (this.userLocation) {
           this.filteredModalLocations = [...filtered].sort((a, b) => (a.distance || 9999) - (b.distance || 9999)).slice(0, 3);
        } else {
           this.filteredModalLocations = filtered.slice(0, 3); 
        }
      }
  
      if (!effectiveQuery) {
        // UX: No mostrar todos los municipios si no han escrito nada
        this.filteredOriginMunicipalities = [];
      } else {
        this.filteredOriginMunicipalities = this.uniqueMunicipalities.filter(m => 
          m.nombre_display.toLowerCase().includes(effectiveQuery)
        );
      }
    } else if (this.activeFilterTab === 'destino') {
      const lowerQuery = this.locationSearchQuery ? this.locationSearchQuery.toLowerCase() : '';
      if (!lowerQuery) {
        // UX: No mostrar todos los municipios si no han escrito nada
        this.filteredMunicipalities = [];
        let locs = [...this.locations];
        if (this.userLocation) {
           locs.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
        }
        this.filteredModalLocations = locs.slice(0, 3);
      } else {
        this.filteredMunicipalities = this.uniqueMunicipalities.filter(m => 
          m.nombre_display.toLowerCase().includes(lowerQuery)
        );
        let locs = this.locations.filter(l => 
          l.nombre_destino.toLowerCase().includes(lowerQuery) || 
          (l.ubicacion?.municipio || '').toLowerCase().includes(lowerQuery) ||
          (l.ubicacion?.departamento || '').toLowerCase().includes(lowerQuery) ||
          (l.empresa || '').toLowerCase().includes(lowerQuery)
        );
        if (this.userLocation) {
           locs.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
        }
        this.filteredModalLocations = locs.slice(0, 15);
      }
    }
  }

  onRadiusChange() {
    this.filterModalLocations();
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

  selectLocation(loc: any, forceType?: 'origen' | 'destino') {
    const type = forceType || this.activeInput;
    if (type === 'origen') {
      this.origen = loc.id || loc.nombre_destino;
      this.origenInputValue = loc.nombre_destino;
      this.origenMunicipio = null;
      this.origenDepartamento = null;
    } else {
      this.destino = loc.id || loc.nombre_destino;
      this.destinoInputValue = loc.nombre_destino;
      this.destinoMunicipio = null;
      this.destinoDepartamento = null;
    }
    this.validationError = '';
    this.showAutocomplete = false;
    this.handleSelectionHandoff(type);
  }

  selectUserLocationAsOrigin() {
    this.origen = 'Mi Ubicación';
    this.origenInputValue = 'Mi Ubicación';
    this.origenMunicipio = null; 
    this.origenDepartamento = '';
    this.validationError = '';
    this.showAutocomplete = false;
    this.handleSelectionHandoff('origen');
  }

  selectOriginMunicipality(mun: any) {
    this.origen = mun.nombre_display;
    this.origenInputValue = mun.nombre_display;
    this.origenMunicipio = mun.municipio;
    this.origenDepartamento = mun.departamento;
    this.validationError = '';
    this.showAutocomplete = false;
    this.handleSelectionHandoff('origen');
  }

  selectMunicipality(mun: any, forceType?: 'origen' | 'destino') {
    const type = forceType || 'destino';
    if (type === 'destino') {
       this.destino = mun.nombre_display;
       this.destinoInputValue = mun.nombre_display;
       this.destinoMunicipio = mun.municipio;
       this.destinoDepartamento = mun.departamento;
    }
    this.showAutocomplete = false;
    this.validationError = '';
    this.handleSelectionHandoff(type);
  }

  handleSelectionHandoff(type: 'origen' | 'destino' | null) {
    if (type === 'origen' && !this.destino) {
      this.focusInput('destino');
    } else if (type === 'destino' && !this.origen) {
      this.focusInput('origen');
    } else if (this.origen && this.destino) {
      this.executeSearch();
    }
  }

  executeSearch() {
    this.showAutocomplete = false;
    this.triggerDynamicSearch();
  }

  onDateChanged() {
    this.triggerDynamicSearch();
  }

  triggerDynamicSearch() {
    if (this.origen && this.destino) {
       this.checkRoute();
       this.isSearchExpanded = false;
    } else if (this.destinoMunicipio) {
       this.discoveryModeForMunicipality(this.destinoMunicipio, this.destinoDepartamento || '');
       this.isSearchExpanded = false;
    } else if (this.origenMunicipio) {
       this.discoveryModeForOriginMunicipality(this.origenMunicipio, this.origenDepartamento || '');
       this.isSearchExpanded = false;
    } else if (this.origen && !this.destino) {
       this.updateMapMarkers();
       this.openLocationSelector('destino');
    }
  }

  discoveryModeForOriginMunicipality(municipio: string, departamento: string) {
    this.loading = true;
    this.result = null;
    this.errorMsg = '';
    this.flightResults = [];
    this.municipalityResults = [];
    this.bottomSheetState = 'expanded';
    this.isOriginDiscoveryMode = true; // Flag for drawing Origin markers
    this.isDiscoveryMode = false;

    // Show ALL agencies in the municipality
    const targets = this.locations.filter(l => 
      l.ubicacion?.municipio === municipio && 
      l.ubicacion?.departamento === departamento
    );

    if (targets.length === 0) {
      this.errorMsg = `No hay agencias de origen registradas en este municipio.`;
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    // Set them in municipalityResults but formatted for Discovery
    this.municipalityResults = targets.map(loc => ({
      destino_nombre: loc.nombre_destino, // Re-using card template field
      empresa: loc.empresa,
      distance: loc.distance || 9999,
      lat: loc.ubicacion?.lat,
      lng: loc.ubicacion?.lng,
      horarios_operativos: loc.horarios_operativos,
      _status: loc._status,
      markerType: 'destination'
    })).sort((a: any, b: any) => a.distance - b.distance);

    if (this.activeEmpresa) {
      this.setEmpresaFilter(this.activeEmpresa);
    } else {
      this.displayedResults = [...this.municipalityResults];
    }

    this.loading = false;
    
    // Fit bounds to these locations
    if (targets.length > 0) {
      const bounds = L.latLngBounds(targets.filter(t => t.ubicacion?.lat).map(t => [t.ubicacion.lat, t.ubicacion.lng]));
      if (bounds.isValid()) {
         this.isProgrammaticMove = true;
         this.map.fitBounds(bounds.pad(0.2));
      }
    }
    
    this.updateMapMarkers();
    this.cdr.detectChanges();
  }

  discoveryModeForMunicipality(municipio: string, departamento: string) {
    this.loading = true;
    this.result = null;
    this.errorMsg = '';
    this.flightResults = [];
    this.municipalityResults = [];
    this.bottomSheetState = 'expanded';
    this.isDiscoveryMode = true;
    this.isOriginDiscoveryMode = false;

    // Show ALL agencies in the municipality
    const targets = this.locations.filter(l => 
      l.ubicacion?.municipio === municipio && 
      l.ubicacion?.departamento === departamento
    );

    if (targets.length === 0) {
      this.errorMsg = `No hay agencias registradas en este municipio.`;
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    // Set them in municipalityResults but formatted for Discovery
    this.municipalityResults = targets.map(loc => ({
      destino_nombre: loc.nombre_destino,
      empresa: loc.empresa,
      distance: loc.distance || 9999,
      lat: loc.ubicacion?.lat,
      lng: loc.ubicacion?.lng,
      horarios_operativos: loc.horarios_operativos,
      _status: loc._status
    })).sort((a: any, b: any) => a.distance - b.distance);

    if (this.activeEmpresa) {
      this.setEmpresaFilter(this.activeEmpresa);
    } else {
      this.displayedResults = [...this.municipalityResults];
    }

    this.loading = false;
    
    // Fit bounds to these locations
    if (targets.length > 0) {
      const bounds = L.latLngBounds(targets.filter(t => t.ubicacion?.lat).map(t => [t.ubicacion.lat, t.ubicacion.lng]));
      if (bounds.isValid()) {
         this.isProgrammaticMove = true;
         this.map.fitBounds(bounds.pad(0.2));
      }
    }
    
    this.updateMapMarkers();
    this.cdr.detectChanges();
  }
  
  goToDestinoStep() {
    if (!this.dropoffTime) {
      this.validationError = 'Debes seleccionar una hora aproximada.';
      return;
    }
    
    this.validationError = '';
    this.selectingLocation = 'destino';
    this.activeFilterTab = 'destino';
    this.locationSearchQuery = '';
    this.filteredMunicipalities = [...this.uniqueMunicipalities];
  }
  
  generateTimeSlots() {
    this.timeSlots = [];
    if (!this.dropoffDate) return;

    const selectedDate = new Date(this.dropoffDate);
    // Add timezone offset to fix off-by-one day issues
    selectedDate.setMinutes(selectedDate.getMinutes() + selectedDate.getTimezoneOffset());
    
    const today = new Date();
    
    let startHour = 8; // Business hours start
    const endHour = 18; // Business hours end
    
    if (selectedDate.toDateString() === today.toDateString()) {
       // If today, start from next hour
       startHour = Math.max(8, today.getHours() + 1);
    }
    
    for (let h = startHour; h <= endHour; h++) {
       const period = h >= 12 ? 'PM' : 'AM';
       const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
       const hStr = displayHour.toString().padStart(2, '0');
       // Real time for value
       const valH = h.toString().padStart(2, '0');
       this.timeSlots.push(`${valH}:00`);
    }
    
    // Auto-select first slot if current is invalid
    if (this.timeSlots.length > 0 && !this.timeSlots.includes(this.dropoffTime)) {
       this.dropoffTime = this.timeSlots[0];
    }
  }

  selectTimeSlot(time: string) {
    this.dropoffTime = time;
    this.validationError = '';
    this.triggerDynamicSearch();
  }



  recenterMap() {
    if (this.userLocation) {
      this.isProgrammaticMove = true;
      this.map.flyTo(this.userLocation, 15, { animate: true, duration: 1 });
    }
  }

  getTodaySchedule(loc: any): string {
    if (!loc.horarios_operativos || loc.horarios_operativos.length === 0) return 'Horario no disp.';
    const today = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const todayName = days[today.getDay()];
    
    const todaySchedule = loc.horarios_operativos.find((h: any) => h.dia_semana === todayName);
    if (todaySchedule) {
      return `${todaySchedule.hora_apertura} - ${todaySchedule.hora_cierre}`;
    }
    
    return 'Cerrado hoy';
  }

  checkRoute() {
    if (!this.destino) {
      this.result = null;
      return;
    }
    
    // Si no hay origen seleccionado, obligamos a usar la ubicación del usuario
    if (!this.origen && !this.userDepartamento) {
      this.errorMsg = 'Debes otorgar permisos de ubicación para buscar agencias de origen en tu departamento.';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.result = null;
    this.errorMsg = '';
    this.flightResults = [];
    this.municipalityResults = [];
    this.isDiscoveryMode = false;
    this.isOriginDiscoveryMode = false;
    this.updateMapMarkers();
    this.cdr.detectChanges();
    
    let payloadOrigen: any = this.origen;
    let payloadDestino: any = this.destino;
    
    // Preparar destinos si es municipio
    if (this.destinoMunicipio) {
      const destAgencies = this.locations.filter(l => 
        l.ubicacion?.municipio === this.destinoMunicipio && 
        l.ubicacion?.departamento === this.destinoDepartamento
      );
      payloadDestino = destAgencies.map(a => a.id);
      if (payloadDestino.length === 0) {
         this.errorMsg = `No hay agencias registradas en ${this.destinoMunicipio}.`;
         this.loading = false;
         this.cdr.detectChanges();
         return;
      }
    }
    
    // Preparar orígenes si es municipio
    if (this.origenMunicipio) {
      const munAgencies = this.locations.filter(l => 
        l.ubicacion?.municipio === this.origenMunicipio && 
        l.ubicacion?.departamento === this.origenDepartamento
      );
      payloadOrigen = munAgencies.map(a => a.id);
      if (payloadOrigen.length === 0) {
         this.errorMsg = `No hay agencias de envío en el municipio de ${this.origenMunicipio}.`;
         this.loading = false;
         this.cdr.detectChanges();
         return;
      }
    } else if (this.origen === 'Mi Ubicación' || !this.origen) {
      // Si el destino no es un municipio, podemos filtrar por empresa. Si lo es, no tenemos una empresa específica.
      let destCompany = null;
      if (!this.destinoMunicipio) {
         const destLoc = this.locations.find(l => l.id === this.destino || l.nombre_destino === this.destino);
         destCompany = destLoc ? destLoc.empresa : null;
      }

      if (destCompany && this.userDepartamento) {
        const deptAgencies = this.locations.filter(l => 
          l.empresa === destCompany && 
          l.ubicacion?.departamento === this.userDepartamento
        );
        payloadOrigen = deptAgencies.map(a => a.id);
      } else if (this.origen === 'Mi Ubicación') {
        const nearbyAgencies = this.locations.filter(l => (l.distance || 9999) <= this.searchRadius && l.empresa);
        payloadOrigen = nearbyAgencies.map(a => a.id);
      }
    }
    
    if (Array.isArray(payloadOrigen) && payloadOrigen.length === 0) {
      const cmp = this.locations.find(l => l.id === this.destino || l.nombre_destino === this.destino)?.empresa;
      this.errorMsg = `No se encontraron agencias de ${cmp || 'la empresa'} cerca de tu ubicación.`;
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    this.http.post('http://localhost:3000/api/get-upcoming-routes', {
      origen: payloadOrigen,
      destino: payloadDestino,
      dropoff_date: this.dropoffDate || null,
      dropoff_time: this.dropoffTime || null,
      arrival_date: this.arrivalDate || null
    }).subscribe({
      next: (res: any) => {
        if (res.results) {
          // Multiple origin options found
          this.flightResults = res.results.map((r: any) => {
            const originLoc = this.locations.find(l => l.nombre_destino === r.origen_nombre);
            
            if (r.opciones) {
              r.opciones = r.opciones.filter((op: any) => {
                const time = op.horario_recoleccion?.toLowerCase() || '';
                return !time.includes('no disp') && !time.includes('no defin');
              });
            }

            return {
               ...r,
               fecha_llegada: r.opciones_entrega && r.opciones_entrega.length > 0 ? r.opciones_entrega[0].fecha_llegada : r.fecha_llegada,
               horario_recoleccion: r.opciones_entrega && r.opciones_entrega.length > 0 ? r.opciones_entrega[0].horario_recoleccion : r.horario_recoleccion,
               selected_opcion_idx: 0,
               empresa: r.empresa,
               distance: originLoc ? originLoc.distance : 9999,
               lat: originLoc?.ubicacion?.lat,
               lng: originLoc?.ubicacion?.lng,
               isExpanded: res.results.length === 1
            };
          });
          console.log("payloadOrigen:", payloadOrigen);
          console.log("res.results:", res.results);
          console.log("flightResults after map:", this.flightResults);
          this.displayedResults = [...this.flightResults];
          this.result = null;
          
          if (this.displayedResults.length > 0) {
            this.bottomSheetState = 'half';
          }
          
          // La vista del mapa se actualizará en updateMapMarkers()
          this.updateMapMarkers();
        } else {
          this.result = res;
          
          // La vista del mapa se actualizará en updateMapMarkers()
          this.updateMapMarkers();
        }
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.errorMsg = "Error conectando al servidor backend. Verifica que esté corriendo en el puerto 3000.";
        this.loading = false;
        this.cdr.detectChanges();
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

  formatFriendlyDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr + "T00:00:00");
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${dias[date.getDay()]}, ${date.getDate()} de ${meses[date.getMonth()]}`;
  }

  // --- Proximity Based Logic ---
  municipalityResults: any[] = [];
  expandedResultCard: any = null;
  
  toggleResultCard(res: any) {
    if (this.expandedResultCard === res) {
      this.expandedResultCard = null;
    } else {
      this.expandedResultCard = res;
      if (res.lat && res.lng) {
        this.isProgrammaticMove = true;
        this.map.flyTo([res.lat, res.lng], 16);
      }
    }
    this.updateMarkerStyles();
  }
  
  startRouteForCompany(empresa: string) {
    this.bottomSheetState = 'collapsed';
    this.openLocationSelector('origen', empresa);
  }
  

  // --- New Agent UI logic ---

  onSheetScroll(event: Event) {
    const target = event.target as HTMLElement;
    this.isSheetScrolled = target.scrollTop > 10;
  }

  countResultsByEmpresa(emp: string): number {
    if (this.municipalityResults && this.municipalityResults.length > 0) {
      return this.municipalityResults.filter(r => r.empresa === emp).length;
    }
    return 0;
  }

  countByEmpresa(empresa: string) {
    return this.locations.filter(loc => loc.empresa === empresa).length;
  }

  setEmpresaFilter(empresa: string) {
    this.activeEmpresa = empresa;
    this.first = 0;
    
    if (this.municipalityResults && this.municipalityResults.length > 0) {
      if (empresa === '') {
        this.displayedResults = [...this.municipalityResults];
      } else {
        this.displayedResults = this.municipalityResults.filter(r => r.empresa === empresa);
      }
      this.updateMapMarkers();
      this.cdr.detectChanges();
    } 
    else {
      if (empresa === '') {
        this.filteredLocations = [...this.locations];
      } else {
        this.filteredLocations = this.locations.filter(loc => (loc.empresa || 'Agencia') === empresa);
      }
      if (this.userLocation) {
        this.sortLocationsByDistance();
      } else {
        this.updateMapMarkers();
        this.cdr.detectChanges();
      }
    }
    
    // Scroll list to top when changing filters
    const sheetContent = document.querySelector('.sheet-content');
    if (sheetContent) sheetContent.scrollTop = 0;
  }

  onFabClick() {
    this.toastService.showInfo("¡Buscando próxima recolección!", "Próximamente");
    // You can hook this to recalculate routes or find nearest
  }

  // --- ADMIN PANEL LOGIC ---
  switchToInicio() {
    this.activeMainTab = 'inicio';
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 50); // slight delay to allow display:block to take effect
  }

  openAdminPanel() {
    this.activeMainTab = 'puntos';
    this.adminCompanies = Array.from(new Set(this.locations.map(l => l.empresa))).filter(e => e) as string[];
    this.adminSearchTerm = '';
    // Limpiar variables de registro
    this.selectingLocation = null;
    this.isPickingLocation = false;
    this.loadAdminEmpresas();
    this.applyAdminFilter();
  }

  async loadAdminEmpresas() {
    try {
      const res = await this.http.get<any>('http://localhost:3000/api/empresas').toPromise();
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

  async shareLocation(loc: any) {
    const textToShare = `📍 ${loc.nombre_destino}\n🏢 Empresa: ${loc.empresa || 'Agencia'}\n🗺️ Ubicación: ${loc.ubicacion?.municipio || 'N/A'}, ${loc.ubicacion?.departamento || 'N/A'}\n📍 Dirección: ${loc.direccion_referencia || 'N/A'}\n🔗 Maps: ${loc.maps_url || 'N/A'}`;
    
    // Preparar datos para compartir
    const shareData: ShareData = {
      title: `Punto de Envío: ${loc.nombre_destino}`,
      text: textToShare,
    };

    try {
      if (navigator.share) {
        // Usa la API nativa de compartir (Móvil y navegadores compatibles)
        await navigator.share(shareData);
      } else {
        // Fallback a copiar al portapapeles
        await navigator.clipboard.writeText(textToShare);
        this.toastService.showSuccess('¡Información del punto copiada al portapapeles!', 'Copiado');
      }
    } catch (err) {
      console.error('Error al compartir', err);
    }
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
        res = await this.http.put<any>(`http://localhost:3000/api/empresas/${this.editingEmpresaData.id}`, formData).toPromise();
      } else {
        res = await this.http.post<any>('http://localhost:3000/api/empresas', formData).toPromise();
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
    this.editImageUrl = loc.imagen_referencia ? `http://localhost:3000${loc.imagen_referencia}` : null;
    
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

  viewOnMap(loc: any) {
    this.activeMainTab = 'inicio';
    
    // Borrar la selección de los filtros y búsqueda anterior
    this.origen = '';
    this.destino = '';
    this.municipalityResults = [];
    this.displayedResults = [];
    this.result = null;
    this.errorMsg = '';
    
    // Select the pin to open its detail modal
    this.selectedPin = loc;
    this.updateMapMarkers(); // Asegurarnos de pintar el marcador antes de hacer focus
    
    setTimeout(() => {
      this.focusLocation(loc);
    }, 300); // Wait for the tab to render and the map to be fully visible
  }

  previewMapMarker: any = null;

  previewMap(coords: {lat: number, lng: number}) {
    if (this.map && coords && coords.lat && coords.lng) {
      setTimeout(() => {
        this.isProgrammaticMove = true;
        this.map.flyTo([coords.lat, coords.lng], 18); // Más cerca (zoom 18)
        
        if (this.previewMapMarker) {
          this.map.removeLayer(this.previewMapMarker);
        }
        
        const pinIcon = L.divIcon({
          className: 'modern-pin-container',
          html: `<div class="modern-pin" style="background: #ef4444;"></div>`, // Red pin
          iconSize: [32, 42],
          iconAnchor: [16, 42]
        });
        
        this.previewMapMarker = L.marker([coords.lat, coords.lng], { icon: pinIcon, draggable: true }).addTo(this.map);
        
        // Update coordinates if user drags the pin during preview
        this.previewMapMarker.on('dragend', (e: any) => {
          const pos = e.target.getLatLng();
          if (this.adminRef) {
             this.adminRef.updatePickedLocation(pos.lat.toFixed(6), pos.lng.toFixed(6));
          }
        });
        
      }, 300);
    }
  }

  startPickingLocation() {
    this.isPickingLocation = true;
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
        if (this.map && this.editFormData.lat && this.editFormData.lng) {
          this.isProgrammaticMove = true;
          this.map.setView([this.editFormData.lat, this.editFormData.lng], 16);
        }
        
        const center = this.map.getCenter();
        this.tempPickedLat = center.lat.toFixed(5);
        this.tempPickedLng = center.lng.toFixed(5);
        this.cdr.detectChanges();

        this.mapMoveListener = () => {
          const c = this.map.getCenter();
          this.tempPickedLat = c.lat.toFixed(5);
          this.tempPickedLng = c.lng.toFixed(5);
          this.cdr.detectChanges();
        };
        this.map.on('move', this.mapMoveListener);
      }
    }, 50);
  }

  confirmPickedLocation() {
    if (this.map) {
      if (this.mapMoveListener) this.map.off('move', this.mapMoveListener);
      const center = this.map.getCenter();
      this.editFormData.lat = center.lat.toFixed(7);
      this.editFormData.lng = center.lng.toFixed(7);
    }
    this.isPickingLocation = false;
  }
  
  cancelPickingLocation() {
    if (this.map && this.mapMoveListener) {
      this.map.off('move', this.mapMoveListener);
    }
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

    this.http.put(`http://localhost:3000/api/locations/${this.editingLocation.id}`, formData).subscribe({
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
