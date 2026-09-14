# T34a: Observability Middleware

## Acceptance Criteria

1. **Request Tracking & Logging**: The middleware accepts or generates a valid RFC4122 UUID (v1-8, variant 89ab) for `x-request-id`, echoes it in the response, and outputs exactly one JSON log upon response completion with stable bounded fields. Sensitive fields are explicitly omitted.
2. **In-Memory RED Metrics**: Metric state captures grouped request counts, error counts, and an explicitly cumulative fixed-bucket latency histogram keyed by bounded method/route/status class (rule: req.baseUrl + req.route.path). Snapshots are detached and immutable, without unbound storage of raw durations.
3. **Resilience & Testing**: The system ensures safe fallback for injected failures/sinks, registers exactly one finish listener via `once`, and is mounted exclusively on `/api`. The behavior is fully verified with deterministic and real HTTP integration tests.

# T34b1: Safe Health and Metrics Exposure

## Acceptance Criteria

1. **Health Endpoint**: `GET /api/health` is public and returns exactly `{"status": "ok"}`, explicitly avoiding exposure of DB, environment, version, or host details.
2. **Metrics Security**: `GET /api/metrics` is only registered when `METRICS_TOKEN` is configured and nonblank. It requires a precise token match using `Authorization: Bearer <exact_token>`. Token is securely compared using `timingSafeEqual` over hashes to safely prevent length leaks on unequal sizes, and never logged.
3. **Detached Operational Exposure**: A correct token returns a detached snapshot with `Cache-Control: no-store`. Invalid/missing tokens return `404` to avoid route advertising. Operational routes are registered before the observability middleware so they do not pollute the metrics themselves.

## Commands

- `cd backend && node --test test/http-observability.test.js`
- `cd backend && node --test test/observability-routes.test.js`
- `cd backend && npm test`
- `node --check backend/server.js`
- `git diff --check`

# T34b2a: Structured Controller Error Logs

## Acceptance Criteria

1. **Frozen Narrow API**: `req.log` is injected as an immutable object exposing only `error(event, errorCode)` and `warn(event, errorCode)`. Invalid names are normalized; the API accepts no arbitrary context object, message, stack, body, URL or headers.
2. **Safe Logging Sink**: Warning and error events emit one allowlisted JSON record containing a canonical timestamp, their explicit level, `requestId`, normalized method, resolved route, validated `event` and `errorCode`. Invalid names become `unknown_event` and `unknown_code` without echoing attacker input; timestamp or sink failures never break the request.
3. **Controller Refactoring & Coverage**: Every `console.error` in `rutas.controller.js` is replaced by `req.log.warn` for handled validation/not-found branches and `req.log.error` for internal failures. HTTP status/body contracts remain unchanged, and tests distinguish the logger method used by every catch branch while restoring mocks.

# T34b2b: Structured Controller Error Logs (Mapas & Ubicaciones)

## Acceptance Criteria

1. **Ubicaciones Logs**: Replace `console.error` in `ubicaciones.controller.js`. Instrument silent `testLocation` catch via `req.log`. 404 (`location_not_found`) and 400 (`validation_error`) use `req.log.warn`; 500 (`internal_error`) uses `req.log.error`. Fixed event names per endpoint. No `e.message`/`e.code` in logs. Preserve exact HTTP status/body contracts.
2. **Mapas Logs**: Replace `console.error` in `mapas.controller.js`. Missing link input or integer `statusCode` values from 400 through 499 use `req.log.warn` with `validation_error` or `maps_request_rejected`. Every other provider failure uses `req.log.error` with `maps_provider_error`. Fixed events, no `e.message`/`e.code`. Preserve exact HTTP status/body contracts.
3. **Resilience & Testing**: Tests safely mock both services and distinguish warn/error for every catch branch including silent testLocation. Assert no console error. Restore all globals/methods. Avoid parallel/global mock leaks.

## State

T34 global abierto / T34b2c diferido por exclusión de Partners, no completado.
T34c1 accepted by Codex with 23 focused subtests / 107 full backend tests, syntax and diff checks passed.
T34a accepted by Codex and evidence 12 focused subtests / 43 full backend tests, real Express route test, server check/diff check.
T34b1 accepted by Codex and evidence 10 observability-route subtests / 54 full backend, server/diff checks.
T34b2a accepted by Codex and evidence independent 64-test audit.
T34b2b accepted by Codex and evidence 17 subtests for mapas/ubicaciones / 83 full backend tests, node/diff checks passed.

# T34c1: Process Logger (Core TDD)

## Acceptance Criteria

1. **Frozen Narrow API**: Exposes `createProcessLogger(options)`. The API only allows logging `info`, `warn`, and `error` passing an event, an optional error code, and an optional fields object.
2. **Safe Logging Sink**: Events and error codes are checked against strict allowlists (e.g. `server_startup_success`, `database_error`). Invalid inputs fallback to `unknown_event` or `unknown_code` without echoing the input. The only allowed field is `port` (integer 1..65535). Emits one JSON record to stdout/stderr.
3. **Resilience & Testing**: Clock failures, UUID generation failures, and sink/serialization failures never propagate. The fallback is deterministic. The object is deep-frozen before passing to the sink. Contractual branch coverage for each level and fallback without throwing exceptions, including partial sinks.

# T34c2: Process Logger Adoption (Server & Database)

## Acceptance Criteria

1. **Database Runtime**: Export `createDatabaseRuntime(options)` injecting `PoolCtor` and `logger`, keeping `getDB`, `runInTransaction`, and `withTransaction` working as a default lazy singleton. If `new PoolCtor` throws, it must not assign the singleton and must not emit `db_pool_connected`, allowing subsequent attempts to retry. Log `db_pool_connected` exactly once without error code. Failed transactions log `db_rollback_failed` and `database_error` securely, preserving and rethrowing the original error.
2. **Server Startup**: Extract `startServer(options)` injecting dependencies. On success, log `server_startup_success` exactly once with the original valid integer `port` field. The `port` must not be parsed with a permissive `parseInt`; only valid integers 1-65535 or strictly canonical decimal strings resolving to 1-65535 are accepted for the `port` log field (otherwise omitted). On success, `application.listen` must be called with the exact unmutated original `port` value. On failure (including sync throws or async rejections from `getDatabase`), `application.listen` is never called, log `server_startup_failed` without raw error, and call injected `exit(1)` (verified via `options.exit !== undefined`). Auto-starts only if `require.main === module`. Zero `console.log`/`console.error`.
3. **Resilience & Testing**: Verify all success and failure branches without network/global mocks. Validate injected functions to prevent surprising failures. Legacy exports `getDB`/`runInTransaction`/`withTransaction` must be tested to ensure they are functions without actually invoking them against a DB. Test that both synchronous throws and asynchronous rejections from `getDatabase` correctly log and exit. Test that `listen` receives the original unmodified port, and that invalid canonical string representations (e.g. `03000`) or strings with extra characters are omitted from logs.

## State

T34c2 accepted by Codex with 17 focused tests / 122 full backend tests, clean structured test output, syntax and diff checks passed.
