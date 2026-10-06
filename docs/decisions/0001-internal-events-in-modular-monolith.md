# 0001. Internal Events in Modular Monolith

Date: 2026-09-13
Status: Accepted

## Context
As SiVoyApp transitions to a modular monolith architecture, we need a standardized way for modules to represent state changes (events). However, introducing heavy eventing infrastructure like a message broker or outbox prematurely can compromise same-transaction consistency and add significant operational complexity.

## Decision
We will introduce an **executable internal-event envelope** only.
This slice defines the data structure for events but introduces NO event bus, listeners, producers, broker, outbox, company rename sync, or fake business events.
Events will be represented as deeply immutable independent snapshots with versioned semantic types, strong validation, and distinct privacy levels.
The payload must be strictly JSON-safe (no Date, circular references, undefined, functions, symbols, bigint, NaN/Infinity) to guarantee serializability.
We explicitly exclude partner integrations from this initial scope.

## Rejected Alternatives
1. **Message Broker (Kafka, RabbitMQ, etc.):** Overkill for the current modular monolith scale. Adds operational overhead and network failure modes to internal module communication.
2. **Outbox Pattern Now:** Unnecessary at this stage since we don't have an asynchronous processor or broker to publish to.
3. **EventEmitter for transactional consistency:** EventEmitter hides control flow, making same-transaction consistency harder to trace and debug compared to explicit function calls. Events must never replace same-transaction consistency, ETA/search responses, nor should they be used for Cloudinary URL creation (which is synchronous because the response needs the definitive URL, though not transactionally consistent).

## Consequences
- Modules can define what an event looks like in a standardized way.
- Domain logic relies on direct function calls for synchronous, same-transaction consistency. We do not claim events currently decouple modules because no producer or event bus exists.
- Payload definition must be strict (JSON-safe plain objects, nested arrays, and primitives) to ensure serialization compatibility if we ever adopt distributed eventing. The immutable snapshot prevents accidental mutation by callers or middleware.
- The `type` naming convention ensures schema evolution is explicit (`.vN`).
- **T33 Resolution**: As confirmed during the secondary jobs audit (T33), there are currently no genuine independent producers/consumers (analytics, async notifications, separate search indexers) in the applicable scope. Emitting unused events is intentionally avoided as a no-op migration to prevent cognitive overhead, false decoupling, and loss of synchronous flow traceability. All existing secondary-like actions (browser-native sharing, Cloudinary URLs, ETA lookups) remain direct and user-awaited. Cloudinary and ETA remain direct/synchronous because the request requires its result, not because of transactional consistency.

## Explicit Criteria that would justify Outbox later
1. A genuine need for asynchronous, reliable cross-boundary processing where same-transaction consistency is either impossible (e.g., interacting with a third-party API that shouldn't block the transaction) or degrades performance beyond SLAs.
2. The introduction of external read models or search indexing (e.g., Elasticsearch) that require asynchronous eventual consistency.
3. Decoupling distinct bounded contexts into separate physical deployment units (microservices).
