# Attempts Module Notes

Partition key candidates: /tenantId#assessmentId#userId or shard bucket for high concurrency.
Responses may embed if total size < 2MB else split into container keyed by attemptId.
