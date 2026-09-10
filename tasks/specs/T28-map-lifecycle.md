# T28 Renderer-neutral map lifecycle

## Objective

Give one renderer-neutral owner responsibility for public-map markers and event cleanup. The manager must not know Angular, Home, Admin, search rules, Partner or MapLibre.

## Planned slices

1. T28a: lifecycle manager contract and exhaustive isolated tests.
2. T28b: migrate primary markers, metadata and DOM click listeners from `MobileAppComponent`.
3. T28c: migrate user, custom-destination and preview auxiliary markers and drag listeners.
4. T28d: migrate map-event and picker-scoped disposers, then remove legacy ownership fields and audit browser behavior.

Timers and `ResizeObserver` remain component responsibilities because their lifecycle belongs to Angular rendering rather than the map renderer.

## T28a status

Accepted after independent audit. The generic manager owns primary and keyed auxiliary markers, typed metadata snapshots, DOM and drag listener disposal, map-event disposers, scoped disposers and an idempotent teardown. Construction failures cannot register partial state, and cleanup continues when an integration disposer throws.

Evidence: 211 tests passed, the production build passed, and the boundary scan found no renderer, Angular, Partner, timer, `any` or console coupling.

## T28b status

Accepted after independent audit. `MobileAppComponent` delegates creation, metadata, DOM click ownership, clearing, style iteration and coordinate snapshots for every primary marker to `MapLifecycleManager`.

The component currently retains transitional ownership of user, custom-destination and preview auxiliary markers, map-event listeners and the picker listener. Accordingly, component teardown calls `clearPrimaryMarkers()` and still destroys the `MapPort` directly; it must not call the manager's full `destroy()` until T28c and T28d transfer those remaining resources.

Evidence: 211 tests passed, the production build passed, and `git diff --check` found no whitespace errors. The existing CSS budget and legacy Partner `mapbox-gl` CommonJS warnings remain unchanged and outside this slice.
