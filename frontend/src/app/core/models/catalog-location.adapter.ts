import { CatalogPoint, CatalogPointDetail } from './catalog.models';
import { DeliveryRule, LocationCoordinates, OperatingSchedule } from './location.models';

export interface CatalogLocationView {
  readonly id: string;
  readonly id_destino: string;
  readonly catalogPointId: string;
  readonly companyId: string;
  readonly nombre_destino: string;
  readonly empresa: string;
  readonly tipo: string;
  readonly maps_url?: string;
  readonly imagen_referencia?: string;
  readonly direccion_referencia?: string;
  readonly ubicacion: LocationCoordinates;
  readonly horarios_operativos: readonly OperatingSchedule[];
  readonly reglas_entrega: readonly DeliveryRule[];
  readonly _status: {
    readonly color: 'green' | 'orange' | 'gray';
    readonly mainText: string;
    readonly timeText: string;
  };
}

export function catalogPointToLocation(point: CatalogPoint | CatalogPointDetail): CatalogLocationView {
  const address = optional(point.location.address);
  const imageUrl = optional(point.media.imageUrl);
  const mapsUrl = optional(point.media.mapsUrl);
  const coordinates: LocationCoordinates = {
    departamento: point.location.department,
    municipio: point.location.municipality,
    ...(address ? { direccion_referencia: address } : {}),
    ...(point.location.coordinates.lat === null ? {} : { lat: point.location.coordinates.lat }),
    ...(point.location.coordinates.lng === null ? {} : { lng: point.location.coordinates.lng })
  };

  return {
    id: point.pointId,
    id_destino: point.pointId,
    catalogPointId: point.pointId,
    companyId: point.company.companyId,
    nombre_destino: point.name,
    empresa: point.company.name,
    tipo: point.pointType,
    ...(mapsUrl ? { maps_url: mapsUrl } : {}),
    ...(imageUrl ? { imagen_referencia: imageUrl } : {}),
    ...(address ? { direccion_referencia: address } : {}),
    ubicacion: coordinates,
    horarios_operativos: isDetail(point)
      ? point.schedules.map(schedule => ({
          dia_semana: schedule.day,
          hora_apertura: schedule.opensAt,
          hora_cierre: schedule.closesAt
        }))
      : [],
    reglas_entrega: [],
    _status: availabilityStatus(point)
  };
}

function availabilityStatus(point: CatalogPoint): CatalogLocationView['_status'] {
  if (point.availability.status === 'OPEN' && point.availability.closesAt) {
    return {
      color: 'green',
      mainText: 'Disponible ahora',
      timeText: `Hasta las ${formatTime(point.availability.closesAt)}`
    };
  }

  if (point.availability.nextOpeningAt) {
    return {
      color: 'orange',
      mainText: 'Cerrado ahora',
      timeText: formatNextOpening(point.availability.nextOpeningAt)
    };
  }

  return { color: 'gray', mainText: 'Consulta sus horarios', timeText: '' };
}

function formatNextOpening(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return '';
  const day = new Intl.DateTimeFormat('es-SV', {
    weekday: 'long',
    timeZone: 'America/El_Salvador'
  }).format(instant);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/El_Salvador'
  }).format(instant);
  return `Abre ${day} a las ${time}`;
}

function formatTime(value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

function isDetail(point: CatalogPoint | CatalogPointDetail): point is CatalogPointDetail {
  return Array.isArray((point as CatalogPointDetail).schedules);
}

function optional(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
