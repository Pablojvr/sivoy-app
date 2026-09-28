import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Inject,
  InjectionToken,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { Subscription } from 'rxjs';
import { DeliveryPoint } from '../../core/models/location.models';
import {
  MapCoordinate,
  MapInitializeOptions,
  MapPort
} from '../../core/maps/map.port';
import { MapCapabilityService } from '../../core/maps/map-capability.service';
import { MapLifecycleManager } from '../../core/maps/map-lifecycle.manager';
import { createMapMarkerElement } from '../../core/maps/map-marker-element';
import { MapLibreMapAdapter } from '../../core/maps/maplibre-map.adapter';
import { UbicacionesService } from '../../core/services/ubicaciones.service';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { AdminComponent } from './admin.component';

export type AdminMapMode = 'list' | 'viewing' | 'editing';

export type AdminMapFactory = () => MapPort;

export const ADMIN_MAP_FACTORY = new InjectionToken<AdminMapFactory>(
  'ADMIN_MAP_FACTORY',
  {
    providedIn: 'root',
    factory: () => () => new MapLibreMapAdapter()
  }
);

const DEFAULT_SV_CENTER: MapCoordinate = { lat: 13.69, lng: -89.21 };

function parseCoordinateComponent(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function parseAdminCoordinate(latRaw: unknown, lngRaw: unknown): MapCoordinate | null {
  const lat = parseCoordinateComponent(latRaw);
  const lng = parseCoordinateComponent(lngRaw);

  if (lat === null || lng === null) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractCoordinates(source: unknown): { lat: unknown; lng: unknown } | null {
  if (!isRecord(source)) {
    return null;
  }
  if (isRecord(source['ubicacion'])) {
    const ubicacion = source['ubicacion'];
    return { lat: ubicacion['lat'], lng: ubicacion['lng'] };
  }
  return { lat: source['lat'], lng: source['lng'] };
}

function extractDisplayLabel(source: unknown, fallback: string): string {
  if (isRecord(source) && typeof source['nombre_destino'] === 'string') {
    const trimmed = source['nombre_destino'].trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return fallback;
}

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, AdminComponent, BottomNavComponent],
  templateUrl: './admin-page.component.html',
  styleUrl: './admin-page.component.css'
})
export class AdminPageComponent implements OnInit, OnDestroy {
  @ViewChild('adminRef') adminRef?: AdminComponent;
  @ViewChild('mapHost') mapHostRef?: ElementRef<HTMLElement>;

  locations: DeliveryPoint[] = [];
  locationsLoaded = false;
  previewImageUrl: string | null = null;

  mapMode: AdminMapMode = 'list';
  mapErrorMessage: string | null = null;
  isPickingLocation = false;

  private map: MapPort | null = null;
  private mapLifecycle: MapLifecycleManager<unknown> | null = null;
  private mapResizeObserver: ResizeObserver | null = null;
  private locationsSubscription?: Subscription;
  private destroyed = false;

  constructor(
    private ubicacionesService: UbicacionesService,
    private cdr: ChangeDetectorRef,
    private mapCapabilityService: MapCapabilityService,
    @Inject(ADMIN_MAP_FACTORY) private mapFactory: AdminMapFactory,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.loadLocations();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.locationsSubscription?.unsubscribe();
    this.locationsSubscription = undefined;

    if (this.mapResizeObserver) {
      this.mapResizeObserver.disconnect();
      this.mapResizeObserver = null;
    }

    if (this.mapLifecycle) {
      this.mapLifecycle.destroy();
      this.mapLifecycle = null;
    }

    this.map = null;
  }

  onLocationUpdated(): void {
    this.loadLocations();
  }

  onPreviewImage(url: string): void {
    this.previewImageUrl = url;
  }

