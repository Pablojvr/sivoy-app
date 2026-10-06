import { SearchRouteItem, ShipmentRouteModel, DeliveryOptionModel, PointRef, SearchErrorCode } from './shipment-search.models';

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function parseSearchFlightsResponse(payload: unknown): { ok: true; items: SearchRouteItem[] } | { ok: false; error: SearchErrorCode } {
  if (!isObject(payload)) return { ok: false, error: 'INVALID_RESPONSE' };
  if (typeof payload['success'] !== 'boolean') return { ok: false, error: 'INVALID_RESPONSE' };
  if (payload['success'] === false) return { ok: false, error: 'NO_ROUTES' };

  const results = payload['results'];
  if (!Array.isArray(results)) return { ok: false, error: 'INVALID_RESPONSE' };
  if (results.length === 0) return { ok: false, error: 'NO_ROUTES' };

  const items: SearchRouteItem[] = [];
  for (const item of results) {
    if (!isObject(item)) return { ok: false, error: 'INVALID_RESPONSE' };

    const company = item['empresa'];
    const originName = item['origen_nombre'];
    const destName = item['destino_nombre_destino'];
    if (typeof company !== 'string' || typeof originName !== 'string' || typeof destName !== 'string') {
      return { ok: false, error: 'INVALID_RESPONSE' };
    }

    const opciones = item['opciones_entrega'];
    if (!Array.isArray(opciones)) return { ok: false, error: 'INVALID_RESPONSE' };

    const parsedOptions: DeliveryOptionModel[] = [];
    for (const opt of opciones) {
       if (!isObject(opt)) return { ok: false, error: 'INVALID_RESPONSE' };

       const arrival = opt['fecha_llegada'];
       const schedule = opt['horario_recoleccion'];
       const dropDate = opt['dropoff_date'];
       const dropMsg = opt['dropoff_msg'];

       if (typeof arrival !== 'string' || typeof schedule !== 'string' || typeof dropDate !== 'string' || typeof dropMsg !== 'string') {
         return { ok: false, error: 'INVALID_RESPONSE' };
       }
       parsedOptions.push({
         arrivalDate: arrival,
         arrivalDateIso: null,
         collectionSchedule: schedule,
         dropoffDate: dropDate,
         dropoffMessage: dropMsg
       });
    }

    if (parsedOptions.length === 0) {
      return { ok: false, error: 'INVALID_RESPONSE' };
    }

    const oLat = item['origen_lat'];
    const oLng = item['origen_lng'];
    const dLat = item['destino_lat'];
    const dLng = item['destino_lng'];

    const originType = typeof item['origen_tipo'] === 'string' ? item['origen_tipo'] : null;
    const destType = typeof item['destino_tipo'] === 'string' ? item['destino_tipo'] : null;
    const originMessage = typeof item['origen_msg'] === 'string' ? item['origen_msg'] : '';

    const route: ShipmentRouteModel = {
      company,
      origin: {
        name: originName,
        type: originType,
        coordinates: (typeof oLat === 'number' || typeof oLat === 'string') && (typeof oLng === 'number' || typeof oLng === 'string')
          ? { lat: oLat, lng: oLng } : null
      },
      destination: {
        name: destName,
        type: destType,
        coordinates: (typeof dLat === 'number' || typeof dLat === 'string') && (typeof dLng === 'number' || typeof dLng === 'string')
          ? { lat: dLat, lng: dLng } : null
      },
      originMessage,
      options: parsedOptions
    };

    items.push({
      route,
      presentation: {
        selectedOptionIndex: 0,
        selectedOption: parsedOptions[0] ?? null,
        hasClosedAlert: false,
        isExpanded: false
      }
    });
  }
  return { ok: true, items };
}

