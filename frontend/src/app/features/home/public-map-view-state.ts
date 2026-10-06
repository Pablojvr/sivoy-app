export interface PublicMapCoordinate {
  lat: number;
  lng: number;
}

export interface PublicMapMarker {
  coordinate: PublicMapCoordinate;
  role: 'origin' | 'destination';
  label: string;
  company: string;
  selected: boolean;
  source: unknown;
}

export interface PublicMapViewState {
  readonly markers: readonly PublicMapMarker[];
}

export interface PublicMapProjectionInput {
  locations: unknown[];
  selectedPin: unknown;
  flightResults: unknown[];
  displayedResults: unknown[];
  origen: string;
  destino: string;
  origenMunicipio: string;
  destinoMunicipio: string;
  expandedResultCard: unknown;
  isOriginDiscoveryMode: boolean;
}

// Type guards for unknown properties
function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function getStringProp(val: unknown, prop: string): string {
  if (isObject(val) && typeof val[prop] === 'string') {
    return val[prop] as string;
  }
  return '';
}

function getNumberOrStringPropAsNumber(val: unknown, prop: string): number | null {
  if (isObject(val)) {
    const v = val[prop];
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const parsed = parseFloat(v);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

function getCoordinate(val: unknown): PublicMapCoordinate | null {
  if (!isObject(val)) return null;

  let lat = getNumberOrStringPropAsNumber(val, 'lat');
  let lng = getNumberOrStringPropAsNumber(val, 'lng');

  if (lat === null || lng === null) {
    const ubicacion = isObject(val['ubicacion']) ? val['ubicacion'] : null;
    if (ubicacion) {
      lat = getNumberOrStringPropAsNumber(ubicacion, 'lat');
      lng = getNumberOrStringPropAsNumber(ubicacion, 'lng');
    }
  }

  if (lat !== null && lng !== null) {
    return { lat, lng };
  }
  return null;
}

function matchesIdOrName(val: unknown, idOrName: string): boolean {
  if (!isObject(val) || !idOrName) return false;
  const valId = val['id'];
  const valName = getStringProp(val, 'nombre_destino');
  return (valId !== undefined && String(valId) === String(idOrName)) || valName === idOrName;
}

function findLocation(locations: unknown[], idOrName: string): unknown | undefined {
  return locations.find(loc => matchesIdOrName(loc, idOrName));
}

function isSameLocation(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b)) return false;
  const nameA = getStringProp(a, 'nombre_destino');
  const nameB = getStringProp(b, 'nombre_destino');
  return !!nameA && !!nameB && nameA === nameB;
}

export function projectPublicMapViewState(input: PublicMapProjectionInput): PublicMapViewState {
  const {
    locations,
    selectedPin,
    flightResults,
    displayedResults,
    origen,
    destino,
    origenMunicipio,
    destinoMunicipio,
    expandedResultCard,
    isOriginDiscoveryMode
  } = input;

  let pointsToPlot: unknown[] = [];

  // Branch 1: selectedPin
  if (selectedPin && isObject(selectedPin)) {
    pointsToPlot = [selectedPin];
  }
  // Branch 2: route results
  else if (Array.isArray(flightResults) && flightResults.length > 0 &&
           Array.isArray(displayedResults) && displayedResults.length > 0 &&
           isObject(displayedResults[0]) && getStringProp(displayedResults[0], 'origen_nombre')) {

    displayedResults.forEach(r => {
      if (!isObject(r)) return;
      const originName = getStringProp(r, 'origen_nombre');
      const destName = getStringProp(r, 'destino_nombre');

      const originLoc = findLocation(locations, originName);
      const destLoc = findLocation(locations, destName);

      if (originLoc && isObject(originLoc) && !pointsToPlot.find(p => isSameLocation(p, originLoc))) {
        pointsToPlot.push({ ...originLoc, markerType: 'origin', locData: r });
      }
      if (destLoc && isObject(destLoc) && !pointsToPlot.find(p => isSameLocation(p, destLoc))) {
        pointsToPlot.push({ ...destLoc, markerType: 'destination', locData: r });
      }
    });
  }
  // Branch 3: displayed results
  else if (Array.isArray(displayedResults) && displayedResults.length > 0) {
    pointsToPlot = [...displayedResults];

    if (destino && !destinoMunicipio) {
      const destLoc = findLocation(locations, destino);
      if (destLoc && isObject(destLoc) && !pointsToPlot.find(p => isSameLocation(p, destLoc))) {
        pointsToPlot.push(destLoc);
      }
    }
  }
  // Branch 4: no list active, just explicit origin/destinations
  else {
    if (destino && !destinoMunicipio) {
      const destLoc = findLocation(locations, destino);
      if (destLoc && isObject(destLoc)) {
        pointsToPlot.push(destLoc);
      }
    }
    if (origen && !origenMunicipio) {
      const origLoc = findLocation(locations, origen);
      if (origLoc && isObject(origLoc)) {
        pointsToPlot.push(origLoc);
      }
    }
  }

  // Branch 5: No points
  if (pointsToPlot.length === 0) {
    return { markers: [] };
  }

  const markers: PublicMapMarker[] = [];

  pointsToPlot.forEach(loc => {
    if (!isObject(loc)) return;

    const coord = getCoordinate(loc);
    if (!coord) return;

    const locName = getStringProp(loc, 'nombre_destino') || getStringProp(loc, 'destino_nombre') || 'Punto logístico';
    const company = getStringProp(loc, 'empresa');

    // Selection logic
    let isSelected = false;
    if (isObject(expandedResultCard) && isSameLocation(expandedResultCard, loc)) {
      isSelected = true;
    } else if (isObject(selectedPin) && isSameLocation(selectedPin, loc)) {
      isSelected = true;
    }

    // Role logic
    let markerType = getStringProp(loc, 'markerType');
    if (!markerType) {
      if (origen && matchesIdOrName(loc, origen)) {
        markerType = 'origin';
      } else if (destino && matchesIdOrName(loc, destino)) {
        markerType = 'destination';
      } else if (isOriginDiscoveryMode) {
        markerType = 'origin';
      } else {
        markerType = 'destination';
      }
    }

    markers.push({
      coordinate: coord,
      role: markerType === 'origin' ? 'origin' : 'destination',
      label: locName,
      company: company,
      selected: isSelected,
      source: loc
    });
  });

  return { markers };
}
