export interface BaseDeliveryOptionDto {
  fecha_llegada: string;
  horario_recoleccion: string;
}

export interface ProjectedDeliveryOptionDto extends BaseDeliveryOptionDto {
  fecha_llegada_iso: string;
}

export interface FlightDeliveryOptionDto extends BaseDeliveryOptionDto {
  dropoff_date: string;
  dropoff_msg: string;
}

export interface SearchFlightsResultDto {
  empresa: string;
  origen_nombre: string;
  origen_tipo: string;
  origen_lat: string | number;
  origen_lng: string | number;
  destino_nombre_destino: string;
  destino_tipo: string;
  destino_lat: string | number;
  destino_lng: string | number;
  origen_msg: string;
  fecha_llegada: string;
  horario_recoleccion: string;
  opciones_entrega: FlightDeliveryOptionDto[];
  distance: number;
}

export interface SearchFlightsResponseDto {
  success: true;
  results: SearchFlightsResultDto[];
}

export interface MunicipalityRouteItemDto {
  origen_nombre?: string;
  empresa?: string;
  destino_nombre: string;
  fecha_llegada: string;
  horario_recoleccion: string;
  origen_msg: string;
  opciones: ProjectedDeliveryOptionDto[];
}

export type SearchRoutesByMunicipalityResponseDto =
  | { success: true; results: MunicipalityRouteItemDto[]; origen_msg?: string; origen_nombre?: string }
  | { success: false; results: []; origen_msg: string };

export interface UpcomingRouteResultDto {
  empresa: string;
  origen_nombre: string;
  origen_msg: string;
  destino_nombre: string;
  opciones: ProjectedDeliveryOptionDto[];
  opciones_entrega: FlightDeliveryOptionDto[];
}

export type GetUpcomingRoutesResponseDto =
  | { success: true; results: UpcomingRouteResultDto[]; origen_msg?: string; origen_nombre?: string }
  | ({ success: true } & UpcomingRouteResultDto)
  | { success: false; origen_msg: string };

export interface RouteErrorBodyDto {
  error: string;
}

export interface SearchFlightsPayload {
  origen_municipio: string;
  origen_departamento?: string;
  destino_municipio: string;
  destino_departamento?: string;
  dropoff_date: string;
  dropoff_time: string;
}

export interface SearchRoutesByMunicipalityPayload {
  origen: string | string[];
  destinos: string[];
  dropoff_date: string;
  dropoff_time: string;
  arrival_date?: string;
}

export interface GetUpcomingRoutesPayload {
  origen: string | string[];
  destino: string | string[];
  dropoff_date?: string;
  dropoff_time?: string;
  arrival_date?: string;
}
