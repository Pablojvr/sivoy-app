# Spec: T47 MapLibre v6 Security Upgrade

> **Notice:** This spec is not an authorization to proceed with implementation until approved by the Codex audit.

## 1. Threat Statement & Scope

**Threat:**
The current dependency `maplibre-gl` (`^5.24.0`) contains a critical XSS vulnerability (GHSA-jrc7-96c5-q579) affecting versions `<=6.4.0`. This is resolved in version `6.8.0` via a major upgrade.

**Scope:**
- Upgrade `maplibre-gl` dependency to the bounded safe v6 range `^6.8.0`.
- Update imports to namespace or named ESM imports.
- Configure explicit Angular bundler worker strategy based on verified exports.
- **Out of Scope:** Production deployment, `npm audit fix --force`, and intentional functionality/style work on the Partner app (it is only compile-smoke-tested as an existing consumer of the shared map adapter).

## 2. Bounded Implementation Slice

**Maximum 4 files permitted for editing:**
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/app/core/maps/sivoy-map.ts`
- *Optional: `frontend/src/app/core/maps/sivoy-map.spec.ts` (if targeted spec adjustments are feasible)*

**Technical Requirements:**
- **Version:** Pin `maplibre-gl` to `^6.8.0`; do not use an unbounded range or `npm audit fix --force`.
- **Imports:** Replace default imports with namespace or named ESM imports (e.g., `import * as maplibregl from 'maplibre-gl';`).
- **Worker Strategy:** Set the worker URL explicitly for the Angular bundler based on official v6 migration docs. You must inspect the installed package exports/artifacts and verify runtime network/console evidence. Do not invent an unverified worker URL.
- **WebGL2 Compatibility:** Record v6's WebGL2-only boundary and verify the list-first flow before map activation. Graceful initialization failure requires broader lifecycle changes and belongs to **T27**, not this security slice.

## 3. Acceptance Criteria

**Criteria 1: Security and Build Validation**
Run the following exact commands to verify the vulnerability is removed, tests pass, and no unintended whitespace/diff issues exist:
```sh
cd frontend
npm install "maplibre-gl@^6.8.0" --save
npm audit --omit=dev --audit-level=critical
npm run test:ci
npm run build
cd ..
git diff --check
```

**Criteria 2: Browser Smoke Test & Worker Verification**
Launch the application locally and trigger the local MapLibre fallback (when no Mapbox token is present). Open browser DevTools to verify:
- No network 404 errors for the MapLibre worker script.
- Console shows no initialization or worker loading errors.
- Basic map interactivity (zoom, pan) and markers are pinned and functioning correctly.

**Criteria 3: WebGL2 Boundary Recorded**
Verify the list-first landing and destination search before opening the optional map. Record MapLibre v6's WebGL2 requirement and the current failure behavior as an explicit T27 acceptance item; do not expand this security slice into map lifecycle restructuring.

## 4. Rollback Strategy
Any necessary rollback must be performed by a **reviewed revert** (e.g., `git revert`). Do not use `git checkout` or `git reset` to alter commit history.
