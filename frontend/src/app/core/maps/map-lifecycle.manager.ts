import { MapCoordinate, MapMarkerOptions, MapMarkerPort, MapPort } from './map.port';

export const MAP_LIFECYCLE_DESTROYED = 'MAP_LIFECYCLE_DESTROYED';

export interface PrimaryMarkerSpec<TMetadata> {
  coordinate: MapCoordinate;
  options?: MapMarkerOptions;
  metadata: TMetadata;
  onClick?: (event: Event) => void;
}

export interface AuxiliaryMarkerSpec {
  coordinate: MapCoordinate;
  options?: MapMarkerOptions;
  onClick?: (event: Event) => void;
  onDragEnd?: (coordinate: MapCoordinate) => void;
}

export interface PrimaryMarkerEntry<TMetadata> {
  readonly marker: MapMarkerPort;
  readonly metadata: TMetadata;
}

interface OwnedMarker {
  marker: MapMarkerPort;
  disposers: Array<() => void>;
}

interface OwnedPrimaryMarker<TMetadata> extends OwnedMarker {
  metadata: TMetadata;
}

export class MapLifecycleManager<TMetadata> {
  private primaryMarkers: Array<OwnedPrimaryMarker<TMetadata>> = [];
  private readonly auxiliaryMarkers = new Map<string, OwnedMarker>();
  private readonly mapEventDisposers: Array<() => void> = [];
  private readonly scopedDisposers = new Map<string, () => void>();
  private destroyed = false;

  constructor(private readonly map: MapPort) {}

  addPrimaryMarker(spec: PrimaryMarkerSpec<TMetadata>): MapMarkerPort {
    this.assertActive();
    const owned = this.createOwnedMarker(spec.coordinate, spec.options, spec.onClick);
    this.primaryMarkers.push({ ...owned, metadata: spec.metadata });
    return owned.marker;
  }

  getPrimaryEntries(): readonly PrimaryMarkerEntry<TMetadata>[] {
    if (this.destroyed) return Object.freeze([]);
    return Object.freeze(this.primaryMarkers.map(({ marker, metadata }) =>
      Object.freeze({ marker, metadata })
    ));
  }

  clearPrimaryMarkers(): void {
    if (this.destroyed) return;
    const owned = this.primaryMarkers;
    this.primaryMarkers = [];
    this.cleanupMarkers(owned);
  }

  setAuxiliaryMarker(key: string, spec: AuxiliaryMarkerSpec): MapMarkerPort {
    this.assertActive();
    this.removeAuxiliaryMarker(key);

    const owned = this.createOwnedMarker(
      spec.coordinate,
      spec.options,
      spec.onClick,
      spec.onDragEnd
    );
    this.auxiliaryMarkers.set(key, owned);
    return owned.marker;
  }

  getAuxiliaryMarker(key: string): MapMarkerPort | null {
    if (this.destroyed) return null;
    return this.auxiliaryMarkers.get(key)?.marker ?? null;
  }

  updateAuxiliaryMarker(key: string, coordinate: MapCoordinate): void {
    this.assertActive();
    this.auxiliaryMarkers.get(key)?.marker.setCoordinate(coordinate);
  }

  removeAuxiliaryMarker(key: string): void {
    if (this.destroyed) return;
    const owned = this.auxiliaryMarkers.get(key);
    if (!owned) return;
    this.auxiliaryMarkers.delete(key);
    this.cleanupMarker(owned);
  }

  trackMapEvent(disposer: () => void): void {
    if (this.destroyed) {
      this.safeCleanup(disposer);
      throw new Error(MAP_LIFECYCLE_DESTROYED);
    }
    this.mapEventDisposers.push(disposer);
  }

  replaceScopedDisposer(key: string, disposer: (() => void) | null): void {
    if (this.destroyed) {
      if (disposer) this.safeCleanup(disposer);
      throw new Error(MAP_LIFECYCLE_DESTROYED);
    }
    this.clearScopedDisposer(key);
    if (disposer) this.scopedDisposers.set(key, disposer);
  }

  clearScopedDisposer(key: string): void {
    if (this.destroyed) return;
    const disposer = this.scopedDisposers.get(key);
    if (!disposer) return;
    this.scopedDisposers.delete(key);
    this.safeCleanup(disposer);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    const primary = this.primaryMarkers;
    this.primaryMarkers = [];
    this.cleanupMarkers(primary);

    const auxiliary = [...this.auxiliaryMarkers.values()];
    this.auxiliaryMarkers.clear();
    this.cleanupMarkers(auxiliary);

    const mapEvents = this.mapEventDisposers.splice(0);
    mapEvents.forEach(disposer => this.safeCleanup(disposer));

    const scoped = [...this.scopedDisposers.values()];
    this.scopedDisposers.clear();
    scoped.forEach(disposer => this.safeCleanup(disposer));

    this.safeCleanup(() => this.map.destroy());
  }

  private createOwnedMarker(
    coordinate: MapCoordinate,
    options?: MapMarkerOptions,
    onClick?: (event: Event) => void,
    onDragEnd?: (coordinate: MapCoordinate) => void
  ): OwnedMarker {
    const marker = this.map.createMarker(coordinate, options);
    const disposers: Array<() => void> = [];

    try {
      if (onClick) {
        const element = marker.getElement();
        element.addEventListener('click', onClick);
        disposers.push(() => element.removeEventListener('click', onClick));
      }
      if (onDragEnd) {
        disposers.push(marker.onDragEnd(onDragEnd));
      }
      return { marker, disposers };
    } catch (error: unknown) {
      disposers.forEach(disposer => this.safeCleanup(disposer));
      this.safeCleanup(() => marker.remove());
      throw error;
    }
  }

  private cleanupMarkers(markers: readonly OwnedMarker[]): void {
    markers.forEach(marker => this.cleanupMarker(marker));
  }

  private cleanupMarker(owned: OwnedMarker): void {
    owned.disposers.forEach(disposer => this.safeCleanup(disposer));
    this.safeCleanup(() => owned.marker.remove());
  }

  private safeCleanup(cleanup: () => void): void {
    try {
      cleanup();
    } catch {
      // Cleanup is best-effort so one faulty integration cannot leak the rest.
    }
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error(MAP_LIFECYCLE_DESTROYED);
  }
}
