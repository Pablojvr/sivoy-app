import { Map as MLMap, Marker, Popup, LngLatBounds, GeoJSONSource, Source, StyleSpecification } from 'maplibre-gl';
import {
  MapPort,
  MapCoordinate,
  MapViewportOptions,
  MapFitOptions,
  MapRouteStyle,
  MapMarkerOptions,
  MapPopupContent,
  MapMarkerPort,
  MapInitializeOptions
} from './map.port';

const MAP_NOT_INITIALIZED = 'MAP_NOT_INITIALIZED';

const SIVOY_MAPLIBRE_STYLE: StyleSpecification = {
  version: 8,
  name: 'SiVoy Indie Light',
  sources: {
    'sivoy-base': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors'
    }
  },
  layers: [
    {
      id: 'sivoy-canvas',
      type: 'background',
      paint: {
        'background-color': '#eef0ec'
      }
    },
    {
      id: 'sivoy-base',
      type: 'raster',
      source: 'sivoy-base',
      minzoom: 0,
      maxzoom: 19,
      paint: {
        'raster-saturation': -0.88,
        'raster-contrast': -0.12,
        'raster-brightness-min': 0.18,
        'raster-brightness-max': 0.98,
        'raster-opacity': 0.82
      }
    }
  ]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isGeoJSONSource(source: Source): source is GeoJSONSource {
  if (source.type !== 'geojson') return false;
  if (!isRecord(source)) return false;
  return typeof source['setData'] === 'function';
}

class MapLibreMarkerAdapter implements MapMarkerPort {
  constructor(private marker: Marker) {}

  setCoordinate(coord: MapCoordinate): void {
    this.marker.setLngLat([coord.lng, coord.lat]);
  }

  getCoordinate(): MapCoordinate {
    const lngLat = this.marker.getLngLat();
    return { lng: lngLat.lng, lat: lngLat.lat };
  }

  setPopupContent(content: MapPopupContent): void {
    const doc = this.marker.getElement().ownerDocument;
    const div = doc.createElement('div');
    const strong = doc.createElement('strong');
    strong.textContent = content.title;
    div.appendChild(strong);

    if (content.subtitle) {
      div.appendChild(doc.createElement('br'));
      div.appendChild(doc.createTextNode(content.subtitle));
    }

    const popup = new Popup({ offset: 16, closeButton: false }).setDOMContent(div);
    this.marker.setPopup(popup);
  }

  onDragEnd(handler: (coord: MapCoordinate) => void): () => void {
    const listener = () => {
      handler(this.getCoordinate());
    };
    this.marker.on('dragend', listener);
    return () => {
      this.marker.off('dragend', listener);
    };
  }

  remove(): void {
    this.marker.remove();
  }
}

export class MapLibreMapAdapter implements MapPort {
  private map: MLMap | null = null;
  private readonly routeSourceId = 'sivoy-route-source';
  private readonly routeLayerId = 'sivoy-route-layer';
  private pendingRouteRequest: { coordinates: MapCoordinate[], style?: MapRouteStyle } | null = null;
  private pendingRouteListener: (() => void) | null = null;

  initialize(container: HTMLElement, options: MapInitializeOptions): void {
    if (this.map) {
      return;
    }

    this.map = new MLMap({
      container,
      style: options.styleUrl ?? SIVOY_MAPLIBRE_STYLE,
      center: [options.center.lng, options.center.lat],
      zoom: options.zoom,
      minZoom: options.minZoom,
      maxZoom: options.maxZoom
    });
  }

  isInitialized(): boolean {
    return this.map !== null;
  }

  private getMapOrThrow(): MLMap {
    if (!this.map) {
      throw new Error(MAP_NOT_INITIALIZED);
    }
    return this.map;
  }

  getCenter(): MapCoordinate {
    const m = this.getMapOrThrow();
    const c = m.getCenter();
    return { lng: c.lng, lat: c.lat };
  }

  flyTo(center: MapCoordinate, options?: MapViewportOptions): void {
    this.getMapOrThrow().flyTo({
      center: [center.lng, center.lat],
      zoom: options?.zoom,
      duration: options?.duration
    });
  }

  jumpTo(center: MapCoordinate, options?: MapViewportOptions): void {
    this.getMapOrThrow().jumpTo({
      center: [center.lng, center.lat],
      zoom: options?.zoom
    });
  }

  fitCoordinates(coordinates: readonly MapCoordinate[], options?: MapFitOptions): void {
    if (coordinates.length === 0) return;

    const m = this.getMapOrThrow();
    const bounds = new LngLatBounds(
      [coordinates[0].lng, coordinates[0].lat],
      [coordinates[0].lng, coordinates[0].lat]
    );
    for (let i = 1; i < coordinates.length; i++) {
      bounds.extend([coordinates[i].lng, coordinates[i].lat]);
    }

    m.fitBounds(bounds, {
      padding: options?.padding,
      maxZoom: options?.maxZoom,
      duration: options?.duration
    });
  }

