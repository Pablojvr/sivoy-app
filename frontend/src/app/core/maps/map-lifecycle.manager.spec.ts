import { describe, expect, it, vi } from 'vitest';
import {
  MAP_LIFECYCLE_DESTROYED,
  MapLifecycleManager
} from './map-lifecycle.manager';
import {
  MapCoordinate,
  MapFitOptions,
  MapInitializeOptions,
  MapMarkerOptions,
  MapMarkerPort,
  MapPopupContent,
  MapPort,
  MapRouteStyle,
  MapViewportOptions
} from './map.port';

class FakeMarker implements MapMarkerPort {
  readonly element = document.createElement('button');
  readonly calls: string[];
  coordinate: MapCoordinate;
  dragHandler: ((coordinate: MapCoordinate) => void) | null = null;
  throwOnDragRegistration = false;
  throwOnElementAccess = false;
  throwOnRemove = false;

  constructor(coordinate: MapCoordinate, calls: string[]) {
    this.coordinate = { ...coordinate };
    this.calls = calls;
  }

  setCoordinate(coordinate: MapCoordinate): void {
    this.coordinate = { ...coordinate };
  }

  getCoordinate(): MapCoordinate {
    return { ...this.coordinate };
  }

  setPopupContent(_content: MapPopupContent): void {}

  onDragEnd(handler: (coordinate: MapCoordinate) => void): () => void {
    if (this.throwOnDragRegistration) throw new Error('drag registration failed');
    this.dragHandler = handler;
    return () => {
      this.calls.push('drag-dispose');
      this.dragHandler = null;
    };
  }

  getElement(): HTMLElement {
    if (this.throwOnElementAccess) throw new Error('element access failed');
    return this.element;
  }

  remove(): void {
    this.calls.push('marker-remove');
    if (this.throwOnRemove) throw new Error('marker removal failed');
  }
}

class FakeMap implements MapPort {
  readonly calls: string[] = [];
  readonly markers: FakeMarker[] = [];
  throwOnCreate = false;
  destroyCount = 0;

  initialize(_container: HTMLElement, _options: MapInitializeOptions): void {}
  isInitialized(): boolean { return true; }
  getCenter(): MapCoordinate { return { lng: 0, lat: 0 }; }
  flyTo(_center: MapCoordinate, _options?: MapViewportOptions): void {}
  jumpTo(_center: MapCoordinate, _options?: MapViewportOptions): void {}
  fitCoordinates(_coordinates: readonly MapCoordinate[], _options?: MapFitOptions): void {}
  resize(): void {}
  onClick(_handler: (coordinate: MapCoordinate) => void): () => void { return () => {}; }
  onDragStart(_handler: () => void): () => void { return () => {}; }
  onMoveStart(_handler: () => void): () => void { return () => {}; }
  onMoveEnd(_handler: () => void): () => void { return () => {}; }
  onMove(_handler: (center: MapCoordinate) => void): () => void { return () => {}; }
  onLoad(_handler: () => void): () => void { return () => {}; }
  onError(_handler: (message: string) => void): () => void { return () => {}; }

  createMarker(coordinate: MapCoordinate, _options?: MapMarkerOptions): MapMarkerPort {
    if (this.throwOnCreate) throw new Error('marker creation failed');
    const marker = new FakeMarker(coordinate, this.calls);
    this.markers.push(marker);
    this.calls.push('marker-create');
    return marker;
  }

  drawRouteLine(_coordinates: readonly MapCoordinate[], _style?: MapRouteStyle): void {}
  removeRouteLine(): void {}
  destroy(): void {
    this.destroyCount += 1;
    this.calls.push('map-destroy');
  }
}

