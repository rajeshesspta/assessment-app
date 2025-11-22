# Analytics Evolution

MVP: synchronous aggregation by scanning in-memory attempts.
Future: project AttemptScored events into dedicated read model container (Cosmos DB) keyed by tenantId#assessmentId#dateBucket for fast slice queries.
