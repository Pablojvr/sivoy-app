# T22: Shipment Search Facade - Implementation Spec

## Problem & Current Evidence
Currently, shipment search logic and state management are heavily coupled within `frontend/src/app/features/home/home.component.ts`. 
State variables like `loading`, `errorMsg`, `flightResults`, `municipalityResults`, `origen`, `destino`, `selectedOriginPoint`, and `selectedDestinationPoint` are mutated directly in UI event handlers (`triggerDynamicSearch`, `executeSearch`, `selectLocation`). This makes it difficult to reason about the application state, test different loading/error combinations, and cleanly manage the lifecycle of search requests.

Evidence:
- `home.component.ts:140-142` - `loading`, `errorMsg`, `flightResults` state defined directly.
- `home.component.ts:754-820` - `triggerDynamicSearch()` manually manages loading flags, parses parameters, calls `RutasService.searchFlights()`, and mutates results, blurring the UI and data boundaries.
- `mobile-app.component.ts:139-145` - Navigation intent (query params) is observed and passed down, coupling routing logic to component inputs (`initialIntent`).

## Scope
**In Scope:**
- Setup of Angular 21 Vitest test infrastructure (`@angular/build:unit-test` + jsdom).
- Creation of `ShipmentSearchFacade` using Angular v21 Signals (`signal`, `computed`).
- Extracting state definitions and observable sequence management into a purely additive facade.
- Model both `searchFlights` and `getUpcomingRoutes` paths explicitly through typed commands, completely avoiding `any`.
- Define explicit `switchMap` observable ownership via a discriminated `SearchRequest` subject.
- Enforce strict response normalization using `unknown` for the raw payload.

**Out of Scope:**
- Modifications to Partner code.
- UI redesign or layout changes.
- Map logic rewrite or map marker binding changes.
- Backend API contract modifications.
- **Home Integration:** T22 is purely additive. `HomeComponent` will not consume the facade yet. T23-T25 will handle integration.

## State Model (Angular Signals) & DTOs
All state will be strictly typed. No `any` is allowed. Current API payload is treated as `unknown` and normalized. T26 will centralize these contracts in a data-access layer.

```typescript
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

// Commands
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

type SearchRequest = 
  | { type: 'municipality'; command: MunicipalityRouteSearchCommand }
  | { type: 'point'; command: PointRouteSearchCommand };
```

**Invariants:**
- `status` is mutually exclusive.
- Modes (`idle`, `discovery`, `municipality-routes`, `point-routes`) can exist without contradiction.
- If `status === 'error'`, `error` must be non-null.
- A destination-only selection is a valid state for municipality discovery (no HTTP).
- Origin reselection is repeatable.
- `reset` advances cancellation and restores initial state.
- Selection setters never perform HTTP themselves; search methods require explicit typed commands.

## Proposed Public API & Observable Ownership
```typescript
@Injectable({ providedIn: 'root' })
export class ShipmentSearchFacade {
  private readonly _state = signal<ShipmentSearchState>(initialState);
  
  // State Selectors
  public readonly state = this._state.asReadonly();
  readonly status = computed(() => this._state().status);
  readonly mode = computed(() => this._state().mode);
  readonly results = computed(() => this._state().results);
  readonly error = computed(() => this._state().error);
  readonly origin = computed(() => this._state().origin);
  readonly destination = computed(() => this._state().destination);

  // Observable Subject
  private readonly request$ = new Subject<SearchRequest>();

  constructor(private rutasService: RutasService) {
    // switchMap handles cancellation natively. Any new request (municipality or point) 
    // will cancel the preceding request, preventing stale response overwriting.
    this.request$.pipe(
      // switchMap logic connecting to RutasService
    ).subscribe(/* state mutation */);
  }

  // Commands / Actions
  setOrigin(origin: Partial<LocationSelection>): void;
  setDestination(dest: Partial<LocationSelection>): void;
  setFilters(date: string, time: string): void;
  
  // Queries
  searchMunicipalityRoutes(command: MunicipalityRouteSearchCommand): void;
  searchPointRoutes(command: PointRouteSearchCommand): void;
  
  reset(): void;

  // Private adapter for raw response
  private normalizeResponse(payload: unknown): RouteResultSummary[] { ... }
}
```