  closePreview(): void {
    this.previewImageUrl = null;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Esc') {
      this.closePreview();
    }
  }

  onViewOnMap(point: unknown): void {
    if (this.destroyed) return;
    this.mapErrorMessage = null;

    const extracted = extractCoordinates(point);
    const coord = parseAdminCoordinate(extracted?.lat, extracted?.lng);

    if (!coord) {
      this.mapMode = 'list';
      this.isPickingLocation = false;
      if (this.adminRef) {
        this.adminRef.isPickingLocation = false;
      }
      this.mapLifecycle?.clearPrimaryMarkers();
      this.mapLifecycle?.removeAuxiliaryMarker('preview');
      this.mapErrorMessage = 'El punto seleccionado no tiene coordenadas válidas.';
      this.cdr.markForCheck();
      return;
    }

    if (!this.ensureMapInitialized()) {
      return;
    }

    this.mapMode = 'viewing';
    this.isPickingLocation = false;

    this.mapLifecycle?.clearPrimaryMarkers();
    this.mapLifecycle?.removeAuxiliaryMarker('preview');

    const label = extractDisplayLabel(point, 'Punto en el mapa');
    const element = createMapMarkerElement(this.document, 'destination', label, true);

    this.mapLifecycle?.addPrimaryMarker({
      coordinate: coord,
      options: { element, anchor: 'bottom' },
      metadata: point
    });

    this.map?.flyTo(coord, { zoom: 17 });
    this.requestPostVisibilityResize();
    this.cdr.markForCheck();
  }

  onPreviewMap(coords: unknown): void {
    if (this.destroyed) return;
    this.mapErrorMessage = null;

    const extracted = extractCoordinates(coords);
    const coord = parseAdminCoordinate(extracted?.lat, extracted?.lng);
    if (!coord) {
      this.mapMode = 'list';
      this.isPickingLocation = false;
      if (this.adminRef) {
        this.adminRef.isPickingLocation = false;
      }
      this.mapLifecycle?.clearPrimaryMarkers();
      this.mapLifecycle?.removeAuxiliaryMarker('preview');
      this.mapErrorMessage = 'Las coordenadas para la vista previa no son válidas.';
      this.cdr.markForCheck();
      return;
    }

    this.showDraggablePreview(coord);
  }

  onRequestMapPick(formData: unknown): void {
    if (this.destroyed) return;
    this.mapErrorMessage = null;

    const extracted = extractCoordinates(formData);
    const coord = parseAdminCoordinate(extracted?.lat, extracted?.lng) ?? DEFAULT_SV_CENTER;

    if (this.adminRef) {
      this.adminRef.isPickingLocation = true;
    }
    this.isPickingLocation = true;

    if (!this.showDraggablePreview(coord)) {
      if (this.adminRef) {
        this.adminRef.isPickingLocation = false;
      }
      this.isPickingLocation = false;
    }
  }

  private showDraggablePreview(coord: MapCoordinate): boolean {
    if (!this.ensureMapInitialized()) {
      return false;
    }

    this.mapMode = 'editing';
    this.mapLifecycle?.clearPrimaryMarkers();

    const element = createMapMarkerElement(this.document, 'preview', 'Ubicación de vista previa');

    this.mapLifecycle?.setAuxiliaryMarker('preview', {
      coordinate: coord,
      options: { element, draggable: true, anchor: 'bottom' },
      onDragEnd: (pos) => {
        if (!this.destroyed && this.adminRef) {
          this.adminRef.updatePickedLocation(pos.lat.toFixed(6), pos.lng.toFixed(6));
        }
      }
    });

    this.map?.flyTo(coord, { zoom: 18 });
    this.requestPostVisibilityResize();
    this.cdr.markForCheck();
    return true;
  }

  onMinimizeModal(isMinimized: boolean): void {
    if (this.destroyed) return;

    if (!isMinimized) {
      this.mapMode = 'list';
      this.isPickingLocation = false;
      if (this.adminRef) {
        this.adminRef.isPickingLocation = false;
      }
      this.mapLifecycle?.removeAuxiliaryMarker('preview');
      this.cdr.markForCheck();
    }
  }

  returnToList(): void {
    this.mapMode = 'list';
    this.isPickingLocation = false;
    this.mapErrorMessage = null;
    this.mapLifecycle?.clearPrimaryMarkers();
    this.mapLifecycle?.removeAuxiliaryMarker('preview');
    this.cdr.markForCheck();
  }

  returnToEdit(): void {
    this.mapMode = 'list';
    this.isPickingLocation = false;
    this.mapErrorMessage = null;
    if (this.adminRef) {
      this.adminRef.isPickingLocation = false;
    }
    this.mapLifecycle?.removeAuxiliaryMarker('preview');
    this.cdr.markForCheck();
  }

  clearMapError(): void {
    this.mapErrorMessage = null;
    this.cdr.markForCheck();
  }

  private ensureMapInitialized(): boolean {
    if (this.map && this.mapLifecycle) {
      return true;
    }

    if (!this.mapCapabilityService.supportsInteractiveMap()) {
      this.mapErrorMessage = 'El mapa interactivo no es compatible con este dispositivo o navegador.';
      this.mapMode = 'list';
      this.cdr.markForCheck();
      return false;
    }

    const host = this.mapHostRef?.nativeElement ?? this.document.getElementById('admin-map');
    if (!host) {
      this.mapErrorMessage = 'No se encontró el contenedor del mapa (#admin-map).';
      this.mapMode = 'list';
      this.cdr.markForCheck();
      return false;
    }

    let adapter: MapPort | null = null;
    let lifecycle: MapLifecycleManager<unknown> | null = null;
    let observer: ResizeObserver | null = null;

    try {
      adapter = this.mapFactory();
      lifecycle = new MapLifecycleManager(adapter);

      const initOptions: MapInitializeOptions = {
        center: DEFAULT_SV_CENTER,
        zoom: 8.2,
        minZoom: 7,
        maxZoom: 19,
        attributionCompact: true,
        rotationEnabled: false,
        pitchEnabled: false,
        cooperativeGestures: false
      };
      adapter.initialize(host, initOptions);

      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => {
          if (!this.destroyed && this.map) {
            this.map.resize();
          }
        });
        observer.observe(host);
      }

      this.map = adapter;
      this.mapLifecycle = lifecycle;
      this.mapResizeObserver = observer;
      return true;
    } catch {
      if (observer) {
        try {
          observer.disconnect();
        } catch {
          // Ignore observer disconnect failure
        }
      }
      if (lifecycle) {
        try {
          lifecycle.destroy();
        } catch {
          // Ignore lifecycle destroy failure
        }
      }
      this.map = null;
      this.mapLifecycle = null;
      this.mapResizeObserver = null;
      this.mapErrorMessage = 'Ocurrió un error al inicializar el mapa.';
      this.mapMode = 'list';
      this.cdr.markForCheck();
      return false;
    }
  }

  private requestPostVisibilityResize(): void {
    queueMicrotask(() => {
      if (!this.destroyed && this.map) {
        this.map.resize();
      }
    });
  }

  private loadLocations(): void {
    this.locationsSubscription?.unsubscribe();
    this.locationsSubscription = this.ubicacionesService.getLocations().subscribe({
      next: (locations) => {
        this.locations = locations ?? [];
        this.locationsLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.locations = [];
        this.locationsLoaded = true;
        this.cdr.markForCheck();
      }
    });
  }
}
