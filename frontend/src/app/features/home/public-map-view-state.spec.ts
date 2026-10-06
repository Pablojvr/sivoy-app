import { projectPublicMapViewState, PublicMapProjectionInput } from './public-map-view-state';

describe('PublicMapViewState', () => {
  const baseInput: PublicMapProjectionInput = {
    locations: [],
    selectedPin: null,
    flightResults: [],
    displayedResults: [],
    origen: '',
    destino: '',
    origenMunicipio: '',
    destinoMunicipio: '',
    expandedResultCard: null,
    isOriginDiscoveryMode: false
  };

  const locA = { id: 1, nombre_destino: 'A', lat: 10, lng: 10, empresa: 'C1' };
  const locB = { id: '2', nombre_destino: 'B', ubicacion: { lat: '20', lng: '20' }, empresa: 'C2' };

  it('Branch 1: should project selectedPin solely', () => {
    const input = { ...baseInput, selectedPin: locA };
    const state = projectPublicMapViewState(input);
    expect(state.markers.length).toBe(1);
    expect(state.markers[0].label).toBe('A');
    expect(state.markers[0].selected).toBe(true); // By definition selectedPin is selected
    expect(state.markers[0].coordinate).toEqual({ lat: 10, lng: 10 });
    // Default role destination if not matched by origen
    expect(state.markers[0].role).toBe('destination');
  });

  it('Branch 2: should map flightResults (routes) deduplicated', () => {
    const locC = { id: 3, nombre_destino: 'C', lat: 30, lng: 30 };
    const input = {
      ...baseInput,
      locations: [locA, locB, locC],
      flightResults: [{ id: 'f1' }], // Array must have length > 0
      displayedResults: [
        { origen_nombre: 'A', destino_nombre: 'B' },
        { origen_nombre: 'A', destino_nombre: 'C' } // A is duplicated
      ]
    };
    const state = projectPublicMapViewState(input);
    expect(state.markers.length).toBe(3); // A (origin), B (destination), C (destination)
    expect(state.markers.find(m => m.label === 'A')?.role).toBe('origin');
    expect(state.markers.find(m => m.label === 'B')?.role).toBe('destination');
    expect(state.markers.find(m => m.label === 'C')?.role).toBe('destination');
  });

  it('Branch 3: should map displayedResults plus explicit destination if missing', () => {
    const input = {
      ...baseInput,
      locations: [locA, locB],
      displayedResults: [locA], // only A displayed
      destino: 'B' // explicit destination
    };
    const state = projectPublicMapViewState(input);
    expect(state.markers.length).toBe(2);
    expect(state.markers.find(m => m.label === 'A')).toBeTruthy();
    expect(state.markers.find(m => m.label === 'B')).toBeTruthy();
  });

  it('Branch 4: should map explicit origin and destination', () => {
    const input = {
      ...baseInput,
      locations: [locA, locB],
      origen: '1',
      destino: 'B'
    };
    const state = projectPublicMapViewState(input);
    expect(state.markers.length).toBe(2);
    expect(state.markers.find(m => m.label === 'A')?.role).toBe('origin');
    expect(state.markers.find(m => m.label === 'B')?.role).toBe('destination');
  });

  it('Branch 5: should return empty markers if no match', () => {
    const state = projectPublicMapViewState(baseInput);
    expect(state.markers).toEqual([]);
  });

  it('should parse nested and string coordinates correctly', () => {
    const input = { ...baseInput, selectedPin: locB };
    const state = projectPublicMapViewState(input);
    expect(state.markers[0].coordinate).toEqual({ lat: 20, lng: 20 });
  });

  it('should select marker matching expandedResultCard', () => {
    const input = {
      ...baseInput,
      displayedResults: [locA, locB],
      expandedResultCard: locB
    };
    const state = projectPublicMapViewState(input);
    expect(state.markers.find(m => m.label === 'A')?.selected).toBe(false);
    expect(state.markers.find(m => m.label === 'B')?.selected).toBe(true);
  });
});