The current `RouteSearchParams` omits snake_case fields actually sent by
`HomeComponent`, while `PointAwareRouteSearchParams` represents point names
despite its generic property names; both service responses are `any`. T22 must
treat those responses as `unknown`, validate them, and map point names—not
IDs—to `getUpcomingRoutes`, without changing the backend. T26 will move these
temporary adapter types to `data-access/contracts`.

## Contract-Preservation Strategy
- **Query Params:** T22 is additive and doesn't change `HomeComponent` behavior. Later tickets will map intents (`buscar=destino`, `empresa`, `vista=mapa`, etc.) to facade logic.
- **Events:** T22 makes no UI changes. 

## Decomposition Slices

### Slice 0: Test Infrastructure Prerequisite
- **Files:** `frontend/angular.json`, `frontend/tsconfig.spec.json`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/test-harness.spec.ts`
- **Criteria:** 
  1. Add `@angular/build:unit-test` with Vitest and jsdom support.
  2. The `package-lock.json` is updated and mandatory.
  3. Add script `"test:ci": "ng test --watch=false"` and a minimal smoke test proving the harness executes.
- **Verification:** `cd frontend; npm run test:ci` and `npm run build`
- **Dependencies:** None.
- **Rollback:** Revert the slice commit.

### Slice 1: Facade Creation & State Tests
- **Files:** `frontend/src/app/features/home/shipment-search.facade.ts`, `frontend/src/app/features/home/shipment-search.facade.spec.ts`
- **Criteria:** 
  1. Facade service created with private writable signal and `SearchRequest` subject.
  2. Command parameters map to appropriate HTTP calls (`searchFlights` vs `getUpcomingRoutes`) with `unknown` payload normalization.
  3. Observable sequence enforces `switchMap` cancellation logic.
- **Verification:** `cd frontend; npm run test:ci -- --include=src/app/features/home/shipment-search.facade.spec.ts ; npm run build` (If CLI option fails, `npm run test:ci` is authoritative).
- **Dependencies:** Slice 0.
- **Rollback:** Revert the slice commit.

## Test Matrix
The `shipment-search.facade.spec.ts` must cover:
1. **Initial:** Status is 'initial', results empty, mode 'idle'.
2. **Loading:** Dispatching search commands changes status to 'loading'.
3. **Municipality Search Success:** Command correctly populates results and changes mode to `municipality-routes`.
4. **Point Search Success:** Command correctly populates results and changes mode to `point-routes`.
5. **Empty:** Valid empty mock response changes status to 'empty'.
6. **Error:** Failed API call normalizes to user-safe error state.
7. **Destination Selected:** Setting destination sets discovery mode without HTTP request.
8. **Invalid Raw Response Normalization:** Payload missing expected fields fails gracefully via type guards.
9. **Cross-kind Stale Sequence:** A municipality request followed by a point request cancels the first, preventing stale overwrite.
10. **Reset During In-Flight:** Dispatching `reset()` invalidates active requests and restores initial state.

## Risks & Exit Criteria
**Exit Criteria:**
- The Vitest/jsdom test harness is functional.
- The additive `ShipmentSearchFacade` is fully typed (no `any`), fully unit-tested, and implements `switchMap` cancellation logic.
- Zero production consumers are modified (Home migration occurs in T23-T25).
- `git diff --check` passes with no whitespace errors.

***

**References:**
- https://angular.dev/guide/testing
- https://angular.dev/guide/testing/migrating-to-vitest

**NOTE:** This spec is not authorization to implement code until Codex audit.
