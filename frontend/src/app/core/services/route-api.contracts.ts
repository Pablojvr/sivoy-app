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

interface MunicipalityRouteBaseItemDto {
  destino_nombre: string;
  fecha_llegada: string;
  horario_recoleccion: string;
  origen_msg: string;
  opciones: ProjectedDeliveryOptionDto[];
}

export type MunicipalityScalarItemDto = MunicipalityRouteBaseItemDto;

export interface MunicipalityCollectionItemDto extends MunicipalityRouteBaseItemDto {
  origen_nombre: string;
  empresa: string;
}

export type MunicipalityRouteItemDto = MunicipalityScalarItemDto | MunicipalityCollectionItemDto;

export interface MunicipalityScalarSuccessDto {
  success: true;
  origen_msg: string;
  origen_nombre: string;
  results: MunicipalityScalarItemDto[];
}

export interface MunicipalityCollectionSuccessDto {
  success: true;
  results: MunicipalityCollectionItemDto[];
}

export interface MunicipalityNoIncomeDto {
  success: false;
  origen_msg: string;
  results: [];
}

export type SearchRoutesByMunicipalityResponseDto =
  | MunicipalityScalarSuccessDto
  | MunicipalityCollectionSuccessDto
  | MunicipalityNoIncomeDto;

export interface UpcomingRouteResultDto {
  empresa: string;
  origen_nombre: string;
  origen_msg: string;
  destino_nombre: string;
  opciones: ProjectedDeliveryOptionDto[];
  opciones_entrega: FlightDeliveryOptionDto[];
}

export interface GetUpcomingRoutesCollectionSuccessDto {
  success: true;
  results: UpcomingRouteResultDto[];
}

export type GetUpcomingRoutesScalarSuccessDto = { success: true } & UpcomingRouteResultDto;

export interface GetUpcomingRoutesNoRouteDto {
  success: false;
  origen_msg: string;
}

export type GetUpcomingRoutesResponseDto =
  | GetUpcomingRoutesCollectionSuccessDto
  | GetUpcomingRoutesScalarSuccessDto
  | GetUpcomingRoutesNoRouteDto;

export interface RouteErrorBodyDto {
  error: string;
}

export interface SearchFlightsPayload {
  origen_municipio: string;
  origen_departamento?: string;
  destino_municipio: string;
  destino_departamento?: string;
  dropoff_date?: string;
  dropoff_time?: string;
}

export interface SearchRoutesByMunicipalityPayload {
  origen: string | string[];
  destinos: string[];
  dropoff_date?: string;
  dropoff_time?: string;
  arrival_date?: string;
}

export interface GetUpcomingRoutesPayload {
  origen: string | string[];
  destino: string | string[];
  dropoff_date?: string;
  dropoff_time?: string;
  arrival_date?: string;
}
