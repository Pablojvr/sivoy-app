import { Injectable, computed, signal, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of, Observable } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';
import { RutasService, RouteSearchParams, PointAwareRouteSearchParams } from '../../core/services/rutas.service';

export type SearchStatus = 'initial' | 'loading' | 'success' | 'empty' | 'error';
export type SearchMode = 'idle' | 'discovery' | 'municipality-routes' | 'point-routes';

export interface MunicipalityRef {
  municipio: string;
  departamento: string;
}

export interface PointRef {
  id: string;
  name: string;
  company?: string;
  type?: string;
  coordinates: { lat: number; lng: number } | null;
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

export interface DeliveryOptionSummary {
  arrivalDate: string | null;
  originSchedule: string | null;
  destinationMessage: string | null;
}

export interface RouteResultSummary {
  originName: string;
  destinationName: string;
  deliveryOptions: DeliveryOptionSummary[];
}

export interface ShipmentSearchState {
  status: SearchStatus;
  mode: SearchMode;
  results: RouteResultSummary[];
  error: string | null;
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
  originNames: string[];
  destinationNames: string[];
  filters: SearchFilters;
}

export interface MunicipalitySearchPayload extends RouteSearchParams {
  origen_municipio: string;
  origen_departamento: string;
  destino_municipio: string;
  destino_departamento: string;
  dropoff_date: string;
  dropoff_time: string;
}

type SearchOutcome = 
  | { type: 'reset' }
  | { type: 'success'; results: RouteResultSummary[] }
  | { type: 'error'; error: string };

type SearchRequest = 
  | { type: 'municipality'; command: MunicipalityRouteSearchCommand }
  | { type: 'point'; command: PointRouteSearchCommand }
  | { type: 'reset' };

const initialLocation: LocationSelection = {
  point: null,
  inputValue: '',
  municipality: '',
  department: ''
};

const initialState: ShipmentSearchState = {
  status: 'initial',
  mode: 'idle',
  results: [],
  error: null,
  origin: { ...initialLocation },
  destination: { ...initialLocation },
  filters: { dropoffDate: '', dropoffTime: '' }
};

@Injectable({ providedIn: 'root' })
export class ShipmentSearchFacade {
  private readonly _state = signal<ShipmentSearchState>(initialState);
  
  public readonly state = this._state.asReadonly();
  public readonly status = computed(() => this._state().status);
  public readonly mode = computed(() => this._state().mode);
  public readonly results = computed(() => this._state().results);
  public readonly error = computed(() => this._state().error);
  public readonly origin = computed(() => this._state().origin);
  public readonly destination = computed(() => this._state().destination);
  public readonly filters = computed(() => this._state().filters);

  private readonly request$ = new Subject<SearchRequest>();
  private readonly destroyRef = inject(DestroyRef);

  constructor(private rutasService: RutasService) {
    this.request$.pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap((request: SearchRequest) => {
        if (request.type === 'reset') {
          return of<SearchOutcome>({ type: 'reset' });
        } else if (request.type === 'municipality') {
          const params: MunicipalitySearchPayload = {
            origen: `${request.command.origin.municipio}, ${request.command.origin.departamento}`,
            destino: `${request.command.destination.municipio}, ${request.command.destination.departamento}`,
            origenIsPin: false,
            dropoffDate: request.command.filters.dropoffDate,
            dropoffTime: request.command.filters.dropoffTime,
            origen_municipio: request.command.origin.municipio,
            origen_departamento: request.command.origin.departamento,
            destino_municipio: request.command.destination.municipio,
            destino_departamento: request.command.destination.departamento,
            dropoff_date: request.command.filters.dropoffDate,
            dropoff_time: request.command.filters.dropoffTime
          };
          const api$: Observable<unknown> = this.rutasService.searchFlights(params);
          return api$.pipe(
            map((response): SearchOutcome => {
              const norm = this.normalizeResponse(response);
              if (norm.ok) {
                return { type: 'success', results: norm.results };
              }
              return { type: 'error', error: 'Formato de respuesta inválido.' };
            }),
            catchError((): Observable<SearchOutcome> => of({ type: 'error', error: 'Error al comunicarse con el servidor.' }))
          );
        } else {
          const params: PointAwareRouteSearchParams = {
            origen: request.command.originNames,
            destino: request.command.destinationNames,
            dropoff_date: request.command.filters.dropoffDate,
            dropoff_time: request.command.filters.dropoffTime
          };
          const api$: Observable<unknown> = this.rutasService.getUpcomingRoutes(params);
          return api$.pipe(
            map((response): SearchOutcome => {
              const norm = this.normalizeResponse(response);
              if (norm.ok) {
                return { type: 'success', results: norm.results };
              }
              return { type: 'error', error: 'Formato de respuesta inválido.' };
            }),
            catchError((): Observable<SearchOutcome> => of({ type: 'error', error: 'Error al comunicarse con el servidor.' }))
          );
        }
      })
    ).subscribe((outcome: SearchOutcome) => {
      if (outcome.type === 'reset') {
        return;
      }

      if (outcome.type === 'error') {
        this._state.update(state => ({
          ...state,
          status: 'error',
          error: outcome.error,
          results: []
        }));
        return;
      }

      const status = outcome.results.length > 0 ? 'success' : 'empty';

      this._state.update(state => ({
        ...state,
        status,
        results: outcome.results,
        error: null
      }));
    });
  }

