# T27 Map Port and Recoverable Fallback

## Context

The public shell still creates MapLibre/Mapbox objects directly. Search and result cards must remain usable when the browser cannot create the required WebGL2 context.

## Decision

Migrate incrementally:

1. Detect and cache WebGL2 capability without touching browser globals during SSR.
2. Define a renderer-neutral port and a MapLibre adapter.
3. Gate map initialization and expose a recoverable list-first state.
4. Move marker/listener lifecycle to T28 instead of expanding the T27 port with UI ownership.

## Status

T27a-T27c accepted after independent audit; T27d1-T27d2 completed, rest of T27d remains in progress.

## T27d2 evidence

- Internalized asynchronous styling into `MapLibreMapAdapter` instead of exposing a readiness API on the port.
- `drawRouteLine` safely defers route requests if the style is not loaded, holding only the most recent immutable request and registering at most one `load` listener.
- `removeRouteLine` and `destroy` cleanly cancel pending style-load listeners and discard pending requests.
- All edge cases, including mutation isolation, idempotent destruction, and deferred overwrites, are validated with mocked unit tests.

## T27d1 evidence

- Introduced standalone geo-distance utility implementing Haversine.
- Distance calculation validates numeric finiteness and geospatial boundaries.
- Replaced mapRuntime.LngLat(...).distanceTo in MobileApp with the pure utility function without modifying map initialization.

## T27a evidence

- Capability checks are cached for both supported and unsupported browsers.
- SSR, null contexts, canvas failures and context failures are covered.
- The detector does not import MapLibre, Mapbox or use global `window`/`document`.

## T27b evidence

- The public port exposes typed navigation, lifecycle events, route drawing and opaque marker handles without MapLibre types.
- The MapLibre adapter retains the SiVoy raster style and safely handles repeated route updates, incompatible source collisions and teardown.
- Popup content is built with DOM text nodes rather than raw HTML.
- Event and marker listeners return explicit disposal functions for T28 lifecycle ownership.

## T27c evidence

- The public shell checks WebGL2 capability before rendering or initializing the interactive map.
- Unsupported browsers and initialization failures remain in the list-first flow with a dismissible status message; searches, result cards and sharing remain available.
- Map-only controls are absent when the renderer is unavailable, and entry points abort before mutating the active search or selection.
- The normal interactive-map flow was exercised in the local browser, including its route back to the home screen.
- The fallback browser path is supported by the detector tests and structural audit. Browser automation could not disable WebGL before Angular bootstrap, so no unsupported-WebGL manual run is claimed.
- Independent validation: 178 tests passed, production build passed, and the 80 kB component-style error budget remained unchanged.
