# T32: Versioned Internal Events Envelope

State: accepted by Codex
evidence: 14 focused / 30 full backend tests, diff-check clean; mention no bus/producers/outbox.

## Context
Implement a strictly validated, deeply immutable envelope for internal events to standardise module communication data structures in the modular monolith. No broker or outbox is included.

## Acceptance Criteria
1. `createInternalEvent` enforces strict schema constraints: lowercase dot-separated `.vN` (N>=1) type, non-blank source, strictly RFC 4122 compliant `eventId`/canonical ISO `occurredAt`, and returns a stable `INVALID_INPUT` code for invalid/null/non-object input.
2. The payload must be strictly JSON-safe (plain objects, nested arrays, primitives) and must securely reject unsupported types (e.g., Date, undefined, functions, symbols, bigint, NaN/Infinity, circular references, non-enumerable properties, getters/setters) to prevent prototype pollution.
3. The function returns a fully independent, deeply immutable snapshot of the payload (caller's payload remains mutable), verified by comprehensive `node:test` coverage for all constraints, exact shape, and privacy defaults.

## Execution Commands
- `node --test test/internal-event.test.js`
- `npm test`
- `git diff --check`