export function parseUpcomingRoutesResponse(payload: unknown, originPoints: PointRef[], destPoints: PointRef[]): { ok: true; items: SearchRouteItem[] } | { ok: false; error: SearchErrorCode } {
  if (!isObject(payload)) return { ok: false, error: 'INVALID_RESPONSE' };

  if (typeof payload['success'] !== 'boolean') return { ok: false, error: 'INVALID_RESPONSE' };
  if (payload['success'] === false) return { ok: false, error: 'NO_ROUTES' };

  let resultsArray: unknown[] = [];
  if (Array.isArray(payload['results'])) {
    resultsArray = payload['results'];
  } else if (payload['success'] === true && typeof payload['empresa'] === 'string') {
    resultsArray = [payload];
  } else {
    return { ok: false, error: 'INVALID_RESPONSE' };
  }

  if (resultsArray.length === 0) return { ok: false, error: 'NO_ROUTES' };

  const items: SearchRouteItem[] = [];
  for (const item of resultsArray) {
    if (!isObject(item)) return { ok: false, error: 'INVALID_RESPONSE' };

    const company = item['empresa'];
    const originName = item['origen_nombre'];
    const destName = item['destino_nombre'];
    if (typeof company !== 'string' || typeof originName !== 'string' || typeof destName !== 'string') {
      return { ok: false, error: 'INVALID_RESPONSE' };
    }

    const opcionesEntrega = Array.isArray(item['opciones_entrega']) ? item['opciones_entrega'] : [];
    const opcionesProj = Array.isArray(item['opciones']) ? item['opciones'] : [];

    const parsedOptions: DeliveryOptionModel[] = [];
    if (opcionesEntrega.length > 0) {
      for (const opt of opcionesEntrega) {
         if (!isObject(opt)) return { ok: false, error: 'INVALID_RESPONSE' };
         const arrival = opt['fecha_llegada'];
         const schedule = opt['horario_recoleccion'];
         const dropDate = opt['dropoff_date'];
         const dropMsg = opt['dropoff_msg'];
         if (typeof arrival === 'string' && typeof schedule === 'string' && typeof dropDate === 'string' && typeof dropMsg === 'string') {
           parsedOptions.push({
             arrivalDate: arrival,
             arrivalDateIso: null,
             collectionSchedule: schedule,
             dropoffDate: dropDate,
             dropoffMessage: dropMsg
           });
         } else {
           return { ok: false, error: 'INVALID_RESPONSE' };
         }
      }
    } else {
      for (const opt of opcionesProj) {
         if (!isObject(opt)) return { ok: false, error: 'INVALID_RESPONSE' };
         const arrival = opt['fecha_llegada'];
         const schedule = opt['horario_recoleccion'];
         const iso = opt['fecha_llegada_iso'];
         if (typeof arrival === 'string' && typeof schedule === 'string') {
           parsedOptions.push({
             arrivalDate: arrival,
             arrivalDateIso: typeof iso === 'string' ? iso : null,
             collectionSchedule: schedule,
             dropoffDate: null,
             dropoffMessage: null
           });
         } else {
           return { ok: false, error: 'INVALID_RESPONSE' };
         }
      }
    }

    if (parsedOptions.length === 0) {
      return { ok: false, error: 'INVALID_RESPONSE' };
    }

    const originPoint = originPoints.find(p => p.name === originName && p.company === company);
    const destPoint = destPoints.find(p => p.name === destName && p.company === company);

    const route: ShipmentRouteModel = {
      company,
      origin: {
        name: originName,
        type: originPoint?.type ?? null,
        coordinates: originPoint?.coordinates ?? null
      },
      destination: {
        name: destName,
        type: destPoint?.type ?? null,
        coordinates: destPoint?.coordinates ?? null
      },
      originMessage: typeof item['origen_msg'] === 'string' ? item['origen_msg'] : '',
      options: parsedOptions
    };

    items.push({
      route,
      presentation: {
        selectedOptionIndex: 0,
        selectedOption: parsedOptions[0] ?? null,
        hasClosedAlert: false,
        isExpanded: false
      }
    });
  }

  if (items.length === 0) return { ok: false, error: 'INVALID_RESPONSE' };

  return { ok: true, items };
}