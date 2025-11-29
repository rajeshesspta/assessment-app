# Attempts Module Notes

Partition key candidates: /tenantId#assessmentId#userId or shard bucket for high concurrency.
Responses may embed if total size < 2MB else split into container keyed by attemptId. Short-answer items keep attempts in `submitted` status and require external evaluators (manual or AI rubric) to publish scores after consuming the `ShortAnswerEvaluationRequested` events.
