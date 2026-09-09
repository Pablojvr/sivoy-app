import { SearchRouteItem, PointRef } from '../shipment-search.models';

export interface RouteDeliveryOption {
  fecha_llegada?: string;
  fecha_llegada_iso?: string;
  horario_recoleccion?: string;
  dropoff_date?: string;
  dropoff_msg?: string;
  sourceOptionIndex?: number;
}

export interface RouteResultViewModel {
  empresa?: string;
  origen_nombre: string;
  origen_tipo?: string;
  origen_lat?: number | string | null;
  origen_lng?: number | string | null;
  destino_nombre_destino?: string;
  destino_nombre?: string;
  destino_tipo?: string;
  destino_lat?: number | string | null;
  destino_lng?: number | string | null;
  opciones_entrega?: RouteDeliveryOption[];
  opciones?: RouteDeliveryOption[];
  selectedOption?: RouteDeliveryOption | null;
  selected_opcion_idx?: number;
  fecha_llegada?: string;
  horario_recoleccion?: string;
  isExpanded?: boolean;
  hasClosedAlert?: boolean;
  origen_msg?: string;
  distance?: number;
  sourceRouteIndex: number;
}

export interface RouteDeliveryDayChange {
  route: RouteResultViewModel;
  index: number;
}

export function presentSearchRoute(item: SearchRouteItem, sourceRouteIndex: number, unfilteredItem: SearchRouteItem): RouteResultViewModel {
  const model = item.route;
  const presentation = item.presentation;

  const mappedOptions = model.options.map((opt) => {
    const originalIndex = unfilteredItem.route.options.indexOf(opt);
    return {
      fecha_llegada: opt.arrivalDate,
      fecha_llegada_iso: opt.arrivalDateIso ?? undefined,
      horario_recoleccion: opt.collectionSchedule,
      dropoff_date: opt.dropoffDate ?? '',
      dropoff_msg: opt.dropoffMessage ?? '',
      ...(originalIndex >= 0 ? { sourceOptionIndex: originalIndex } : {})
    };
  });

  const selectedIdx = presentation.selectedOptionIndex;
  const selectedOption = mappedOptions[selectedIdx] ?? mappedOptions[0] ?? null;

  return {
    empresa: model.company,
    origen_nombre: model.origin.name,
    origen_tipo: model.origin.type ?? undefined,
    origen_lat: model.origin.coordinates?.lat ?? null,
    origen_lng: model.origin.coordinates?.lng ?? null,
    destino_nombre_destino: model.destination.name,
    destino_nombre: model.destination.name,
    destino_tipo: model.destination.type ?? undefined,
    destino_lat: model.destination.coordinates?.lat ?? null,
    destino_lng: model.destination.coordinates?.lng ?? null,
    opciones_entrega: mappedOptions,
    opciones: mappedOptions,
    selectedOption: selectedOption,
    selected_opcion_idx: selectedIdx,
    fecha_llegada: selectedOption?.fecha_llegada ?? '',
    horario_recoleccion: selectedOption?.horario_recoleccion ?? '',
    isExpanded: presentation.isExpanded,
    hasClosedAlert: presentation.hasClosedAlert,
    origen_msg: model.originMessage,
    distance: 0,
    sourceRouteIndex
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

export function pointRefFromLocation(value: unknown): PointRef | null {
  if (!isRecord(value)) {
    return null;
  }

  const nameVal = value['nombre_destino'] ?? value['destino_nombre'] ?? value['destino_nombre_destino'];
  const name = typeof nameVal === 'string' ? nameVal : '';
  const company = typeof value['empresa'] === 'string' ? value['empresa'] : '';

  if (!name || !company) {
    return null;
  }

  const idVal = value['id_destino'] ?? value['id_origen'] ?? value['id'];
  const id = (typeof idVal === 'string' || typeof idVal === 'number') ? String(idVal) : name;
  const type = typeof value['tipo'] === 'string' ? value['tipo'] : undefined;

  let coordinates: { lat: number | string; lng: number | string } | null = null;
  let municipality = { municipio: '', departamento: '' };

  const ubicacion = value['ubicacion'];
  if (isRecord(ubicacion)) {
    if (isCoordinate(ubicacion['lat']) && isCoordinate(ubicacion['lng'])) {
      coordinates = {
        lat: ubicacion['lat'],
        lng: ubicacion['lng']
      };
    }
    if (typeof ubicacion['municipio'] === 'string') {
      municipality.municipio = ubicacion['municipio'];
    }
    if (typeof ubicacion['departamento'] === 'string') {
      municipality.departamento = ubicacion['departamento'];
    }
  }

  return { id, name, company, type, coordinates, municipality };
}