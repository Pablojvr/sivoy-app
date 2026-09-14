# T34a: Observability Middleware

## Acceptance Criteria

1. **Request Tracking & Logging**: The middleware accepts or generates a valid RFC4122 UUID (v1-8, variant 89ab) for `x-request-id`, echoes it in the response, and outputs exactly one JSON log upon response completion with stable bounded fields. Sensitive fields are explicitly omitted.
2. **In-Memory RED Metrics**: Metric state captures grouped request counts, error counts, and an explicitly cumulative fixed-bucket latency histogram keyed by bounded method/route/status class (rule: req.baseUrl + req.route.path). Snapshots are detached and immutable, without unbound storage of raw durations.
3. **Resilience & Testing**: The system ensures safe fallback for injected failures/sinks, registers exactly one finish listener via `once`, and is mounted exclusively on `/api`. The behavior is fully verified with deterministic and real HTTP integration tests.

## Commands

- `cd backend && node --test test/http-observability.test.js`
- `cd backend && npm test`
- `node --check backend/server.js`
- `git diff --check`

## State

T34 unchecked / T34a accepted by Codex and evidence 12 focused subtests / 43 full backend tests, real Express route test, server check/diff check.
