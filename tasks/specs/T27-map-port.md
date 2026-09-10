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

T27a accepted after independent audit; T27b-T27d remain in progress.

## T27a evidence

- Capability checks are cached for both supported and unsupported browsers.
- SSR, null contexts, canvas failures and context failures are covered.
- The detector does not import MapLibre, Mapbox or use global `window`/`document`.
