import { Injectable, computed, signal, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of, Observable } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { RutasService } from '../../core/services/rutas.service';
import { SearchFlightsResponseDto, GetUpcomingRoutesResponseDto, SearchFlightsPayload, GetUpcomingRoutesPayload } from '../../core/services/route-api.contracts';
import {
  ShipmentSearchState, LocationSelection, MunicipalityRouteSearchCommand, PointRouteSearchCommand,
  SearchRouteItem, SearchErrorCode, SEARCH_ERROR_MESSAGES
} from './shipment-search.models';
import { parseSearchFlightsResponse, parseUpcomingRoutesResponse } from './shipment-route.adapter';

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
  origin: initialLocation,
  destination: initialLocation,
  filters: { dropoffDate: '', dropoffTime: '' }
};

type SearchAction =
  | { type: 'reset' }
  | { type: 'municipality'; command: MunicipalityRouteSearchCommand }
  | { type: 'point'; command: PointRouteSearchCommand };

type InternalSearchOutcome =
  | { type: 'reset' }
  | { type: 'success'; results: SearchRouteItem[] }
  | { type: 'error'; code: SearchErrorCode };

function classifyHttpError(error: unknown): SearchErrorCode {
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return 'NETWORK';
  }
  return 'SERVER';
}

@Injectable({ providedIn: 'root' })
export class ShipmentSearchFacade {
  private rutasService = inject(RutasService);
  private destroyRef = inject(DestroyRef);

  private _state = signal<ShipmentSearchState>(initialState);
  private request$ = new Subject<SearchAction>();

  readonly state = this._state.asReadonly();

  readonly isSearching = computed(() => this._state().status === 'loading');
  readonly hasResults = computed(() => this._state().results.length > 0);
  readonly errorMessage = computed(() => this._state().error?.message || '');

  constructor() {
    this.request$.pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap((request: SearchAction) => {
        if (request.type === 'reset') {
          return of<InternalSearchOutcome>({ type: 'reset' });
        } else if (request.type === 'municipality') {
          const params: SearchFlightsPayload = {
            origen_municipio: request.command.origin.municipio,
            origen_departamento: request.command.origin.departamento,
            destino_municipio: request.command.destination.municipio,
            destino_departamento: request.command.destination.departamento,
            dropoff_date: request.command.filters.dropoffDate,
            dropoff_time: request.command.filters.dropoffTime
          };
          return this.rutasService.searchFlights(params).pipe(
            map((response: unknown): InternalSearchOutcome => {
              const result = parseSearchFlightsResponse(response);
              if (result.ok) {
                return { type: 'success', results: result.items };
              }
              return { type: 'error', code: result.error };
            }),
            catchError((err: unknown): Observable<InternalSearchOutcome> => {
              return of({ type: 'error', code: classifyHttpError(err) });
            })
          );
        } else {
          if (request.command.originPoints.length === 0 || request.command.destinationPoints.length === 0) {
            return of<InternalSearchOutcome>({ type: 'error', code: 'NO_ROUTES' });
          }
          const params: GetUpcomingRoutesPayload = {
            origen: request.command.originPoints.map(p => p.name),
            destino: request.command.destinationPoints.map(p => p.name),
            dropoff_date: request.command.filters.dropoffDate,
            dropoff_time: request.command.filters.dropoffTime
          };
          return this.rutasService.getUpcomingRoutes(params).pipe(
            map((response: unknown): InternalSearchOutcome => {
              const result = parseUpcomingRoutesResponse(response, request.command.originPoints, request.command.destinationPoints);
              if (result.ok) {
                return { type: 'success', results: result.items };
              }
              return { type: 'error', code: result.error };
            }),
            catchError((err: unknown): Observable<InternalSearchOutcome> => {
              return of({ type: 'error', code: classifyHttpError(err) });
            })
          );
        }
      })
    ).subscribe((outcome: InternalSearchOutcome) => {
      if (outcome.type === 'reset') {
        return;
      }

      if (outcome.type === 'error') {
        const status = outcome.code === 'NO_ROUTES' ? 'empty' : 'error';
        this._state.update(state => ({
          ...state,
          status,
          error: { code: outcome.code, message: SEARCH_ERROR_MESSAGES[outcome.code] },
          results: []
        }));
        return;
      }

      this._state.update(state => ({
        ...state,
        status: 'success',
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
}