describe('MapLifecycleManager', () => {
  const coordinate = { lng: -89.2, lat: 13.7 };

  it('owns primary markers and returns an immutable detached snapshot', () => {
    const map = new FakeMap();
    const manager = new MapLifecycleManager<{ id: string }>(map);
    const click = vi.fn();
    const marker = manager.addPrimaryMarker({ coordinate, metadata: { id: 'one' }, onClick: click });

    marker.getElement().dispatchEvent(new MouseEvent('click'));
    expect(click).toHaveBeenCalledTimes(1);

    const first = manager.getPrimaryEntries();
    const second = manager.getPrimaryEntries();
    expect(first).toEqual([{ marker, metadata: { id: 'one' } }]);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);

    manager.clearPrimaryMarkers();
    expect(manager.getPrimaryEntries()).toEqual([]);
    marker.getElement().dispatchEvent(new MouseEvent('click'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(map.calls).toEqual(['marker-create', 'marker-remove']);
  });

  it('replaces an auxiliary marker after disposing DOM and drag listeners', () => {
    const map = new FakeMap();
    const manager = new MapLifecycleManager<never>(map);
    const first = manager.setAuxiliaryMarker('preview', {
      coordinate,
      onClick: vi.fn(),
      onDragEnd: vi.fn()
    }) as FakeMarker;
    const originalRemove = first.element.removeEventListener.bind(first.element);
    vi.spyOn(first.element, 'removeEventListener').mockImplementation((...args) => {
      map.calls.push('click-dispose');
      originalRemove(...args);
    });

    const replacement = manager.setAuxiliaryMarker('preview', {
      coordinate: { lng: -88, lat: 14 }
    });

    expect(manager.getAuxiliaryMarker('preview')).toBe(replacement);
    expect(map.calls).toEqual([
      'marker-create',
      'click-dispose',
      'drag-dispose',
      'marker-remove',
      'marker-create'
    ]);
  });

  it('gets, updates and removes auxiliary markers idempotently', () => {
    const map = new FakeMap();
    const manager = new MapLifecycleManager<never>(map);
    const marker = manager.setAuxiliaryMarker('user', { coordinate });

    manager.updateAuxiliaryMarker('user', { lng: 1, lat: 2 });
    expect(marker.getCoordinate()).toEqual({ lng: 1, lat: 2 });
    manager.updateAuxiliaryMarker('missing', coordinate);
    manager.removeAuxiliaryMarker('user');
    manager.removeAuxiliaryMarker('user');

    expect(manager.getAuxiliaryMarker('user')).toBeNull();
    expect(map.calls.filter(call => call === 'marker-remove')).toHaveLength(1);
  });

  it('replaces and clears scoped disposers in order', () => {
    const manager = new MapLifecycleManager<never>(new FakeMap());
    const calls: string[] = [];

    manager.replaceScopedDisposer('picker', () => calls.push('first'));
    manager.replaceScopedDisposer('picker', () => calls.push('second'));
    expect(calls).toEqual(['first']);
    manager.clearScopedDisposer('picker');
    manager.clearScopedDisposer('picker');
    expect(calls).toEqual(['first', 'second']);
  });

  it('tracks map events and destroys every owned resource exactly once', () => {
    const map = new FakeMap();
    const manager = new MapLifecycleManager<string>(map);
    manager.addPrimaryMarker({ coordinate, metadata: 'primary' });
    manager.setAuxiliaryMarker('user', { coordinate });
    manager.trackMapEvent(() => map.calls.push('map-event-dispose'));
    manager.replaceScopedDisposer('picker', () => map.calls.push('scoped-dispose'));

    manager.destroy();
    manager.destroy();

    expect(map.calls).toEqual([
      'marker-create',
      'marker-create',
      'marker-remove',
      'marker-remove',
      'map-event-dispose',
      'scoped-dispose',
      'map-destroy'
    ]);
    expect(map.destroyCount).toBe(1);
    expect(manager.getPrimaryEntries()).toEqual([]);
    expect(manager.getAuxiliaryMarker('user')).toBeNull();
  });

  it('continues teardown when disposers and marker removal throw', () => {
    const map = new FakeMap();
    const manager = new MapLifecycleManager<string>(map);
    const marker = manager.addPrimaryMarker({ coordinate, metadata: 'primary' }) as FakeMarker;
    marker.throwOnRemove = true;
    manager.trackMapEvent(() => { throw new Error('event cleanup failed'); });
    manager.trackMapEvent(() => map.calls.push('later-event-dispose'));
    manager.replaceScopedDisposer('picker', () => { throw new Error('scope cleanup failed'); });
    manager.replaceScopedDisposer('other', () => map.calls.push('later-scope-dispose'));

    expect(() => manager.destroy()).not.toThrow();
    expect(map.calls).toContain('later-event-dispose');
    expect(map.calls).toContain('later-scope-dispose');
    expect(map.calls.at(-1)).toBe('map-destroy');
    expect(map.destroyCount).toBe(1);
  });

  it('enforces its post-destroy contract', () => {
    const map = new FakeMap();
    const manager = new MapLifecycleManager<string>(map);
    manager.destroy();

    const lateMapCleanup = vi.fn();
    const lateScopeCleanup = vi.fn();
    const mutations = [
      () => manager.addPrimaryMarker({ coordinate, metadata: 'x' }),
      () => manager.setAuxiliaryMarker('x', { coordinate }),
      () => manager.updateAuxiliaryMarker('x', coordinate),
      () => manager.trackMapEvent(lateMapCleanup),
      () => manager.replaceScopedDisposer('x', lateScopeCleanup)
    ];
    mutations.forEach(mutation => expect(mutation).toThrowError(MAP_LIFECYCLE_DESTROYED));

    expect(manager.getPrimaryEntries()).toEqual([]);
    expect(manager.getAuxiliaryMarker('x')).toBeNull();
    expect(() => manager.clearPrimaryMarkers()).not.toThrow();
    expect(() => manager.removeAuxiliaryMarker('x')).not.toThrow();
    expect(() => manager.clearScopedDisposer('x')).not.toThrow();
    expect(() => manager.destroy()).not.toThrow();
    expect(map.destroyCount).toBe(1);
    expect(lateMapCleanup).toHaveBeenCalledTimes(1);
    expect(lateScopeCleanup).toHaveBeenCalledTimes(1);
  });

  it('does not retain partial state when map marker creation fails', () => {
    const map = new FakeMap();
    const manager = new MapLifecycleManager<string>(map);
    map.throwOnCreate = true;

    expect(() => manager.addPrimaryMarker({ coordinate, metadata: 'x' })).toThrowError('marker creation failed');
    expect(() => manager.setAuxiliaryMarker('x', { coordinate })).toThrowError('marker creation failed');
    expect(manager.getPrimaryEntries()).toEqual([]);
    expect(manager.getAuxiliaryMarker('x')).toBeNull();
  });

  it('cleans a marker if drag registration fails after creation', () => {
    const map = new FakeMap();
    const manager = new MapLifecycleManager<never>(map);
    const originalCreate = map.createMarker.bind(map);
    vi.spyOn(map, 'createMarker').mockImplementation((coord, options) => {
      const marker = originalCreate(coord, options) as FakeMarker;
      marker.throwOnDragRegistration = true;
      return marker;
    });

    expect(() => manager.setAuxiliaryMarker('preview', {
      coordinate,
      onClick: vi.fn(),
      onDragEnd: vi.fn()
    })).toThrowError('drag registration failed');

    expect(manager.getAuxiliaryMarker('preview')).toBeNull();
    expect(map.calls).toEqual(['marker-create', 'marker-remove']);
  });

  it('cleans a primary marker if DOM listener registration cannot start', () => {
    const map = new FakeMap();
    const manager = new MapLifecycleManager<string>(map);
    const originalCreate = map.createMarker.bind(map);
    vi.spyOn(map, 'createMarker').mockImplementation((coord, options) => {
      const marker = originalCreate(coord, options) as FakeMarker;
      marker.throwOnElementAccess = true;
      return marker;
    });

    expect(() => manager.addPrimaryMarker({
      coordinate,
      metadata: 'x',
      onClick: vi.fn()
    })).toThrowError('element access failed');

    expect(manager.getPrimaryEntries()).toEqual([]);
    expect(map.calls).toEqual(['marker-create', 'marker-remove']);
  });
});