  resize(): void {
    this.getMapOrThrow().resize();
  }

  onClick(handler: (coord: MapCoordinate) => void): () => void {
    const m = this.getMapOrThrow();
    const listener = (e: { lngLat: { lng: number, lat: number } }) => {
      handler({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    };
    m.on('click', listener);
    return () => m.off('click', listener);
  }

  onDragStart(handler: () => void): () => void {
    const m = this.getMapOrThrow();
    m.on('dragstart', handler);
    return () => m.off('dragstart', handler);
  }

  onMoveStart(handler: () => void): () => void {
    const m = this.getMapOrThrow();
    m.on('movestart', handler);
    return () => m.off('movestart', handler);
  }

  onMoveEnd(handler: () => void): () => void {
    const m = this.getMapOrThrow();
    m.on('moveend', handler);
    return () => m.off('moveend', handler);
  }

  onMove(handler: (center: MapCoordinate) => void): () => void {
    const m = this.getMapOrThrow();
    const listener = () => {
      const c = m.getCenter();
      handler({ lng: c.lng, lat: c.lat });
    };
    m.on('move', listener);
    return () => m.off('move', listener);
  }

  onLoad(handler: () => void): () => void {
    const m = this.getMapOrThrow();
    m.once('load', handler);
    return () => m.off('load', handler);
  }

  onError(handler: (message: string) => void): () => void {
    const m = this.getMapOrThrow();
    const listener = (event: { error?: { message?: string } }) => {
      handler(event.error?.message ?? 'unknown map error');
    };
    m.on('error', listener);
    return () => m.off('error', listener);
  }

  createMarker(coord: MapCoordinate, options?: MapMarkerOptions): MapMarkerPort {
    const m = this.getMapOrThrow();
    const marker = new Marker({
      element: options?.element,
      draggable: options?.draggable,
      anchor: options?.anchor
    });

    marker.setLngLat([coord.lng, coord.lat]).addTo(m);
    return new MapLibreMarkerAdapter(marker);
  }

  drawRouteLine(coordinates: readonly MapCoordinate[], style?: MapRouteStyle): void {
    if (coordinates.length < 2) {
      this.removeRouteLine();
      return;
    }

    const m = this.getMapOrThrow();

    if (m.isStyleLoaded()) {
      this.cancelPendingRouteRequest();
      this.renderRouteLine(coordinates, style);
      return;
    }

    // Save immutable copy of the request
    this.pendingRouteRequest = {
      coordinates: coordinates.map(c => ({ ...c })),
      style: style ? { ...style } : undefined
    };

    if (!this.pendingRouteListener) {
      this.pendingRouteListener = () => {
        const req = this.pendingRouteRequest;
        this.cancelPendingRouteRequest();
        if (req) {
          this.renderRouteLine(req.coordinates, req.style);
        }
      };
      m.once('load', this.pendingRouteListener);
    }
  }

  private renderRouteLine(coordinates: readonly MapCoordinate[], style?: MapRouteStyle): void {
    const m = this.getMapOrThrow();

    const geoJsonData = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: coordinates.map(c => [c.lng, c.lat])
        }
      }]
    };

    let source = m.getSource(this.routeSourceId);

    if (source && !isGeoJSONSource(source)) {
      if (m.getLayer(this.routeLayerId)) {
        m.removeLayer(this.routeLayerId);
      }
      m.removeSource(this.routeSourceId);
      source = undefined;
    }

    if (source && isGeoJSONSource(source)) {
      source.setData(geoJsonData);
    } else {
      m.addSource(this.routeSourceId, {
        type: 'geojson',
        data: geoJsonData
      });
    }

    if (m.getLayer(this.routeLayerId)) {
      m.setPaintProperty(this.routeLayerId, 'line-color', style?.color ?? '#3b82f6');
      m.setPaintProperty(this.routeLayerId, 'line-width', style?.width ?? 4);
      m.setPaintProperty(this.routeLayerId, 'line-opacity', style?.opacity ?? 1);
    } else {
      m.addLayer({
        id: this.routeLayerId,
        type: 'line',
        source: this.routeSourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': style?.color ?? '#3b82f6',
          'line-width': style?.width ?? 4,
          'line-opacity': style?.opacity ?? 1
        }
      });
    }
  }

  private cancelPendingRouteRequest(): void {
    if (this.pendingRouteListener && this.map) {
      this.map.off('load', this.pendingRouteListener);
    }
    this.pendingRouteListener = null;
    this.pendingRouteRequest = null;
  }

  removeRouteLine(): void {
    this.cancelPendingRouteRequest();
    if (!this.map) return;
    if (this.map.getLayer(this.routeLayerId)) {
      this.map.removeLayer(this.routeLayerId);
    }
    if (this.map.getSource(this.routeSourceId)) {
      this.map.removeSource(this.routeSourceId);
    }
  }

  destroy(): void {
    this.cancelPendingRouteRequest();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
