export type SearchStatus = 'initial' | 'loading' | 'success' | 'empty' | 'error';
export type SearchMode = 'idle' | 'discovery' | 'municipality-routes' | 'point-routes';

export interface MunicipalityRef {
  municipio: string;
  departamento: string;
}

export interface PointRef {
  id: string;
  name: string;
  company: string;
  type?: string;
  coordinates: { lat: number | string; lng: number | string } | null;
  municipality: MunicipalityRef;
}

export interface SearchFilters {
  dropoffDate: string;
  dropoffTime: string;
}

export interface LocationSelection {
  point: PointRef | null;
  inputValue: string;
  municipality: string;
  department: string;
}

export interface DeliveryOptionModel {
  arrivalDate: string;
  arrivalDateIso: string | null;
  collectionSchedule: string;
  dropoffDate: string | null;
  dropoffMessage: string | null;
}

export interface RouteLocationModel {
  name: string;
  type: string | null;
  coordinates: { lat: number | string; lng: number | string } | null;
}

export interface ShipmentRouteModel {
  company: string;
  origin: RouteLocationModel;
  destination: RouteLocationModel;
  originMessage: string;
  options: DeliveryOptionModel[];
}

export interface RoutePresentationState {
  selectedOptionIndex: number;
  selectedOption: DeliveryOptionModel | null;
  hasClosedAlert: boolean;
  isExpanded: boolean;
}

export interface SearchRouteItem {
  route: ShipmentRouteModel;
  presentation: RoutePresentationState;
}

export type SearchErrorCode = 'NETWORK' | 'SERVER' | 'INVALID_RESPONSE' | 'NO_ROUTES';

export interface SearchErrorState {
  code: SearchErrorCode;
  message: string;
}

export const SEARCH_ERROR_MESSAGES: Record<SearchErrorCode, string> = {
  NETWORK: 'Error de conexión. Verifica tu internet y vuelve a intentar.',
  SERVER: 'Ocurrió un error en el servidor al buscar las rutas.',
  INVALID_RESPONSE: 'El servidor devolvió datos inválidos o incompletos.',
  NO_ROUTES: 'No se encontraron rutas disponibles para esta selección.'
};

export interface ShipmentSearchState {
  status: SearchStatus;
  mode: SearchMode;
  results: SearchRouteItem[];
  error: SearchErrorState | null;
  origin: LocationSelection;
  destination: LocationSelection;
  filters: SearchFilters;
}

export interface MunicipalityRouteSearchCommand {
  origin: MunicipalityRef;
  destination: MunicipalityRef;
  filters: SearchFilters;
}

export interface PointRouteSearchCommand {
  originPoints: PointRef[];
  destinationPoints: PointRef[];
  filters: SearchFilters;
}