  private hasSelection(loc: LocationSelection): boolean {
    return !!loc.point || loc.municipality.trim().length > 0 || loc.inputValue.trim().length > 0;
  }

  private updateSelectionMode(state: ShipmentSearchState): ShipmentSearchState {
    const hasDestination = this.hasSelection(state.destination);
    
    let newMode = state.mode;
    if (!hasDestination) {
      newMode = 'idle';
    } else {
      newMode = 'discovery';
    }
    
    return { 
      ...state, 
      mode: newMode,
      status: 'initial',
      results: [],
      error: null
    };
  }

  setOrigin(origin: Partial<LocationSelection>): void {
    this._state.update(state => this.updateSelectionMode({
      ...state,
      origin: { ...state.origin, ...origin }
    }));
  }

  setDestination(dest: Partial<LocationSelection>): void {
    this._state.update(state => this.updateSelectionMode({
      ...state,
      destination: { ...state.destination, ...dest }
    }));
  }

  setFilters(date: string, time: string): void {
    this._state.update(state => ({
      ...state,
      filters: { dropoffDate: date, dropoffTime: time }
    }));
  }

  searchMunicipalityRoutes(command: MunicipalityRouteSearchCommand): void {
    this._state.update(state => ({ 
      ...state, 
      status: 'loading', 
      mode: 'municipality-routes', 
      filters: command.filters,
      results: [], 
      error: null 
    }));
    this.request$.next({ type: 'municipality', command });
  }

  searchPointRoutes(command: PointRouteSearchCommand): void {
    this._state.update(state => ({ 
      ...state, 
      status: 'loading', 
      mode: 'point-routes', 
      filters: command.filters,
      results: [], 
      error: null 
    }));
    this.request$.next({ type: 'point', command });
  }

  reset(): void {
    this.request$.next({ type: 'reset' });
    this._state.set(initialState);
  }

  private normalizeResponse(payload: unknown): { ok: true; results: RouteResultSummary[] } | { ok: false } {
    if (typeof payload !== 'object' || payload === null) {
      return { ok: false };
    }

    const payloadRecord = payload as Record<string, unknown>;

    if (payloadRecord['success'] === false) {
      return { ok: false };
    }

    let items: unknown;
    if (Array.isArray(payloadRecord['flights'])) {
      items = payloadRecord['flights'];
    } else if (Array.isArray(payloadRecord['results'])) {
      items = payloadRecord['results'];
    } else {
       return { ok: false };
    }

    if (!Array.isArray(items)) {
      return { ok: false };
    }

    const normalized: RouteResultSummary[] = [];

    for (const item of items) {
      if (typeof item !== 'object' || item === null) {
        return { ok: false };
      }

      const itemRecord = item as Record<string, unknown>;
      const originName = typeof itemRecord['origen_nombre'] === 'string' ? itemRecord['origen_nombre'].trim() : '';
      let destinationName = typeof itemRecord['destino_nombre'] === 'string' ? itemRecord['destino_nombre'].trim() : '';
      
      if (destinationName === '') {
        destinationName = typeof itemRecord['destino_nombre_destino'] === 'string' ? itemRecord['destino_nombre_destino'].trim() : '';
      }
      
      if (originName === '' || destinationName === '') {
        return { ok: false };
      }

      const deliveryOptions: DeliveryOptionSummary[] = [];
      
      const optionsArray = Array.isArray(itemRecord['opciones_entrega']) ? itemRecord['opciones_entrega'] : 
                           (Array.isArray(itemRecord['opciones']) ? itemRecord['opciones'] : []);

      if (optionsArray.length > 0) {
        for (const opt of optionsArray) {
          if (typeof opt !== 'object' || opt === null) continue;
          const optRecord = opt as Record<string, unknown>;
          
          deliveryOptions.push({
            arrivalDate: typeof optRecord['fecha_llegada'] === 'string' ? optRecord['fecha_llegada'] : null,
            originSchedule: typeof optRecord['horario_recoleccion'] === 'string' ? optRecord['horario_recoleccion'] : null,
            destinationMessage: typeof optRecord['dropoff_msg'] === 'string' ? optRecord['dropoff_msg'] : null,
          });
        }
      } else {
        const arrivalDate = typeof itemRecord['fecha_llegada'] === 'string' ? itemRecord['fecha_llegada'] : null;
        const originSchedule = typeof itemRecord['horario_recoleccion'] === 'string' ? itemRecord['horario_recoleccion'] : null;
        
        if (arrivalDate !== null || originSchedule !== null) {
          deliveryOptions.push({
            arrivalDate,
            originSchedule,
            destinationMessage: null
          });
        }
      }

      normalized.push({
        originName,
        destinationName,
        deliveryOptions
      });
    }

    return { ok: true, results: normalized };
  }
}
