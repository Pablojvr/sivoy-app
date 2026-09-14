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

## State

T34 open / T34b2b pending.
T34a accepted by Codex and evidence 12 focused subtests / 43 full backend tests, real Express route test, server check/diff check.
T34b1 accepted by Codex and evidence 10 observability-route subtests / 54 full backend, server/diff checks.
T34b2a accepted by Codex and evidence independent 64-test audit.
