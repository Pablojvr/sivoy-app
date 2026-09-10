export interface MapCoordinate {
  lng: number;
  lat: number;
}

export interface MapViewportOptions {
  zoom?: number;
  duration?: number;
}

export interface MapFitOptions {
  padding?: number;
  maxZoom?: number;
  duration?: number;
}

export interface MapRouteStyle {
  color?: string;
  width?: number;
  opacity?: number;
}

export interface MapMarkerOptions {
  draggable?: boolean;
  element?: HTMLElement;
  anchor?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface MapPopupContent {
  title: string;
  subtitle?: string;
}

export interface MapMarkerPort {
  setCoordinate(coord: MapCoordinate): void;
  getCoordinate(): MapCoordinate;
  setPopupContent(content: MapPopupContent): void;
  onDragEnd(handler: (coord: MapCoordinate) => void): () => void;
  remove(): void;
}

export interface MapInitializeOptions {
  center: MapCoordinate;
  zoom: number;
  styleUrl?: string;
  minZoom?: number;
  maxZoom?: number;
}

export interface MapPort {
  initialize(container: HTMLElement, options: MapInitializeOptions): void;
  isInitialized(): boolean;
  getCenter(): MapCoordinate;
  flyTo(center: MapCoordinate, options?: MapViewportOptions): void;
  jumpTo(center: MapCoordinate, options?: MapViewportOptions): void;
  fitCoordinates(coordinates: readonly MapCoordinate[], options?: MapFitOptions): void;
  resize(): void;

  onClick(handler: (coord: MapCoordinate) => void): () => void;
  onDragStart(handler: () => void): () => void;
  onMoveStart(handler: () => void): () => void;
  onMoveEnd(handler: () => void): () => void;
  onMove(handler: (center: MapCoordinate) => void): () => void;
  onLoad(handler: () => void): () => void;
  onError(handler: (message: string) => void): () => void;

  createMarker(coord: MapCoordinate, options?: MapMarkerOptions): MapMarkerPort;
  drawRouteLine(coordinates: readonly MapCoordinate[], style?: MapRouteStyle): void;
  removeRouteLine(): void;
  destroy(): void;
}
