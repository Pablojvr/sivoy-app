import { expectTypeOf } from 'vitest';
import type {
  GetUpcomingRoutesResponseDto,
  GetUpcomingRoutesScalarSuccessDto,
  GetUpcomingRoutesCollectionSuccessDto,
  SearchRoutesByMunicipalityResponseDto,
  MunicipalityScalarSuccessDto,
  MunicipalityCollectionSuccessDto,
  SearchFlightsPayload,
  SearchRoutesByMunicipalityPayload
} from './route-api.contracts';

const option = {
  fecha_llegada: 'Jueves',
  fecha_llegada_iso: '2026-09-17',
  horario_recoleccion: '09:00 AM a 04:00 PM'
};

const upcomingPoint = {
  empresa: 'Empresa ficticia',
  origen_nombre: 'Origen',
  origen_msg: 'Recibido',
  destino_nombre: 'Destino',
  opciones: [option],
  opciones_entrega: [{
    dropoff_date: '2026-09-16',
    dropoff_msg: 'Recibido',
    fecha_llegada: 'Jueves',
    horario_recoleccion: '09:00 AM a 04:00 PM'
  }]
};

const upcomingScalar = { success: true, ...upcomingPoint } satisfies GetUpcomingRoutesScalarSuccessDto;
const upcomingCollection = {
  success: true,
  results: [upcomingPoint]
} satisfies GetUpcomingRoutesCollectionSuccessDto;

const municipalityScalar = {
  success: true,
  origen_msg: 'Recibido',
  origen_nombre: 'Origen',
  results: [{
    destino_nombre: 'Destino',
    fecha_llegada: 'Jueves',
    horario_recoleccion: '09:00 AM a 04:00 PM',
    origen_msg: 'Recibido',
    opciones: [option]
  }]
} satisfies MunicipalityScalarSuccessDto;

const municipalityCollection = {
  success: true,
  results: [{
    origen_nombre: 'Origen',
    empresa: 'Empresa ficticia',
    destino_nombre: 'Destino',
    fecha_llegada: 'Jueves',
    horario_recoleccion: '09:00 AM a 04:00 PM',
    origen_msg: 'Recibido',
    opciones: [option]
  }]
} satisfies MunicipalityCollectionSuccessDto;

function assertNever(value: never): never {
  throw new Error(`Unexpected route response: ${JSON.stringify(value)}`);
}

function classifyUpcoming(response: GetUpcomingRoutesResponseDto): string {
  if (!response.success) return 'none';
  if ('results' in response) return 'collection';
  if ('destino_nombre' in response) return 'scalar';
  return assertNever(response);
}

function classifyMunicipality(response: SearchRoutesByMunicipalityResponseDto): string {
  if (!response.success) return 'closed';
  if ('origen_nombre' in response) return 'scalar';
  if ('results' in response) return 'collection';
  return assertNever(response);
}

describe('legacy route response contracts', () => {
  it('distinguishes scalar, collection and business-negative upcoming routes', () => {
    expect(classifyUpcoming(upcomingScalar)).toBe('scalar');
    expect(classifyUpcoming(upcomingCollection)).toBe('collection');
    expect(classifyUpcoming({ success: false, origen_msg: 'Sin ruta' })).toBe('none');
    expectTypeOf(upcomingScalar).toExtend<GetUpcomingRoutesResponseDto>();
    expectTypeOf(upcomingCollection).toExtend<GetUpcomingRoutesResponseDto>();
  });

  it('distinguishes scalar, collection and business-negative municipality routes', () => {
    expect(classifyMunicipality(municipalityScalar)).toBe('scalar');
    expect(classifyMunicipality(municipalityCollection)).toBe('collection');
    expect(classifyMunicipality({ success: false, origen_msg: 'Cerrado', results: [] })).toBe('closed');
    expectTypeOf(municipalityScalar).toExtend<SearchRoutesByMunicipalityResponseDto>();
    expectTypeOf(municipalityCollection).toExtend<SearchRoutesByMunicipalityResponseDto>();
  });

  it('allows omitted date and time because the legacy backend supplies both defaults', () => {
    const flights = {
      origen_municipio: 'Origen',
      destino_municipio: 'Destino'
    } satisfies SearchFlightsPayload;
    const municipality = {
      origen: 'Agencia origen',
      destinos: ['Agencia destino']
    } satisfies SearchRoutesByMunicipalityPayload;
    expect(flights.destino_municipio).toBe('Destino');
    expect(municipality.destinos).toEqual(['Agencia destino']);
  });
});
