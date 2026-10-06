import {
  DeliveryPoint,
  DeliveryRule,
  LocationCoordinates,
  LocationId,
  OperatingSchedule
} from './location.models';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function locationId(value: unknown): LocationId | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  return optionalString(value);
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  const candidate = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof candidate === 'number' &&
    Number.isFinite(candidate) &&
    candidate >= minimum &&
    candidate <= maximum
    ? candidate
    : undefined;
}

function mapCoordinates(value: unknown): LocationCoordinates {
  if (!isRecord(value)) return {};

  const latValue = value['lat'];
  const lngValue = value['lng'];
  const municipalityValue = value['municipio'];
  const departmentValue = value['departamento'];
  const referenceValue = value['direccion_referencia'];
  const addressAliasValue = value['direccion'];

  const lat = boundedNumber(latValue, -90, 90);
  const lng = boundedNumber(lngValue, -180, 180);
  const municipio = optionalString(municipalityValue);
  const departamento = optionalString(departmentValue);
  const direccion_referencia = optionalString(referenceValue) ?? optionalString(addressAliasValue);

  return {
    ...(lat === undefined ? {} : { lat }),
    ...(lng === undefined ? {} : { lng }),
    ...(municipio ? { municipio } : {}),
    ...(departamento ? { departamento } : {}),
    ...(direccion_referencia ? { direccion_referencia } : {})
  };
}

function mapSchedules(value: unknown): readonly OperatingSchedule[] {
  if (!Array.isArray(value)) return [];

  const schedules: OperatingSchedule[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const dayValue = candidate['dia_semana'];
    const openValue = candidate['hora_apertura'];
    const closeValue = candidate['hora_cierre'];
    const actionValue = candidate['tipo_accion'];
    const dia_semana = optionalString(dayValue);
    const hora_apertura = optionalString(openValue);
    const hora_cierre = optionalString(closeValue);
    const tipo_accion = optionalString(actionValue);
    if (!dia_semana || !hora_apertura || !hora_cierre) continue;
    schedules.push({
      dia_semana,
      hora_apertura,
      hora_cierre,
      ...(tipo_accion ? { tipo_accion } : {})
    });
  }
  return schedules;
}

function mapRules(value: unknown): readonly DeliveryRule[] {
  if (!Array.isArray(value)) return [];

  const rules: DeliveryRule[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const deliveryDayValue = candidate['dia_entrega'];
    const cutoffValue = candidate['dia_corte_maximo'];
    const dia_entrega = optionalString(deliveryDayValue);
    const dia_corte_maximo = optionalString(cutoffValue);
    if (!dia_entrega || !dia_corte_maximo) continue;
    rules.push({ dia_entrega, dia_corte_maximo });
  }
  return rules;
}

function mapPoint(value: unknown): DeliveryPoint | null {
  try {
    if (!isRecord(value)) return null;

    const idValue = value['id'];
    const destinationIdValue = value['id_destino'];
    const nameValue = value['nombre_destino'];
    const companyValue = value['empresa'];
    const typeValue = value['tipo'];
    const mapsUrlValue = value['maps_url'];
    const referenceImageValue = value['imagen_referencia'];
    const imageUrlValue = value['imagen_url'];
    const coordinatesValue = value['ubicacion'];
    const schedulesValue = value['horarios_operativos'];
    const rulesValue = value['reglas_entrega'];
    const distanceValue = value['distance'];

    const id = locationId(idValue);
    const id_destino = locationId(destinationIdValue);
    const nombre_destino = optionalString(nameValue);
    if ((!id && id !== 0) && (!id_destino && id_destino !== 0)) return null;
    if (!nombre_destino) return null;

    const empresa = optionalString(companyValue);
    const tipo = optionalString(typeValue);
    const maps_url = optionalString(mapsUrlValue);
    const imagen_referencia = optionalString(referenceImageValue);
    const imagen_url = optionalString(imageUrlValue);
    const distance = boundedNumber(distanceValue, 0, Number.MAX_VALUE);
    const common = {
      nombre_destino,
      ...(empresa ? { empresa } : {}),
      ...(tipo ? { tipo } : {}),
      ...(maps_url ? { maps_url } : {}),
      ...(imagen_referencia ? { imagen_referencia } : {}),
      ...(imagen_url ? { imagen_url } : {}),
      ubicacion: mapCoordinates(coordinatesValue),
      horarios_operativos: mapSchedules(schedulesValue),
      reglas_entrega: mapRules(rulesValue),
      ...(distance === undefined ? {} : { distance })
    };

    return id !== undefined
      ? { id, ...(id_destino === undefined ? {} : { id_destino }), ...common }
      : { id_destino: id_destino as LocationId, ...common };
  } catch {
    return null;
  }
}

export function mapLocationResponse(value: unknown): readonly DeliveryPoint[] {
  try {
    if (!Array.isArray(value)) return [];
    const points: DeliveryPoint[] = [];
    for (const candidate of value) {
      const point = mapPoint(candidate);
      if (point) points.push(point);
    }
    return points;
  } catch {
    return [];
  }
}
