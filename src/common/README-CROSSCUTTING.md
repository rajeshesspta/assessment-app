# Cross-Cutting Foundations (MVP)

- Auth: API key via header `x-api-key`.
- Tenant Enforcement: header `x-tenant-id` stored on request object.
- Event Bus: In-memory pub/sub; replace with broker later (Kafka / Service Bus).
- Logging: Pino; structured JSON.
- Config: Simple loader; evolve to layer secrets (Key Vault) and feature flags.
- Scoring: Simple MCQ; pluggable strategy service planned.
- Analytics: Basic in-memory aggregate; evolve to async projections.
- Evolution Path: Introduce repository interfaces, outbox pattern, Cosmos DB persistence, partition keys per domain, OpenTelemetry instrumentation.
