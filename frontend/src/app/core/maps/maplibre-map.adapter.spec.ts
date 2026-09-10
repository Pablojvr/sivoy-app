import { vi } from 'vitest';
import { MapLibreMapAdapter } from './maplibre-map.adapter';
import { MapCoordinate } from './map.port';

const mockLngLat = { lng: -10, lat: 20 };
const mockOn = vi.fn();
const mockOnce = vi.fn();
const mockOff = vi.fn();
const mockGetCenter = vi.fn().mockReturnValue(mockLngLat);
const mockFlyTo = vi.fn();
const mockJumpTo = vi.fn();
const mockFitBounds = vi.fn();
const mockResize = vi.fn();
const mockRemove = vi.fn();
const mockGetSource = vi.fn();
const mockAddSource = vi.fn();
const mockGetLayer = vi.fn();
const mockAddLayer = vi.fn();
const mockRemoveLayer = vi.fn();
const mockRemoveSource = vi.fn();
const mockSetPaintProperty = vi.fn();
const mockIsStyleLoaded = vi.fn().mockReturnValue(true);

const mockMarkerSetLngLat = vi.fn().mockReturnThis();
const mockMarkerAddTo = vi.fn().mockReturnThis();
const mockMarkerGetLngLat = vi.fn().mockReturnValue(mockLngLat);
const mockMarkerSetPopup = vi.fn().mockReturnThis();
const mockMarkerGetElement = vi.fn().mockReturnValue({ ownerDocument: document });
const mockMarkerOn = vi.fn();
const mockMarkerOff = vi.fn();
const mockMarkerRemove = vi.fn();

const mockPopupSetDOMContent = vi.fn().mockReturnThis();

const mockMapConstructor = vi.fn();
const mockExtend = vi.fn();

vi.mock('maplibre-gl', () => {
  return {
    Map: vi.fn(function(options) {
      mockMapConstructor(options);
      return {
        on: mockOn,
        once: mockOnce,
        off: mockOff,
        getCenter: mockGetCenter,
        flyTo: mockFlyTo,
        jumpTo: mockJumpTo,
        fitBounds: mockFitBounds,
        resize: mockResize,
        remove: mockRemove,
        getSource: mockGetSource,
        addSource: mockAddSource,
        getLayer: mockGetLayer,
        addLayer: mockAddLayer,
        removeLayer: mockRemoveLayer,
        removeSource: mockRemoveSource,
        setPaintProperty: mockSetPaintProperty,
        isStyleLoaded: mockIsStyleLoaded
      };
    }),
    Marker: vi.fn(function() {
      return {
        setLngLat: mockMarkerSetLngLat,
        addTo: mockMarkerAddTo,
        getLngLat: mockMarkerGetLngLat,
        setPopup: mockMarkerSetPopup,
        getElement: mockMarkerGetElement,
        on: mockMarkerOn,
        off: mockMarkerOff,
        remove: mockMarkerRemove
      };
    }),
    Popup: vi.fn(function() {
      return {
        setDOMContent: mockPopupSetDOMContent
      };
    }),
    LngLatBounds: vi.fn(function(sw, ne) {
      return {
        _sw: sw,
        _ne: ne,
        extend: mockExtend
      };
    })
  };
});

