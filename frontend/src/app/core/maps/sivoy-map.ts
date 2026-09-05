import mapboxgl, { StyleSpecification } from 'mapbox-gl';
import maplibregl from 'maplibre-gl';

export type SiVoyCoordinate = [longitude: number, latitude: number];
export type SiVoyMap = any;
export type SiVoyMarker = any;
export type SiVoyLngLat = { lng: number; lat: number; distanceTo(other: SiVoyLngLat): number };

declare global {
  interface Window {
    __SIVOY_CONFIG__?: { mapboxPublicToken?: string };
  }
}

function getMapboxPublicToken(): string {
  return window.__SIVOY_CONFIG__?.mapboxPublicToken?.trim() || '';
}

const mapboxPublicToken = getMapboxPublicToken();
export const mapRuntime: any = mapboxPublicToken ? mapboxgl : maplibregl;

if (mapboxPublicToken) {
  mapboxgl.accessToken = mapboxPublicToken;
}

export const SIVOY_INDIE_STYLE: StyleSpecification = {
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
      paint: { 'background-color': '#eef0ec' }
    },
    {
      id: 'sivoy-base',
      type: 'raster',
      source: 'sivoy-base',
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

export function createSiVoyMap(container: HTMLElement, center: SiVoyCoordinate, zoom: number): SiVoyMap {
  const options: any = {
    container,
    style: mapboxPublicToken ? 'mapbox://styles/mapbox/standard' : SIVOY_INDIE_STYLE,
    center,
    zoom,
    minZoom: 7,
    maxZoom: 19,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    attributionControl: false,
    cooperativeGestures: false,
    ...(mapboxPublicToken ? {
      accessToken: mapboxPublicToken,
      config: {
        basemap: {
          theme: 'monochrome',
          lightPreset: 'day',
          showPointOfInterestLabels: false,
          showTransitLabels: false
        }
      }
    } : {})
  };
  const map = new mapRuntime.Map(options);

  map.on('load', () => container.setAttribute('data-map-state', 'loaded'));
  map.on('error', (event: any) => {
    const message = event.error?.message || 'unknown-map-error';
    container.setAttribute('data-map-error', message);
  });

  map.addControl(new mapRuntime.AttributionControl({ compact: true }), 'bottom-right');
  return map;
}

export function createBounds(coordinates: SiVoyCoordinate[]): any | null {
  if (coordinates.length === 0) return null;
  const bounds = new mapRuntime.LngLatBounds(coordinates[0], coordinates[0]);
  coordinates.slice(1).forEach(coordinate => bounds.extend(coordinate));
  return bounds;
}

export function asCoordinate(lat: number | string, lng: number | string): SiVoyCoordinate {
  return [Number(lng), Number(lat)];
}

export function createMarkerElement(
  type: 'origin' | 'destination' | 'nearby' | 'user' | 'preview',
  label = '',
  selected = false
): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `sivoy-map-marker is-${type}${selected ? ' is-selected' : ''}`;
  element.setAttribute('aria-label', label || 'Punto en el mapa');
  element.innerHTML = type === 'user'
    ? '<span class="sivoy-user-dot"><i></i></span>'
    : `<span class="sivoy-pin-core"><i>${type === 'origin' ? 'O' : type === 'nearby' ? '' : 'D'}</i></span>`;
  return element;
}
