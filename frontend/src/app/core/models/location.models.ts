export type LocationId = string | number;

export interface LocationCoordinatesDto {
  lat?: number | string | null;
  lng?: number | string | null;
  municipio?: string | null;
  departamento?: string | null;
  direccion_referencia?: string | null;
  direccion?: string | null;
}

export interface OperatingScheduleDto {
  dia_semana?: string | null;
  hora_apertura?: string | null;
  hora_cierre?: string | null;
  tipo_accion?: string | null;
}

export interface DeliveryRuleDto {
  dia_entrega?: string | null;
  dia_corte_maximo?: string | null;
}

/** Transitional shape returned by the unversioned GET /api/locations endpoint. */
export interface LocationDto {
  id?: LocationId | null;
  id_destino?: LocationId | null;
  nombre_destino?: string | null;
  empresa?: string | null;
  tipo?: string | null;
  maps_url?: string | null;
  imagen_referencia?: string | null;
  imagen_url?: string | null;
  ubicacion?: LocationCoordinatesDto | null;
  horarios_operativos?: readonly OperatingScheduleDto[] | null;
  reglas_entrega?: readonly DeliveryRuleDto[] | null;
  distance?: number | null;
}

export interface LocationCoordinates {
  readonly lat?: number;
  readonly lng?: number;
  readonly municipio?: string;
  readonly departamento?: string;
  readonly direccion_referencia?: string;
}

export interface OperatingSchedule {
  readonly dia_semana: string;
  readonly hora_apertura: string;
  readonly hora_cierre: string;
  readonly tipo_accion?: string;
}

export interface DeliveryRule {
  readonly dia_entrega: string;
  readonly dia_corte_maximo: string;
}

type DeliveryPointIdentity =
  | { readonly id: LocationId; readonly id_destino?: LocationId }
  | { readonly id?: LocationId; readonly id_destino: LocationId };

/** Validated public read model. At least one legacy identity is always present. */
export type DeliveryPoint = DeliveryPointIdentity & {
  readonly nombre_destino: string;
  readonly empresa?: string;
  readonly tipo?: string;
  readonly maps_url?: string;
  readonly imagen_referencia?: string;
  readonly imagen_url?: string;
  readonly ubicacion: LocationCoordinates;
  readonly horarios_operativos: readonly OperatingSchedule[];
  readonly reglas_entrega: readonly DeliveryRule[];
  readonly distance?: number;
};