describe('MapLibreMapAdapter', () => {
  let adapter: MapLibreMapAdapter;
  let container: HTMLElement;
  const initialCenter: MapCoordinate = { lng: -74, lat: 40 };

  beforeEach(() => {
      mockIsStyleLoaded.mockReturnValue(true);
    vi.clearAllMocks();
    container = document.createElement('div');
    adapter = new MapLibreMapAdapter();
  });

  describe('before initialization', () => {
    it.each([
      ['getCenter', () => adapter.getCenter()],
      ['flyTo', () => adapter.flyTo(initialCenter)],
      ['jumpTo', () => adapter.jumpTo(initialCenter)],
      ['fitCoordinates', () => adapter.fitCoordinates([initialCenter])],
      ['resize', () => adapter.resize()],
      ['onClick', () => adapter.onClick(vi.fn())],
      ['onDragStart', () => adapter.onDragStart(vi.fn())],
      ['onMoveStart', () => adapter.onMoveStart(vi.fn())],
      ['onMoveEnd', () => adapter.onMoveEnd(vi.fn())],
      ['onMove', () => adapter.onMove(vi.fn())],
      ['onLoad', () => adapter.onLoad(vi.fn())],
      ['onError', () => adapter.onError(vi.fn())],
      ['createMarker', () => adapter.createMarker(initialCenter)],
      ['drawRouteLine', () => adapter.drawRouteLine([initialCenter, initialCenter])]
    ])('throws MAP_NOT_INITIALIZED for %s', (_, methodFn) => {
      expect(methodFn).toThrowError('MAP_NOT_INITIALIZED');
    });

    it('safely performs no-op for removeRouteLine and destroy if not initialized', () => {
      expect(() => adapter.removeRouteLine()).not.toThrow();
      expect(() => adapter.destroy()).not.toThrow();
    });
  });

  it('initializes cleanly, is idempotent and creates default SiVoy style if none provided', () => {
    expect(adapter.isInitialized()).toBe(false);

    adapter.initialize(container, { center: initialCenter, zoom: 10 });
    expect(adapter.isInitialized()).toBe(true);

    expect(mockMapConstructor).toHaveBeenCalledTimes(1);
    const options = mockMapConstructor.mock.calls[0][0];
    const style = options.style;

    expect(style.name).toBe('SiVoy Indie Light');
    expect(style.sources['sivoy-base'].type).toBe('raster');

    expect(style.layers.length).toBe(2);
    expect(style.layers[0].id).toBe('sivoy-canvas');
    expect(style.layers[0].paint['background-color']).toBe('#eef0ec');

    expect(style.layers[1].id).toBe('sivoy-base');
    expect(style.layers[1].paint).toEqual({
      'raster-saturation': -0.88,
      'raster-contrast': -0.12,
      'raster-brightness-min': 0.18,
      'raster-brightness-max': 0.98,
      'raster-opacity': 0.82
    });

    adapter.initialize(container, { center: initialCenter, zoom: 10 });
    expect(mockMapConstructor).toHaveBeenCalledTimes(1);
  });

  describe('when initialized', () => {
    beforeEach(() => {
      adapter.initialize(container, { center: initialCenter, zoom: 10, styleUrl: 'custom-style' });
    });

    it('uses styleUrl override when provided', () => {
      const options = mockMapConstructor.mock.calls[0][0];
      expect(options.style).toBe('custom-style');
    });

    it('translates onClick event and provides cleanup', () => {
      const handler = vi.fn();
      const dispose = adapter.onClick(handler);
      expect(mockOn).toHaveBeenCalledWith('click', expect.any(Function));
      const registeredHandler = mockOn.mock.calls.find(call => call[0] === 'click')?.[1];

      if (registeredHandler) {
         registeredHandler({ lngLat: { lng: 1, lat: 2 } });
         expect(handler).toHaveBeenCalledWith({ lng: 1, lat: 2 });
      }
      dispose();
      expect(mockOff).toHaveBeenCalledWith('click', registeredHandler);
    });

    it('translates onDragStart event and provides cleanup', () => {
      const handler = vi.fn();
      const dispose = adapter.onDragStart(handler);
      expect(mockOn).toHaveBeenCalledWith('dragstart', expect.any(Function));
      const registeredHandler = mockOn.mock.calls.find(call => call[0] === 'dragstart')?.[1];

      if (registeredHandler) {
         registeredHandler();
         expect(handler).toHaveBeenCalled();
      }
      dispose();
      expect(mockOff).toHaveBeenCalledWith('dragstart', registeredHandler);
    });

    it('translates onMoveStart event and provides cleanup', () => {
      const handler = vi.fn();
      const dispose = adapter.onMoveStart(handler);
      expect(mockOn).toHaveBeenCalledWith('movestart', expect.any(Function));
      const registeredHandler = mockOn.mock.calls.find(call => call[0] === 'movestart')?.[1];

      if (registeredHandler) {
         registeredHandler();
         expect(handler).toHaveBeenCalled();
      }
      dispose();
      expect(mockOff).toHaveBeenCalledWith('movestart', registeredHandler);
    });

    it('translates onMoveEnd event and provides cleanup', () => {
      const handler = vi.fn();
      const dispose = adapter.onMoveEnd(handler);
      expect(mockOn).toHaveBeenCalledWith('moveend', expect.any(Function));
      const registeredHandler = mockOn.mock.calls.find(call => call[0] === 'moveend')?.[1];

      if (registeredHandler) {
         registeredHandler();
         expect(handler).toHaveBeenCalled();
      }
      dispose();
      expect(mockOff).toHaveBeenCalledWith('moveend', registeredHandler);
    });

    it('translates onMove event and provides cleanup', () => {
      const handler = vi.fn();
      const dispose = adapter.onMove(handler);
      expect(mockOn).toHaveBeenCalledWith('move', expect.any(Function));
      const registeredHandler = mockOn.mock.calls.find(call => call[0] === 'move')?.[1];

      if (registeredHandler) {
         registeredHandler();
         expect(handler).toHaveBeenCalledWith(mockLngLat);
      }
      dispose();
      expect(mockOff).toHaveBeenCalledWith('move', registeredHandler);
    });

    it('translates onLoad event using once and provides cleanup', () => {
      const handler = vi.fn();
      const dispose = adapter.onLoad(handler);

      expect(mockOnce).toHaveBeenCalledWith('load', expect.any(Function));
      const registeredHandler = mockOnce.mock.calls.find(call => call[0] === 'load')?.[1];

      if (registeredHandler) {
         registeredHandler();
         expect(handler).toHaveBeenCalled();
      }

      dispose();
      expect(mockOff).toHaveBeenCalledWith('load', registeredHandler);
    });

    it('translates error events safely using nullish coalescing and cleans up', () => {
      const handler = vi.fn();
      const dispose = adapter.onError(handler);
      const registeredHandler = mockOn.mock.calls.find(call => call[0] === 'error')?.[1];

      if (registeredHandler) {
        registeredHandler({ error: { message: 'Network failed' } });
        expect(handler).toHaveBeenCalledWith('Network failed');

        registeredHandler({});
        expect(handler).toHaveBeenCalledWith('unknown map error');
      }

      dispose();
      expect(mockOff).toHaveBeenCalledWith('error', registeredHandler);
    });

    it('handles markers, mapping coordinates correctly and cleaning up dragend', () => {
      const marker = adapter.createMarker(initialCenter, { anchor: 'bottom' });
      expect(mockMarkerSetLngLat).toHaveBeenCalledWith([initialCenter.lng, initialCenter.lat]);
      expect(mockMarkerAddTo).toHaveBeenCalled();

      expect(marker.getCoordinate()).toEqual(mockLngLat);
      marker.setCoordinate({ lng: 1, lat: 2 });
      expect(mockMarkerSetLngLat).toHaveBeenCalledWith([1, 2]);

      const dragHandler = vi.fn();
      const disposeDrag = marker.onDragEnd(dragHandler);
      const registeredDragHandler = mockMarkerOn.mock.calls[0][1];

      registeredDragHandler();
      expect(dragHandler).toHaveBeenCalledWith(mockLngLat);

      disposeDrag();
      expect(mockMarkerOff).toHaveBeenCalledWith('dragend', registeredDragHandler);

      marker.remove();
      expect(mockMarkerRemove).toHaveBeenCalled();
    });

    it('sets popup safely avoiding XSS', () => {
      const marker = adapter.createMarker(initialCenter);
      marker.setPopupContent({
        title: '<img src=x onerror=alert(1)>Title',
        subtitle: '<b>Sub</b>'
      });

      expect(mockPopupSetDOMContent).toHaveBeenCalled();
      const callArgs = mockPopupSetDOMContent.mock.calls[0];
      if (callArgs && callArgs[0] instanceof HTMLElement) {
        const div = callArgs[0];
        expect(div.innerHTML).not.toContain('<img');
        expect(div.innerHTML).not.toContain('<b>');
        expect(div.querySelector('strong')?.textContent).toBe('<img src=x onerror=alert(1)>Title');
        expect(div.textContent).toContain('<b>Sub</b>');
      } else {
        throw new Error('Expected HTMLElement');
      }
    });


    describe('drawRouteLine async styling', () => {
      beforeEach(() => {
        mockIsStyleLoaded.mockReturnValue(true);
      });

      it('inmediato si loaded', () => {
        mockIsStyleLoaded.mockReturnValue(true);
        adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }]);
        expect(mockOnce).not.toHaveBeenCalledWith('load', expect.any(Function));
        expect(mockAddSource).toHaveBeenCalled();
      });

      it('deferred antes de load', () => {
        mockIsStyleLoaded.mockReturnValue(false);
        adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }]);

        expect(mockAddSource).not.toHaveBeenCalled();
        expect(mockOnce).toHaveBeenCalledWith('load', expect.any(Function));

        const loadCall = mockOnce.mock.calls.find(c => c[0] === 'load');
        const loadListener = loadCall ? loadCall[1] : undefined;
        if (loadListener) loadListener();

        expect(mockAddSource).toHaveBeenCalled();
      });

      it('múltiples deferred => un listener y última solicitud', () => {
        mockIsStyleLoaded.mockReturnValue(false);

        adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }], { color: 'red', width: 2, opacity: 1 });
        adapter.drawRouteLine([{ lng: 3, lat: 3 }, { lng: 4, lat: 4 }], { color: 'blue', width: 5, opacity: 1 });

        const loadCalls = mockOnce.mock.calls.filter(c => c[0] === 'load');
        expect(loadCalls.length).toBe(1);

        const loadCall = mockOnce.mock.calls.find(c => c[0] === 'load');
        const loadListener = loadCall ? loadCall[1] : undefined;
        if (loadListener) loadListener();

        expect(mockAddSource).toHaveBeenCalledWith(
          'sivoy-route-source',
          expect.objectContaining({
            data: expect.objectContaining({
              features: [expect.objectContaining({
                geometry: expect.objectContaining({
                  coordinates: [[3, 3], [4, 4]]
                })
              })]
            })
          })
        );
        expect(mockAddLayer).toHaveBeenCalledWith(expect.objectContaining({
          paint: expect.objectContaining({
            'line-color': 'blue'
          })
        }));
      });

      it('remove antes de load impide render', () => {
        mockIsStyleLoaded.mockReturnValue(false);
        adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }]);

        const loadCall = mockOnce.mock.calls.find(c => c[0] === 'load');
        const loadListener = loadCall ? loadCall[1] : undefined;

        adapter.removeRouteLine();
        expect(mockOff).toHaveBeenCalledWith('load', loadListener);

        if (loadListener) loadListener();
        expect(mockAddSource).not.toHaveBeenCalled();
      });

      it('destroy antes de load cancela/limpia', () => {
        mockIsStyleLoaded.mockReturnValue(false);
        adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }]);

        const loadCall = mockOnce.mock.calls.find(c => c[0] === 'load');
        const loadListener = loadCall ? loadCall[1] : undefined;

        adapter.destroy();
        expect(mockOff).toHaveBeenCalledWith('load', loadListener);

        if (loadListener) loadListener();
        expect(mockAddSource).not.toHaveBeenCalled();
      });

      it('coordenadas/style caller mutadas después no alteran pending', () => {
        mockIsStyleLoaded.mockReturnValue(false);
        const coords = [{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }];
        const style = { color: 'red', width: 2, opacity: 1 };

        adapter.drawRouteLine(coords, style);

        coords[0].lng = 999;
        coords.push({ lng: 3, lat: 3 });
        style.color = 'blue';

        const loadCall = mockOnce.mock.calls.find(c => c[0] === 'load');
        const loadListener = loadCall ? loadCall[1] : undefined;
        if (loadListener) loadListener();

        expect(mockAddSource).toHaveBeenCalledWith(
          'sivoy-route-source',
          expect.objectContaining({
            data: expect.objectContaining({
              features: [expect.objectContaining({
                geometry: expect.objectContaining({
                  coordinates: [[1, 1], [2, 2]] // NOT 999
                })
              })]
            })
          })
        );
        expect(mockAddLayer).toHaveBeenCalledWith(expect.objectContaining({
          paint: expect.objectContaining({
            'line-color': 'red' // NOT blue
          })
        }));
      });
    });

    it('removes route safely if drawRouteLine called with < 2 coordinates', () => {
      mockGetLayer.mockReturnValue(true);
      mockGetSource.mockReturnValue(true);

      adapter.drawRouteLine([{ lng: 1, lat: 1 }]);
      expect(mockRemoveLayer).toHaveBeenCalledWith('sivoy-route-layer');
      expect(mockAddLayer).not.toHaveBeenCalled();
    });

    it('drawRouteLine updates layer style dynamically if layer already exists', () => {
      const mockSetData = vi.fn();
      mockGetSource.mockReturnValue({ type: 'geojson', setData: mockSetData });
      mockGetLayer.mockReturnValue(true);

      adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }], { color: '#ff0000', width: 2, opacity: 0.5 });

      expect(mockSetPaintProperty).toHaveBeenCalledWith('sivoy-route-layer', 'line-color', '#ff0000');
      expect(mockSetPaintProperty).toHaveBeenCalledWith('sivoy-route-layer', 'line-width', 2);
      expect(mockSetPaintProperty).toHaveBeenCalledWith('sivoy-route-layer', 'line-opacity', 0.5);
    });

    it('drawRouteLine handles non-geojson source collision by removing and recreating', () => {
      mockGetSource.mockReturnValue({ type: 'vector' });
      let layerExists = true;
      mockGetLayer.mockImplementation(() => layerExists ? {} : null);
      mockRemoveLayer.mockImplementation(() => { layerExists = false; });

      adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }]);

      expect(mockRemoveLayer).toHaveBeenCalledWith('sivoy-route-layer');
      expect(mockRemoveSource).toHaveBeenCalledWith('sivoy-route-source');
      expect(mockAddSource).toHaveBeenCalledWith('sivoy-route-source', expect.objectContaining({ type: 'geojson' }));
      expect(mockAddLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'sivoy-route-layer' }));
    });

    it('draws a route line, adding source/layer if missing with default style', () => {
      mockGetSource.mockReturnValue(null);
      mockGetLayer.mockReturnValue(null);

      adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }]);

      expect(mockAddSource).toHaveBeenCalledWith('sivoy-route-source', expect.objectContaining({ type: 'geojson' }));
      expect(mockAddLayer).toHaveBeenCalledWith(expect.objectContaining({
        type: 'line',
        paint: { 'line-color': '#3b82f6', 'line-width': 4, 'line-opacity': 1 }
      }));
    });

    it('draws a route line applying zero values correctly (nullish coalescing)', () => {
      mockGetSource.mockReturnValue(null);
      mockGetLayer.mockReturnValue(null);

      adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }], { width: 0, opacity: 0 });
      expect(mockAddLayer).toHaveBeenCalledWith(expect.objectContaining({
        paint: expect.objectContaining({ 'line-width': 0, 'line-opacity': 0 })
      }));
    });

    it('updates route source data if it already exists as geojson', () => {
      const mockSetData = vi.fn();
      mockGetSource.mockReturnValue({ type: 'geojson', setData: mockSetData });
      mockGetLayer.mockReturnValue(null); // Force layer creation to avoid setPaintProperty

      adapter.drawRouteLine([{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }]);

      expect(mockSetData).toHaveBeenCalled();
      expect(mockAddSource).not.toHaveBeenCalled();
    });

    it('destroys the map instance cleanly and is re-initializable', () => {
      adapter.destroy();
      expect(mockRemove).toHaveBeenCalled();
      expect(adapter.isInitialized()).toBe(false);

      adapter.destroy(); // Idempotent

      adapter.initialize(container, { center: initialCenter, zoom: 10 });
      expect(adapter.isInitialized()).toBe(true);
      expect(mockMapConstructor).toHaveBeenCalledTimes(2);
    });

    it('fitCoordinates safely ignores empty array', () => {
      adapter.fitCoordinates([]);
      expect(mockFitBounds).not.toHaveBeenCalled();
    });

    it('fitCoordinates constructs bounds with first coord, extends others and applies options', () => {
      const coords = [{ lng: 1, lat: 1 }, { lng: 2, lat: 2 }, { lng: 3, lat: 3 }];
      const opts = { padding: 10, maxZoom: 15, duration: 500 };

      adapter.fitCoordinates(coords, opts);

      expect(mockExtend).toHaveBeenCalledTimes(2);
      expect(mockExtend).toHaveBeenNthCalledWith(1, [2, 2]);
      expect(mockExtend).toHaveBeenNthCalledWith(2, [3, 3]);

      const fitBoundsCall = mockFitBounds.mock.calls[0];
      const boundsArg = fitBoundsCall[0];
      expect(boundsArg._sw).toEqual([1, 1]);

      expect(fitBoundsCall[1]).toEqual({
        padding: 10,
        maxZoom: 15,
        duration: 500
      });
    });

    it('flyTo executes with exact payload', () => {
      adapter.flyTo(initialCenter, { zoom: 12, duration: 1000 });
      expect(mockFlyTo).toHaveBeenCalledWith({
        center: [initialCenter.lng, initialCenter.lat],
        zoom: 12,
        duration: 1000
      });
    });

    it('jumpTo executes with exact payload', () => {
      adapter.jumpTo(initialCenter, { zoom: 11 });
      expect(mockJumpTo).toHaveBeenCalledWith({
        center: [initialCenter.lng, initialCenter.lat],
        zoom: 11
      });
    });

    it('resize executes correctly', () => {
      adapter.resize();
      expect(mockResize).toHaveBeenCalled();
    });
  });
});
